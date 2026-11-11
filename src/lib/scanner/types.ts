// The scanner engine is plain TypeScript: no Next.js, no database, no network.
// It takes file contents in and returns findings out.

export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface SkillFile {
  /** Path inside the repo, forward slashes, e.g. "skills/foo/SKILL.md" */
  path: string;
  content: string;
}

export interface Finding {
  severity: Severity;
  /** Stable rule id, e.g. "hidden.zero-width" */
  rule: string;
  file: string;
  /** 1-based; null when the finding is about the whole file */
  line: number | null;
  /** Thai, shown to the user */
  message: string;
  /** The offending text with invisible characters made visible, trimmed */
  excerpt?: string;
}

export interface ScanResult {
  findings: Finding[];
  /** 0–100, higher is safer */
  score: number;
  filesScanned: number;
}
