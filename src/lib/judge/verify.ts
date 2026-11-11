// Every LLM finding must quote text that really is in the file, at (about) the lines
// it names. Anything else is dropped: the model may misremember, or a skill may have
// talked it into inventing a finding.

import type { SkillFile } from "../scanner";
import type { JudgeFinding } from "./schema";

export const LINE_SLACK = 2;
export const MAX_EVIDENCE = 300;

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** Strip quotes the model may wrap around a quote, split on ellipses it may insert. */
function evidenceParts(evidence: string): string[] {
  const e = collapse(evidence).replace(/^["'`“]+|["'`”]+$/g, "");
  return e
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export interface Dropped {
  finding: JudgeFinding;
  reason: string;
}

export function verifyFindings(
  findings: JudgeFinding[],
  files: SkillFile[],
  included: string[],
): { kept: JudgeFinding[]; dropped: Dropped[] } {
  const lines = new Map(files.map((f) => [f.path, f.content.split(/\r?\n/)]));
  const kept: JudgeFinding[] = [];
  const dropped: Dropped[] = [];

  for (const f of findings) {
    const fileLines = lines.get(f.file);
    if (!fileLines || !included.includes(f.file)) {
      dropped.push({ finding: f, reason: "file was not part of the review" });
      continue;
    }
    if (f.line_end < f.line_start || f.line_start > fileLines.length) {
      dropped.push({ finding: f, reason: "line range does not exist" });
      continue;
    }
    if (collapse(f.evidence).length > MAX_EVIDENCE + 20) {
      dropped.push({ finding: f, reason: "evidence longer than allowed" });
      continue;
    }
    const from = Math.max(0, f.line_start - 1 - LINE_SLACK);
    const to = Math.min(fileLines.length, f.line_end + LINE_SLACK);
    const window = collapse(fileLines.slice(from, to).join(" "));
    const parts = evidenceParts(f.evidence);
    const found = parts.length > 0 && parts.every((p) => window.includes(p));
    if (found) kept.push(f);
    else dropped.push({ finding: f, reason: "evidence not found at the cited lines" });
  }
  return { kept, dropped };
}
