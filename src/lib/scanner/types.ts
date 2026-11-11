// The scanner engine is plain TypeScript: no Next.js, no database, no network.
// It takes file contents in and returns findings out.

export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface SkillFile {
  /** Path inside the repo, forward slashes, e.g. "skills/foo/SKILL.md" */
  path: string;
  content: string;
  /** Real size in bytes when `content` is only the start of a larger file */
  totalBytes?: number;
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
  /** Text recovered from something hidden (e.g. Unicode tag characters) */
  decoded?: string;
  /** "static" = pattern rule (default), "llm" = found by the LLM judge */
  source?: "static" | "llm";
  /** 0..1; pattern rules are 1 */
  confidence?: number;
}

export interface ScanResult {
  findings: Finding[];
  /** Highest severity found; "none_found" never means "safe", only "no known pattern" */
  riskLevel: Severity | "none_found";
  /** 0–100, higher is safer */
  score: number;
  filesScanned: number;
}
