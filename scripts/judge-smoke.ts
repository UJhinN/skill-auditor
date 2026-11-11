// One real judge call on a fixture, to check the provider wiring end to end.
// Usage: npx tsx scripts/judge-smoke.ts [clean|malicious] [groq|gemini]
// With a provider named, exactly that provider is used (no fallback), which is how a new
// provider's request shape is checked against the real API. A provider error is printed in full.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { getJudge, JUDGE_PROVIDERS, type JudgeProvider, runJudge } from "../src/lib/judge";
import { scanFiles, type SkillFile } from "../src/lib/scanner";

config({ path: join(import.meta.dirname, "..", ".env.local"), quiet: true });

const which = process.argv[2] === "clean" ? "clean" : "malicious";
const dir = join(import.meta.dirname, "..", "fixtures", which);
const files: SkillFile[] =
  which === "clean"
    ? [
        { path: "SKILL.md", content: readFileSync(join(dir, "SKILL.md.fixture"), "utf8") },
        { path: "scripts/format.sh", content: readFileSync(join(dir, "format.sh.fixture"), "utf8") },
      ]
    : [
        { path: "SKILL.md", content: readFileSync(join(dir, "SKILL.md.fixture"), "utf8") },
        { path: "scripts/setup.sh", content: readFileSync(join(dir, "setup.sh.fixture"), "utf8") },
      ];

async function main() {
const providerArg = process.argv[3];
if (providerArg && !(JUDGE_PROVIDERS as readonly string[]).includes(providerArg)) {
  throw new Error(`provider must be one of: ${JUDGE_PROVIDERS.join(", ")}`);
}
const judge = getJudge({ waitOnRateLimit: true, provider: providerArg as JudgeProvider | undefined });
if (!judge) throw new Error(`no API key set in .env.local for ${providerArg ?? "any provider"}`);

const statics = scanFiles(files);
const t = Date.now();
const out = await runJudge(judge, files, statics.findings);
console.log(`model ${out.model} · ${((Date.now() - t) / 1000).toFixed(1)}s`);
console.log(`rules only: ${statics.riskLevel} (${statics.findings.length})  →  with judge: ${out.riskLevel} (${out.findings.length})`);
console.log(`purpose: ${out.statedPurpose}\nmismatch: ${out.purposeMismatch.present} — ${out.purposeMismatch.explanation}`);
console.log(`behaviors:\n  - ${out.observedBehaviors.join("\n  - ")}`);
console.log("llm findings kept:");
for (const f of out.findings.filter((x) => x.source === "llm")) console.log(`  [${f.severity}] ${f.rule} ${f.file}:${f.line} conf=${f.confidence} | ${f.excerpt}`);
console.log(`dropped by evidence check: ${out.dropped.length}`);
for (const d of out.dropped) console.log(`  - ${d.reason}: ${d.finding.evidence.slice(0, 80)}`);
const softened = out.findings.filter((f) => f.message.includes("AI อ่านบริบท"));
console.log(`static findings softened: ${softened.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
