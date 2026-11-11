// What the LLM judge must return. Validated with Zod; anything else is rejected.
// The model never picks our rule IDs — it picks a category and code maps it.

import { z } from "zod";

export const JUDGE_CATEGORIES = [
  "instruction_override",
  "concealment",
  "scope_violation",
  "data_exfiltration",
  "credential_access",
  "privilege_or_persistence",
  "destructive_or_security_disabling",
  "remote_code_or_instructions",
  "obfuscation",
  "third_party_content_exposure",
  "secret_handling",
  "financial_access",
  "undisclosed_commercial_steering",
  "reviewer_manipulation",
] as const;
export type JudgeCategory = (typeof JUDGE_CATEGORIES)[number];

export const JudgeFindingSchema = z.object({
  category: z.enum(JUDGE_CATEGORIES),
  title: z.string().max(200),
  severity: z.enum(["critical", "high", "medium", "low"]),
  confidence: z.number().min(0).max(1),
  file: z.string(),
  line_start: z.number().int().min(1),
  line_end: z.number().int().min(1),
  evidence: z.string().min(1),
  context: z.enum(["agent_instruction", "executable_code", "documentation_example", "metadata"]),
  explanation: z.string(),
});
export type JudgeFinding = z.infer<typeof JudgeFindingSchema>;

export const HintReviewSchema = z.object({
  hint_id: z.string(),
  assessment: z.enum(["confirmed", "benign_in_context", "uncertain"]),
  /** 0..1 — added to the spec's schema so "downgrade only when confident" can be enforced */
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
export type HintReview = z.infer<typeof HintReviewSchema>;

export const JudgeReportSchema = z.object({
  stated_purpose: z.string(),
  observed_behaviors: z.array(z.string()),
  purpose_mismatch: z.object({ present: z.boolean(), explanation: z.string() }),
  dual_use: z.boolean(),
  findings: z.array(JudgeFindingSchema),
  static_hint_reviews: z.array(HintReviewSchema),
  unreviewed_references: z.array(z.string()),
});
export type JudgeReport = z.infer<typeof JudgeReportSchema>;

/** JSON Schema for providers that enforce structured output. */
export function judgeReportJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(JudgeReportSchema) as Record<string, unknown>;
}
