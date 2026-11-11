// npm run eval — measures the scanner against fixtures/eval/*.json
//
// Prints precision, recall and false-positive rate, plus every case that missed.
// Real skills (benign.json) are fetched from GitHub at pinned commits and cached
// in .eval-cache/ so reruns are offline. Pass --refresh to refetch.
//
// Nothing fetched or loaded here is ever executed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchSkill, getCommit, getTree, LIMITS, stitchPartial } from "../src/lib/github";
import { scanFiles, type Severity, type SkillFile } from "../src/lib/scanner";
import { SEVERITY_RANK } from "../src/lib/scanner/util";

type Risk = Severity | "none_found";
type Segment = string | { repeat: string; times: number };
type Line = Segment | Segment[];

interface Case {
  id: string;
  note?: string;
  catchBy?: string;
  layer?: "gap";
  fetch?: boolean;
  files: Record<string, Line[]>;
  expect: { rules?: string[]; minRisk?: Severity; maxRisk?: Severity };
}

const ROOT = join(import.meta.dirname, "..");
const FIX = join(ROOT, "fixtures", "eval");
const CACHE = join(ROOT, ".eval-cache");
const refresh = process.argv.includes("--refresh");

const rank = (r: Risk) => (r === "none_found" ? -1 : SEVERITY_RANK[r]);
const atLeast = (r: Risk, s: Severity) => rank(r) >= SEVERITY_RANK[s];
const pct = (n: number, d: number) => (d === 0 ? "—" : `${((100 * n) / d).toFixed(0)}%`);

function seg(s: Segment): string {
  return typeof s === "string" ? s : s.repeat.repeat(s.times);
}

function buildFiles(c: Case): SkillFile[] {
  return Object.entries(c.files).map(([path, lines]) => {
    const content = lines.map((l) => (Array.isArray(l) ? l.map(seg).join("") : seg(l))).join("\n");
    if (!c.fetch) return { path, content };
    // same limits the GitHub fetcher applies
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes <= LIMITS.maxFileBytes) return { path, content };
    const buf = Buffer.from(content, "utf8");
    const head = buf.subarray(0, LIMITS.partialBytes).toString("utf8");
    const tail = buf.subarray(buf.length - LIMITS.tailBytes).toString("utf8");
    return { path, content: stitchPartial(head, tail), totalBytes: bytes };
  });
}

function loadCases(name: string): Case[] {
  return (JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8")) as { cases: Case[] }).cases;
}

// ---------- real skills ----------

interface Source {
  repo: string;
  sha: string;
  pick: number;
  group: "general" | "security";
}
interface RealSkill {
  id: string;
  group: Source["group"];
  files: SkillFile[];
}

function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

async function loadReal(): Promise<RealSkill[]> {
  const { sources } = JSON.parse(readFileSync(join(FIX, "benign.json"), "utf8")) as { sources: Source[] };
  mkdirSync(CACHE, { recursive: true });
  const out: RealSkill[] = [];

  for (const s of sources) {
    const cacheFile = join(CACHE, `${s.repo.replace("/", "__")}@${s.sha.slice(0, 12)}-${s.pick}.json`);
    if (!refresh && existsSync(cacheFile)) {
      out.push(...(JSON.parse(readFileSync(cacheFile, "utf8")) as RealSkill[]));
      continue;
    }
    process.stderr.write(`fetching ${s.repo} … `);
    const head = await getCommit(s.repo, s.sha);
    const { entries } = await getTree(s.repo, head.treeSha);
    const dirs = [
      ...new Set(
        entries
          .filter((e) => e.type === "blob" && (e.path.split("/").pop() ?? "").toLowerCase() === "skill.md")
          .map((e) => (e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "")),
      ),
    ].sort();
    const picked: RealSkill[] = [];
    for (const dir of sample(dirs, s.pick)) {
      const f = await fetchSkill(s.repo, head, { dir, entries });
      picked.push({ id: `${s.repo}/${dir}`, group: s.group, files: f.files });
    }
    writeFileSync(cacheFile, JSON.stringify(picked));
    process.stderr.write(`${picked.length} skills\n`);
    out.push(...picked);
  }
  return out;
}

// ---------- run ----------

interface Outcome {
  id: string;
  risk: Risk;
  rules: string[];
  pass: boolean;
  why?: string;
}

function runCase(c: Case): Outcome {
  const r = scanFiles(buildFiles(c));
  const rules = [...new Set(r.findings.map((f) => f.rule))];
  const e = c.expect;
  const missingRules = c.layer === "gap" ? [] : (e.rules ?? []).filter((x) => !rules.includes(x));
  const problems: string[] = [];
  if (missingRules.length) problems.push(`missing ${missingRules.join(", ")}`);
  if (e.minRisk && !atLeast(r.riskLevel, e.minRisk)) problems.push(`risk ${r.riskLevel} < ${e.minRisk}`);
  if (e.maxRisk && rank(r.riskLevel) > SEVERITY_RANK[e.maxRisk]) problems.push(`risk ${r.riskLevel} > ${e.maxRisk}`);
  return { id: c.id, risk: r.riskLevel, rules, pass: problems.length === 0, why: problems.join("; ") };
}

function topRules(files: SkillFile[]) {
  const r = scanFiles(files);
  const counts = new Map<string, number>();
  for (const f of r.findings) counts.set(`${f.rule} (${f.severity})`, (counts.get(`${f.rule} (${f.severity})`) ?? 0) + 1);
  return { risk: r.riskLevel, rules: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`) };
}

async function main() {
  const risky = loadCases("risky").map(runCase);
  const adversarial = loadCases("adversarial");
  const adv = adversarial.map(runCase);
  const tricky = loadCases("tricky").map(runCase);
  const gapCases = [...loadCases("gaps"), ...adversarial.filter((c) => c.layer === "gap")];
  const gaps = gapCases.map(runCase);
  const real = await loadReal();
  const realResults = real.map((s) => ({ ...s, ...topRules(s.files) }));
  const general = realResults.filter((s) => s.group === "general");
  const security = realResults.filter((s) => s.group === "security");

  const harmful = [...risky, ...adv.filter((_, i) => adversarial[i].layer !== "gap")];
  const harmfulAll = [...harmful, ...gaps];

  const lines: string[] = [];
  const p = (s = "") => lines.push(s);

  p(`## Scanner eval — ${new Date().toISOString().slice(0, 10)}`);
  p();
  p(`Harmful cases: ${harmful.length} written to be caught + ${gaps.length} known gaps · Harmless cases: ${tricky.length} tricky + ${general.length} real skills · Dual-use real skills: ${security.length}`);
  p();
  p("| Threshold | Recall (catchable) | Recall (incl. gaps) | False positives, real skills | False positives, tricky | Precision |");
  p("|---|---|---|---|---|---|");
  for (const t of ["medium", "high"] as const) {
    const tp = harmful.filter((o) => atLeast(o.risk, t)).length;
    const tpAll = harmfulAll.filter((o) => atLeast(o.risk, t)).length;
    const fpReal = general.filter((s) => atLeast(s.risk, t)).length;
    const fpTricky = tricky.filter((o) => atLeast(o.risk, t)).length;
    const fp = fpReal + fpTricky;
    p(
      `| ${t}+ | ${tp}/${harmful.length} (${pct(tp, harmful.length)}) | ${tpAll}/${harmfulAll.length} (${pct(tpAll, harmfulAll.length)}) | ${fpReal}/${general.length} (${pct(fpReal, general.length)}) | ${fpTricky}/${tricky.length} | ${pct(tpAll, tpAll + fp)} |`,
    );
  }
  p();
  p(`Exact expectations met (right rules and severity): risky ${risky.filter((o) => o.pass).length}/${risky.length}, adversarial ${adv.filter((o, i) => o.pass && adversarial[i].layer !== "gap").length}/${harmful.length - risky.length}, tricky ${tricky.filter((o) => o.pass).length}/${tricky.length}`);
  p();

  const misses = [
    ...risky.filter((o) => !o.pass).map((o) => ({ ...o, group: "risky" })),
    ...adv.filter((o, i) => !o.pass && adversarial[i].layer !== "gap").map((o) => ({ ...o, group: "adversarial" })),
    ...tricky.filter((o) => !o.pass).map((o) => ({ ...o, group: "tricky" })),
  ];
  p("### Cases that missed");
  p();
  if (misses.length === 0) p("None.");
  for (const m of misses) p(`- **${m.group}/${m.id}** — ${m.why} (found: ${m.rules.join(", ") || "nothing"})`);
  p();

  p("### Known gaps (expected to be missed for now)");
  p();
  p("| Case | Would be caught by | Result now |");
  p("|---|---|---|");
  for (const [i, o] of gaps.entries()) {
    const c = gapCases[i];
    p(`| ${o.id} | ${c.catchBy ?? "INJ-06 / LLM"} | ${o.pass ? "caught" : `missed (${o.risk})`} |`);
  }
  p();

  p("### Real skills flagged medium or higher");
  p();
  const flagged = realResults.filter((s) => atLeast(s.risk, "medium"));
  if (flagged.length === 0) p("None.");
  for (const s of flagged) p(`- [${s.group}] ${s.id} — **${s.risk}**: ${s.rules.slice(0, 4).join(", ")}`);
  p();
  p(
    `Dual-use security skills flagged: medium+ ${security.filter((s) => atLeast(s.risk, "medium")).length}/${security.length}, high+ ${security.filter((s) => atLeast(s.risk, "high")).length}/${security.length} (expected; reported for context, not counted as false positives)`,
  );

  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
