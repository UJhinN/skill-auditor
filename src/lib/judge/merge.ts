// Combines pattern-rule findings with what the LLM judge said, under fixed rules
// the model cannot argue its way around.

import type { Finding, Severity } from "../scanner";
import type { StaticHint } from "./prompt";
import type { HintReview, JudgeFinding } from "./schema";

/** LLM findings below this confidence are ignored. */
export const MIN_CONFIDENCE = 0.6;
/** The LLM may soften a pattern finding only when at least this sure it is benign. */
export const DOWNGRADE_CONFIDENCE = 0.8;

const ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];
const oneLower = (s: Severity): Severity => ORDER[Math.max(0, ORDER.indexOf(s) - 1)];

/**
 * Findings the LLM is never allowed to soften: hidden text, credential theft
 * correlation, reverse shells / known exfil endpoints.
 */
export function isProtected(rule: string): boolean {
  if (rule === "hidden.quoted-injection-phrase") return false; // already a low "is this an example?" note
  return rule.startsWith("hidden.") || rule === "script.credential-exfil" || rule === "script.exfil-endpoint";
}

export function ruleForCategory(category: string): string {
  return `llm.${category.replace(/_/g, "-")}`;
}

export function mergeJudge(
  staticFindings: Finding[],
  hints: StaticHint[],
  reviews: HintReview[],
  llmFindings: JudgeFinding[],
): Finding[] {
  const softened = new Map<Finding, HintReview>();
  for (const r of reviews) {
    const hint = hints.find((h) => h.id === r.hint_id);
    if (!hint) continue;
    if (r.assessment === "benign_in_context" && r.confidence >= DOWNGRADE_CONFIDENCE && !isProtected(hint.finding.rule)) {
      softened.set(hint.finding, r);
    }
  }

  const fromStatic = staticFindings.map((f): Finding => {
    const r = softened.get(f);
    if (!r) return { ...f, source: "static", confidence: 1 };
    return {
      ...f,
      source: "static",
      confidence: 1,
      severity: oneLower(f.severity), // at most one step
      message: `${f.message} (AI อ่านบริบทแล้วเห็นว่าน่าจะไม่อันตราย: ${r.reason.slice(0, 200)})`,
    };
  });

  const fromLlm = llmFindings
    .filter((f) => f.confidence >= MIN_CONFIDENCE)
    .map((f): Finding => {
      let severity: Severity = f.severity;
      if (f.category === "reviewer_manipulation") severity = "critical"; // always
      else if (f.context === "documentation_example" && ORDER.indexOf(severity) > ORDER.indexOf("low")) severity = "low";
      return {
        severity,
        rule: ruleForCategory(f.category),
        file: f.file,
        line: f.line_start,
        message: `${f.title} — ${f.explanation}`.slice(0, 600),
        excerpt: f.evidence.slice(0, 300),
        source: "llm",
        confidence: f.confidence,
      };
    });

  return [...fromStatic, ...fromLlm];
}
