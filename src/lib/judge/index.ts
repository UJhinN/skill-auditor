// The LLM judge: reads the whole skill and says what it would actually do.
// Provider-neutral — a Judge only turns (system, user, schema) into raw text.
// Everything that decides what the user sees (validation, evidence check,
// merge rules) lives here in code, not in the model.

import { finalize, type Finding, type ScanResult, type SkillFile } from "../scanner";
import { FallbackJudge } from "./fallback";
import { GeminiJudge } from "./gemini";
import { GroqJudge } from "./groq";
import { mergeJudge } from "./merge";
import { QuotaError } from "./openai-compat";
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
export { QuotaError } from "./openai-compat";

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

/**
 * Pull a JSON object out of a reply. The reply is usually pure JSON; some models wrap it in
 * ``` fences or add a sentence around it. A pure-JSON reply is tried first: its strings can
 * legitimately contain ``` (evidence quoted from a SKILL.md code block), and treating those
 * as the reply's own fence would cut the JSON apart.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // not pure JSON: look for a fenced block, then for the outermost braces
  }
  if (trimmed.startsWith("```")) {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // fall through to the brace search
      }
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(trimmed.slice(start, end + 1));
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

export const JUDGE_PROVIDERS = ["groq", "gemini"] as const;
export type JudgeProvider = (typeof JUDGE_PROVIDERS)[number];

/** JUDGE_PROVIDERS="groq,gemini" → the order to try. Unknown names are ignored; default is Groq only. */
export function parseProviderOrder(value: string | undefined): JudgeProvider[] {
  const wanted = (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is JudgeProvider => (JUDGE_PROVIDERS as readonly string[]).includes(s));
  const unique = [...new Set(wanted)];
  return unique.length > 0 ? unique : ["groq"];
}

function makeJudge(
  provider: JudgeProvider,
  o: { waitOnRateLimit?: boolean; timeoutMs?: number },
): Judge | null {
  const maxInputChars = process.env.JUDGE_MAX_INPUT_CHARS ? Number(process.env.JUDGE_MAX_INPUT_CHARS) : undefined;
  if (provider === "groq") {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    return new GroqJudge(key, {
      // SCANNER_MODEL is the older name for this setting and keeps working
      model: process.env.GROQ_MODEL || process.env.SCANNER_MODEL || undefined,
      maxInputChars,
      ...o,
    });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GeminiJudge(key, {
    model: process.env.GEMINI_MODEL || undefined,
    reasoningEffort: process.env.GEMINI_REASONING_EFFORT || undefined,
    maxInputChars,
    ...o,
  });
}

/** With several providers each one gets a short timeout, so a hung first one cannot use up the 60 s a scan has. */
const CHAIN_TIMEOUT_MS = 22_000;

/**
 * The configured judge, or null when none is set up (scans then use rules only).
 * - `provider` forces exactly that provider, with no fallback (the eval uses this so a run
 *   never mixes models).
 * - Otherwise JUDGE_PROVIDERS gives the order (default "groq"); providers without a key are
 *   skipped, and two or more are tried in turn.
 */
export function getJudge(opts: { waitOnRateLimit?: boolean; provider?: JudgeProvider } = {}): Judge | null {
  const order = opts.provider ? [opts.provider] : parseProviderOrder(process.env.JUDGE_PROVIDERS);
  const timeoutMs = order.length > 1 ? CHAIN_TIMEOUT_MS : undefined;
  const judges = order
    .map((p) => makeJudge(p, { waitOnRateLimit: opts.waitOnRateLimit, timeoutMs }))
    .filter((j): j is Judge => j !== null);
  if (judges.length === 0) return null;
  return judges.length === 1 ? judges[0] : new FallbackJudge(judges);
}
