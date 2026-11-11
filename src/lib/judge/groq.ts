// Groq adapter (OpenAI-compatible API). Free plan on gpt-oss-120b: about
// 8,000 tokens per minute and 1,000 requests per day, so prompts are kept small
// and a 429 either waits (eval) or fails fast so the scan falls back to rules.

import type { Judge, JudgeRequest } from "./index";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/** Raised when the quota is used up for longer than we are willing to wait. */
export class QuotaError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

// Strict structured output supports a JSON Schema subset; range/length keywords are
// dropped here (Zod still enforces them on the reply).
const DROP_KEYS = new Set(["$schema", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]);

export function toStrictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictSchema);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (!DROP_KEYS.has(k)) out[k] = toStrictSchema(v);
    }
    return out;
  }
  return node;
}

function parseRetryAfter(res: Response): number {
  const h = res.headers.get("retry-after");
  const n = h ? Number(h) : NaN;
  return Number.isFinite(n) ? n : 60;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GroqJudge implements Judge {
  readonly model: string;
  readonly maxInputChars: number;

  constructor(
    private readonly apiKey: string,
    private readonly opts: {
      model?: string;
      maxInputChars?: number;
      /** wait out short rate limits (eval); production fails fast instead */
      waitOnRateLimit?: boolean;
      /** longest single wait before giving up with QuotaError */
      maxWaitSeconds?: number;
      timeoutMs?: number;
    } = {},
  ) {
    this.model = `groq/${opts.model ?? DEFAULT_GROQ_MODEL}`;
    // ~14k chars of skill text + the system prompt fits the 8k tokens/minute budget with room for the answer
    this.maxInputChars = opts.maxInputChars ?? 14_000;
  }

  async complete(req: JudgeRequest): Promise<string> {
    const body = JSON.stringify({
      model: this.opts.model ?? DEFAULT_GROQ_MODEL,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      temperature: 0,
      reasoning_effort: "low",
      max_completion_tokens: 3000,
      response_format: {
        type: "json_schema",
        json_schema: { name: "skill_review", strict: true, schema: toStrictSchema(req.schema) },
      },
    });

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 50_000),
      });

      if (res.status === 429) {
        const wait = parseRetryAfter(res);
        await res.body?.cancel();
        if (!this.opts.waitOnRateLimit || wait > (this.opts.maxWaitSeconds ?? 90) || attempt >= 3) {
          throw new QuotaError(`Groq rate limit (retry after ${wait}s)`, wait);
        }
        await sleep((wait + 1) * 1000);
        continue;
      }
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300);
        throw new Error(`Groq ${res.status}: ${text}`);
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("Groq returned no content");
      return content;
    }
  }
}
