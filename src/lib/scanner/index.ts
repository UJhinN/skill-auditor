import { scanHidden } from "./hidden";
import { computeScore } from "./score";
import { scanScripts } from "./scripts";
import type { FileCoverage, Finding, ScanResult, SkillFile } from "./types";
import { excerpt, fileKind, lineLocator, SEVERITY_RANK } from "./util";

export type { Finding, ScanResult, Severity, SkillFile } from "./types";
export { SEVERITIES } from "./types";

/** Bump when rules change, so cached results from older rules aren't reused. */
export const SCANNER_VERSION = "0.3.1";

/** Max findings kept per (file, rule); the rest are summarized on the last one kept. */
export const MAX_PER_RULE = 10;

export function scanFiles(files: SkillFile[]): ScanResult {
  const all: Finding[] = [];
  let filesScanned = 0;
  const coverage: FileCoverage[] = [];

  for (const f of files) {
    const kind = fileKind(f.path);
    const nul = f.content.indexOf("\u0000");
    if (nul !== -1 && (kind === "other" || f.content.replaceAll("\u0000", "").trim().length === 0)) {
      coverage.push({ path: f.path, status: "skipped", reason: "พบ NUL และไม่สามารถตีความไฟล์นี้เป็นข้อความที่รองรับได้" });
      continue;
    }
    filesScanned++;
    coverage.push({
      path: f.path,
      status: nul !== -1 || f.totalBytes !== undefined ? "partial" : "full",
      reason: nul !== -1 ? "พบ NUL ตรวจได้เฉพาะข้อความที่อ่านได้ อาจมี encoding ที่ยังไม่รองรับ" : undefined,
    });
    if (nul !== -1) {
      all.push({
        severity: "medium",
        rule: "hidden.null-byte",
        file: f.path,
        line: lineLocator(f.content)(nul),
        message: "พบอักขระ NUL ในไฟล์ข้อความ ตรวจต่อในส่วนที่อ่านได้ แต่ควรตรวจ encoding และเนื้อหาด้วยตนเอง",
        excerpt: excerpt(f.content, nul),
      });
    }
    all.push(...scanHidden(f.path, f.content, kind));
    all.push(...scanScripts(f.path, f.content, kind));

    // Padding a file until scanners give up is a known evasion trick.
    if (f.totalBytes !== undefined && f.totalBytes > f.content.length) {
      all.push({
        severity: "medium",
        rule: "hidden.oversized-file",
        file: f.path,
        line: null,
        message: `ไฟล์ใหญ่ผิดปกติ (${(f.totalBytes / 1_000_000).toFixed(1)} MB) จึงสแกนแค่ส่วนต้นกับส่วนท้าย ส่วนกลางไฟล์ยังไม่ได้ตรวจ`,
      });
    }
  }

  return { ...finalize(capPerRule(all)), filesScanned, coverage };
}

/** Sort most severe first and derive the overall risk and score. Used again after the LLM judge. */
export function finalize(findings: Finding[]): Pick<ScanResult, "findings" | "riskLevel" | "score"> {
  const sorted = [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
  return {
    findings: sorted,
    riskLevel: sorted.length > 0 ? sorted[0].severity : "none_found",
    score: computeScore(sorted),
  };
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
