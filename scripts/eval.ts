// npm run eval            — rules only
// npm run eval -- --judge — rules + LLM judge, compared side by side
//
// Measures the scanner against fixtures/eval/*.json and prints precision, recall
// and false-positive rates plus every case that missed. Real skills (benign.json)
// are fetched from GitHub at pinned commits and cached in .eval-cache/. Judge
// answers are cached too, so a run stopped by the daily quota resumes next time.
// Pass --refresh to refetch skills. Nothing fetched or loaded here is executed.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { fetchSkill, getCommit, getTree, LIMITS, stitchPartial } from "../src/lib/github";
import { getJudge, JUDGE_PROVIDERS, type Judge, type JudgeProvider, QuotaError, runJudge } from "../src/lib/judge";
import { PROMPT_VERSION } from "../src/lib/judge/prompt";
import { SCANNER_VERSION, scanFiles, type Severity, type SkillFile } from "../src/lib/scanner";
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
const withJudge = process.argv.includes("--judge");

// One provider per run, never a fallback chain and never JUDGE_PROVIDERS: a run that mixed models
// would report numbers that belong to no single model. Default stays Groq.
//   npm run eval -- --judge                     (Groq)
//   npm run eval -- --judge --provider gemini   (Gemini; its answers are cached separately)
const provider: JudgeProvider = (() => {
  const eq = process.argv.find((a) => a.startsWith("--provider="));
  const i = process.argv.indexOf("--provider");
  const value = eq ? eq.slice("--provider=".length) : i >= 0 ? process.argv[i + 1] : "groq";
  if (!(JUDGE_PROVIDERS as readonly string[]).includes(value)) {
    throw new Error(`--provider must be one of: ${JUDGE_PROVIDERS.join(", ")}`);
  }
  return value as JudgeProvider;
})();
let judgeModel = "";
config({ path: join(ROOT, ".env.local"), quiet: true });

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

// ---------- judge (cached) ----------

interface Judged {
  risk: Risk;
  rules: string[];
  dropped: number;
  dualUse: boolean;
}

let quotaHit = false;
let judgeCalls = 0;

async function judgeCached(judge: Judge, files: SkillFile[]): Promise<Judged | null> {
  const key = createHash("sha256")
    .update(JSON.stringify([judge.model, SCANNER_VERSION, PROMPT_VERSION, files]))
    .digest("hex")
    .slice(0, 24);
  const dir = join(CACHE, "judge");
  const file = join(dir, `${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Judged;
  if (quotaHit) return null;

  const statics = scanFiles(files);
  try {
    judgeCalls++;
    const out = await runJudge(judge, files, statics.findings);
    const judged: Judged = {
      risk: out.riskLevel,
      rules: [...new Set(out.findings.map((f) => f.rule))],
      dropped: out.dropped.length,
      dualUse: out.dualUse,
    };
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(judged));
    return judged;
  } catch (e) {
    if (e instanceof QuotaError) {
      quotaHit = true;
      process.stderr.write(`\nquota reached (retry after ${e.retryAfterSeconds}s) — stopping judge calls for this run\n`);
      return null;
    }
    process.stderr.write(`\njudge failed: ${e instanceof Error ? e.message : String(e)}\n`);
    return null;
  }
}

// ---------- scoring ----------

interface Outcome {
  id: string;
  group: "risky" | "adversarial" | "tricky" | "gap" | "general" | "security";
  risk: Risk;
  rules: string[];
  expect?: Case["expect"];
  catchBy?: string;
  judged?: Judged | null;
}

function check(o: Outcome, risk: Risk, rules: string[]): { pass: boolean; why: string } {
  const e = o.expect ?? {};
  const problems: string[] = [];
  const missing = o.group === "gap" ? [] : (e.rules ?? []).filter((r) => !rules.includes(r));
  if (missing.length) problems.push(`missing ${missing.join(", ")}`);
  if (e.minRisk && !atLeast(risk, e.minRisk)) problems.push(`risk ${risk} < ${e.minRisk}`);
  if (e.maxRisk && rank(risk) > SEVERITY_RANK[e.maxRisk]) problems.push(`risk ${risk} > ${e.maxRisk}`);
  return { pass: problems.length === 0, why: problems.join("; ") };
}

function metricsTable(outcomes: Outcome[], pick: (o: Outcome) => Risk): string[] {
  const harmful = outcomes.filter((o) => o.group === "risky" || o.group === "adversarial");
  const harmfulAll = [...harmful, ...outcomes.filter((o) => o.group === "gap")];
  const general = outcomes.filter((o) => o.group === "general");
  const tricky = outcomes.filter((o) => o.group === "tricky");
  const rows = [
    "| Threshold | Recall (catchable) | Recall (incl. gaps) | False positives, real skills | False positives, tricky | Precision |",
    "|---|---|---|---|---|---|",
  ];
  for (const t of ["medium", "high"] as const) {
    const tp = harmful.filter((o) => atLeast(pick(o), t)).length;
    const tpAll = harmfulAll.filter((o) => atLeast(pick(o), t)).length;
    const fpReal = general.filter((o) => atLeast(pick(o), t)).length;
    const fpTricky = tricky.filter((o) => atLeast(pick(o), t)).length;
    rows.push(
      `| ${t}+ | ${tp}/${harmful.length} (${pct(tp, harmful.length)}) | ${tpAll}/${harmfulAll.length} (${pct(tpAll, harmfulAll.length)}) | ${fpReal}/${general.length} (${pct(fpReal, general.length)}) | ${fpTricky}/${tricky.length} | ${pct(tpAll, tpAll + fpReal + fpTricky)} |`,
    );
  }
  return rows;
}

async function main() {
  const outcomes: Outcome[] = [];
  const inputs = new Map<Outcome, SkillFile[]>();

  const addCases = (name: string, group: Outcome["group"], filter: (c: Case) => boolean = () => true) => {
    for (const c of loadCases(name).filter(filter)) {
      const files = buildFiles(c);
      const r = scanFiles(files);
      const o: Outcome = {
        id: c.id,
        group,
        risk: r.riskLevel,
        rules: [...new Set(r.findings.map((f) => f.rule))],
        expect: c.expect,
        catchBy: c.catchBy,
      };
      outcomes.push(o);
      inputs.set(o, files);
    }
  };
  addCases("risky", "risky");
  addCases("adversarial", "adversarial", (c) => c.layer !== "gap");
  addCases("adversarial", "gap", (c) => c.layer === "gap");
  addCases("gaps", "gap");
  addCases("tricky", "tricky");

  for (const s of await loadReal()) {
    const r = scanFiles(s.files);
    const o: Outcome = { id: s.id, group: s.group, risk: r.riskLevel, rules: [...new Set(r.findings.map((f) => f.rule))] };
    outcomes.push(o);
    inputs.set(o, s.files);
  }

  // Judge in priority order: small hand-written cases first, then real skills.
  if (withJudge) {
    const judge = getJudge({ waitOnRateLimit: true, provider });
    if (!judge) throw new Error(`--judge with provider ${provider} needs ${provider.toUpperCase()}_API_KEY in .env.local`);
    judgeModel = judge.model;
    const order: Outcome["group"][] = ["gap", "risky", "adversarial", "tricky", "general", "security"];
    const queue = [...outcomes].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    let done = 0;
    for (const o of queue) {
      o.judged = await judgeCached(judge, inputs.get(o)!);
      done++;
      process.stderr.write(`\rjudge ${done}/${queue.length} (new calls this run: ${judgeCalls})   `);
    }
    process.stderr.write("\n");
  }

  const lines: string[] = [];
  const p = (s = "") => lines.push(s);
  const count = (g: Outcome["group"]) => outcomes.filter((o) => o.group === g).length;

  p(`## Scanner eval — ${new Date().toISOString().slice(0, 10)} · scanner ${SCANNER_VERSION}`);
  p();
  p(
    `Harmful: ${count("risky") + count("adversarial")} written to be caught + ${count("gap")} known gaps · Harmless: ${count("tricky")} tricky + ${count("general")} real skills · Dual-use real skills: ${count("security")}`,
  );
  p();
  p("### Rules only");
  p();
  lines.push(...metricsTable(outcomes, (o) => o.risk));
  p();

  if (withJudge) {
    const judged = outcomes.filter((o) => o.judged);
    p(`### Rules + LLM judge, ${judgeModel} (${judged.length}/${outcomes.length} cases judged so far${quotaHit ? " — daily quota reached, rerun later to continue" : ""})`);
    p();
    p("Same subset, side by side:");
    p();
    p("**Rules only, on the judged subset**");
    p();
    lines.push(...metricsTable(judged, (o) => o.risk));
    p();
    p("**Rules + LLM, on the judged subset**");
    p();
    lines.push(...metricsTable(judged, (o) => o.judged!.risk));
    p();
    const dropped = judged.reduce((n, o) => n + o.judged!.dropped, 0);
    p(`LLM findings dropped by the evidence check: ${dropped}`);
    p();
  }

  p("### Cases that missed (rules only)");
  p();
  const misses = outcomes
    .filter((o) => ["risky", "adversarial", "tricky"].includes(o.group))
    .map((o) => ({ o, ...check(o, o.risk, o.rules) }))
    .filter((x) => !x.pass);
  if (misses.length === 0) p("None.");
  for (const m of misses) p(`- **${m.o.group}/${m.o.id}** — ${m.why} (found: ${m.o.rules.join(", ") || "nothing"})`);
  p();

  p("### Known gaps");
  p();
  p(withJudge ? "| Case | Would be caught by | Rules only | Rules + LLM |" : "| Case | Would be caught by | Rules only |");
  p(withJudge ? "|---|---|---|---|" : "|---|---|---|");
  for (const o of outcomes.filter((x) => x.group === "gap")) {
    const show = (risk: Risk, rules: string[]) => (check(o, risk, rules).pass ? `caught (${risk})` : `missed (${risk})`);
    const llm = o.judged ? show(o.judged.risk, o.judged.rules) : "not judged";
    p(`| ${o.id} | ${o.catchBy ?? "INJ-06 / LLM"} | ${show(o.risk, o.rules)} |${withJudge ? ` ${llm} |` : ""}`);
  }
  p();

  if (withJudge) {
    const changed = outcomes.filter(
      (o) => o.judged && ["risky", "adversarial", "tricky", "general"].includes(o.group) && o.judged.risk !== o.risk,
    );
    p("### Where the LLM changed the verdict");
    p();
    if (changed.length === 0) p("Nowhere.");
    for (const o of changed) {
      const extra = o.judged!.rules.filter((r) => r.startsWith("llm.")).join(", ");
      p(`- [${o.group}] ${o.id}: ${o.risk} → **${o.judged!.risk}**${extra ? ` (${extra})` : ""}`);
    }
    p();
  }

  p("### Real skills flagged medium or higher (rules only)");
  p();
  const flagged = outcomes.filter((o) => (o.group === "general" || o.group === "security") && atLeast(o.risk, "medium"));
  if (flagged.length === 0) p("None.");
  for (const o of flagged) p(`- [${o.group}] ${o.id} — **${o.risk}**: ${o.rules.slice(0, 4).join(", ")}`);
  p();
  const sec = outcomes.filter((o) => o.group === "security");
  p(
    `Dual-use security skills flagged: medium+ ${sec.filter((o) => atLeast(o.risk, "medium")).length}/${sec.length}, high+ ${sec.filter((o) => atLeast(o.risk, "high")).length}/${sec.length} (reported for context, not counted as false positives)`,
  );

  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
