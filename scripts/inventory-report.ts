// npm run inventory — prints what inventory() finds in every real skill cached by `npm run eval`
// (.eval-cache/*.json), so extraction mistakes can be read through by eye: junk programs,
// missed secrets. Also counts how many skills no rule matched but still have an inventory.
// Nothing cached or loaded here is executed. --only=<text> prints just the skills whose id
// contains <text>; --compact leaves out the lists and prints only the summary lines.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inventory } from "../src/lib/inventory";
import { scanFiles, type SkillFile } from "../src/lib/scanner";
import { usesLine } from "../src/app/scans/[id]/report-model";

interface RealSkill {
  id: string;
  group: string;
  files: SkillFile[];
}

const CACHE = join(import.meta.dirname, "..", ".eval-cache");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const compact = process.argv.includes("--compact");

const skills: RealSkill[] = readdirSync(CACHE)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(join(CACHE, f), "utf8")) as RealSkill[]);

let noRule = 0;
let noRuleWithInventory = 0;
let instructionsOnly = 0;
const lines: string[] = [];

for (const s of skills) {
  const found = scanFiles(s.files).findings.length;
  // an eval skill is one folder, so its files all belong to the skill whose SKILL.md is the shallowest
  const inv = inventory(s.files).sort((a, b) => a.root.length - b.root.length);
  const uses = inv[0]?.uses;
  if (!uses) continue;
  if (found === 0) {
    noRule++;
    if (!uses.instructionsOnly) noRuleWithInventory++;
  }
  if (uses.instructionsOnly) instructionsOnly++;
  if (only && !s.id.includes(only)) continue;
  lines.push(`### ${s.id} [${s.group}] · rule findings: ${found}`);
  lines.push(usesLine(uses));
  if (!compact) {
    for (const k of ["programs", "sites", "secrets", "envVars", "paths"] as const) {
      if (uses[k].length) lines.push(`  ${k}: ${uses[k].join(", ")}`);
    }
  }
  lines.push("");
}

console.log(lines.join("\n"));
console.log(`Skills: ${skills.length} · instructions only: ${instructionsOnly}`);
console.log(`Skills no rule matched: ${noRule} · of those with a non-empty inventory: ${noRuleWithInventory}`);
