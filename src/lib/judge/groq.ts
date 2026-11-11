// Groq adapter (OpenAI-compatible API). Free plan on gpt-oss-120b: about 8,000 tokens per
// minute and 1,000 requests per day, so prompts are kept small and a 429 either waits (eval)
// or fails fast so the scan falls back to rules (or to the next provider).

import { OpenAICompatJudge } from "./openai-compat";

export { QuotaError, toStrictSchema } from "./openai-compat";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export class GroqJudge extends OpenAICompatJudge {
  constructor(
    apiKey: string,
    opts: { model?: string; maxInputChars?: number; waitOnRateLimit?: boolean; maxWaitSeconds?: number; timeoutMs?: number } = {},
  ) {
    super({
      name: "groq",
      label: "Groq",
      endpoint: ENDPOINT,
      apiKey,
      model: opts.model ?? DEFAULT_GROQ_MODEL,
      // ~14k chars of skill text + the system prompt fits the 8k tokens/minute budget with room for the answer
      maxInputChars: opts.maxInputChars ?? 14_000,
      strict: true,
      temperature: 0,
      maxTokens: 3000,
      maxTokensParam: "max_completion_tokens",
      extraBody: { reasoning_effort: "low" },
      waitOnRateLimit: opts.waitOnRateLimit,
      maxWaitSeconds: opts.maxWaitSeconds,
      timeoutMs: opts.timeoutMs,
    });
  }
}
