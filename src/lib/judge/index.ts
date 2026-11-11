// The LLM judge: reads the whole skill and says what it would actually do.
// Provider-neutral — a Judge only turns (system, user, schema) into raw text.
// Everything that decides what the user sees (validation, evidence check,
// merge rules) lives here in code, not in the model.

import { finalize, type Finding, type ScanResult, type SkillFile } from "../scanner";
import { GroqJudge, QuotaError } from "./groq";
import { mergeJudge } from "./merge";
import { buildPrompt } from "./prompt";
import { judgeReportJsonSchema, type JudgeReport, JudgeReportSchema } from "./schema";
import { type Dropped, verifyFindings } from "./verify";

export interface JudgeRequest {
  system: string;
  user: string;
  /** JSON Schema of the expected answer, for providers that can enforce it */
  schema: Record<string, unknown>;
}

export interface Judge {
  /** e.g. "groq/openai/gpt-oss-120b" — recorded in every report */
  readonly model: string;
  /** how much skill text this provider can take per request */
  readonly maxInputChars?: number;
  complete(req: JudgeRequest): Promise<string>;
}

export class JudgeError extends Error {}
export { QuotaError } from "./groq";

export interface JudgeOutcome extends Pick<ScanResult, "findings" | "riskLevel" | "score"> {
  model: string;
  statedPurpose: string;
  observedBehaviors: string[];
  purposeMismatch: JudgeReport["purpose_mismatch"];
  dualUse: boolean;
  unreviewedReferences: string[];
  /** files the model read in full / files left out for the size budget */
  included: string[];
  excluded: string[];
  /** LLM findings thrown away by the evidence check, kept for logs and the eval */
  dropped: Dropped[];
}

/** Pull a JSON object out of a reply that may be wrapped in ``` fences or prose. */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}

export const DEFAULT_MAX_INPUT_CHARS = 40_000;

export async function runJudge(
  judge: Judge,
  files: SkillFile[],
  staticFindings: Finding[],
  opts: { maxInputChars?: number } = {},
): Promise<JudgeOutcome> {
  const prompt = buildPrompt(files, staticFindings, {
    maxInputChars: opts.maxInputChars ?? judge.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS,
  });
  const req: JudgeRequest = { system: prompt.system, user: prompt.user, schema: judgeReportJsonSchema() };

  // One retry on a malformed answer, then fail plainly (the scan falls back to rules only).
  let report: JudgeReport | null = null;
  let lastProblem = "";
  for (let attempt = 0; attempt < 2 && !report; attempt++) {
    let raw: string;
    try {
      raw = await judge.complete(req);
    } catch (e) {
      if (e instanceof QuotaError) throw e; // callers treat "out of quota" differently
      throw new JudgeError(`judge call failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const parsed = JudgeReportSchema.safeParse(extractJson(raw));
      if (parsed.success) report = parsed.data;
      else lastProblem = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastProblem = e instanceof Error ? e.message : String(e);
    }
  }
  if (!report) throw new JudgeError(`judge returned an invalid report twice: ${lastProblem}`);

  const { kept, dropped } = verifyFindings(report.findings, files, prompt.included);
  const merged = mergeJudge(staticFindings, prompt.hints, report.static_hint_reviews, kept);

  return {
    ...finalize(merged),
    model: judge.model,
    statedPurpose: report.stated_purpose,
    observedBehaviors: report.observed_behaviors,
    purposeMismatch: report.purpose_mismatch,
    dualUse: report.dual_use,
    unreviewedReferences: report.unreviewed_references,
    included: prompt.included,
    excluded: prompt.excluded,
    dropped,
  };
}

/** A judge that answers from a function — for tests and offline eval runs. */
export class MockJudge implements Judge {
  readonly model = "mock";
  readonly requests: JudgeRequest[] = [];
  constructor(private readonly answer: (req: JudgeRequest, call: number) => unknown) {}
  async complete(req: JudgeRequest): Promise<string> {
    this.requests.push(req);
    const a = this.answer(req, this.requests.length);
    return typeof a === "string" ? a : JSON.stringify(a);
  }
}

/**
 * The configured judge, or null when none is set up (scans then use rules only).
 * Groq is used when GROQ_API_KEY is set; SCANNER_MODEL picks the model.
 */
export function getJudge(opts: { waitOnRateLimit?: boolean } = {}): Judge | null {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  return new GroqJudge(key, {
    model: process.env.SCANNER_MODEL || undefined,
    maxInputChars: process.env.JUDGE_MAX_INPUT_CHARS ? Number(process.env.JUDGE_MAX_INPUT_CHARS) : undefined,
    waitOnRateLimit: opts.waitOnRateLimit,
  });
}
