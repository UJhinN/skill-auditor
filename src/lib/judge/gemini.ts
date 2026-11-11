// Gemini adapter, through Google's OpenAI-compatible endpoint (documented, still marked beta).
// Free tier: Google publishes no fixed numbers; limits are per project and shown in AI Studio,
// and daily quotas reset at midnight Pacific time.
//
// UNVERIFIED against the live API until a key is available (scripts/judge-smoke.ts <fixture> gemini):
// the docs do not say whether this endpoint accepts `strict`, `temperature` or a max-token
// parameter, so those are left out or switchable here instead of guessed.

import { OpenAICompatJudge } from "./openai-compat";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
/** Stable Flash-Lite model in Google's model list; whether the free tier covers it is not stated there. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export class GeminiJudge extends OpenAICompatJudge {
  constructor(
    apiKey: string,
    opts: {
      model?: string;
      maxInputChars?: number;
      waitOnRateLimit?: boolean;
      maxWaitSeconds?: number;
      timeoutMs?: number;
      /** thinking level, passed as reasoning_effort when set (Gemini 3+ cannot turn thinking off) */
      reasoningEffort?: string;
    } = {},
  ) {
    super({
      name: "gemini",
      label: "Gemini",
      endpoint: ENDPOINT,
      apiKey,
      model: opts.model ?? DEFAULT_GEMINI_MODEL,
      // Gemini's free tier limits requests per day rather than a tight tokens-per-minute budget
      maxInputChars: opts.maxInputChars ?? 30_000,
      strict: true,
      // temperature and max tokens deliberately omitted: Google's defaults (see the note above)
      extraBody: opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : undefined,
      // measured 2026-11-11: ~1 in 5 requests got "503 high demand"; a repeat after a short pause works
      serverErrorRetries: 2,
      waitOnRateLimit: opts.waitOnRateLimit,
      maxWaitSeconds: opts.maxWaitSeconds,
      timeoutMs: opts.timeoutMs,
    });
  }
}
