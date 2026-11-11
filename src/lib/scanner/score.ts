import type { Finding, Severity } from "./types";

// How the 0–100 score works:
// - Start at 100.
// - Each distinct rule that fired costs its severity weight once.
// - Every extra occurrence of the same rule costs 2 more, capped at +10 per rule,
//   so one noisy rule can't zero the score on its own.
// - Any critical finding caps the score at 25: one critical is enough to say "don't install".
const WEIGHT: Record<Severity, number> = {
  critical: 40,
  high: 20,
  medium: 8,
  low: 3,
  info: 0,
};

export const CRITICAL_CAP = 25;

export function computeScore(findings: Finding[]): number {
  const byRule = new Map<string, { weight: number; count: number }>();
  for (const f of findings) {
    const w = WEIGHT[f.severity];
    const cur = byRule.get(f.rule);
    if (cur) {
      cur.count++;
      cur.weight = Math.max(cur.weight, w);
    } else {
      byRule.set(f.rule, { weight: w, count: 1 });
    }
  }

  let score = 100;
  for (const { weight, count } of byRule.values()) {
    if (weight === 0) continue;
    score -= weight + Math.min((count - 1) * 2, 10);
  }
  if (findings.some((f) => f.severity === "critical")) {
    score = Math.min(score, CRITICAL_CAP);
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
