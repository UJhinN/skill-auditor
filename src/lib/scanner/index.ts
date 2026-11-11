import { scanHidden } from "./hidden";
import { computeScore } from "./score";
import { scanScripts } from "./scripts";
import type { Finding, ScanResult, SkillFile } from "./types";
import { fileKind, SEVERITY_RANK } from "./util";

export type { Finding, ScanResult, Severity, SkillFile } from "./types";
export { SEVERITIES } from "./types";

/** Max findings kept per (file, rule); the rest are summarized on the last one kept. */
export const MAX_PER_RULE = 10;

export function scanFiles(files: SkillFile[]): ScanResult {
  let all: Finding[] = [];
  let filesScanned = 0;

  for (const f of files) {
    if (f.content.includes("\u0000")) continue; // binary, not ours to read
    filesScanned++;
    const kind = fileKind(f.path);
    all.push(...scanHidden(f.path, f.content, kind));
    all.push(...scanScripts(f.path, f.content, kind));
  }

  all = capPerRule(all);
  all.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );

  return { findings: all, score: computeScore(all), filesScanned };
}

function capPerRule(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.file}\u0000${f.rule}`;
    const g = groups.get(key);
    if (g) g.push(f);
    else groups.set(key, [f]);
  }

  const out: Finding[] = [];
  for (const g of groups.values()) {
    if (g.length <= MAX_PER_RULE) {
      out.push(...g);
      continue;
    }
    // keep the most severe ones
    g.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || (a.line ?? 0) - (b.line ?? 0));
    const kept = g.slice(0, MAX_PER_RULE);
    const last = kept[kept.length - 1];
    kept[kept.length - 1] = {
      ...last,
      message: `${last.message} (และอีก ${g.length - MAX_PER_RULE} จุดในไฟล์นี้)`,
    };
    out.push(...kept);
  }
  return out;
}
