// A judge for any provider that speaks the OpenAI chat-completions protocol (Groq, Gemini's
// compatibility endpoint, OpenRouter …). The differences between providers are plain options:
// endpoint, model, which parameters they accept, and how large a prompt they can take.

import type { Judge, JudgeRequest } from "./index";

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

export interface CompatOptions {
  /** short id used in the recorded model name, e.g. "groq" → "groq/<model>" */
  name: string;
  /** name shown in error messages, e.g. "Groq" */
  label: string;
  endpoint: string;
  apiKey: string;
  model: string;
  maxInputChars: number;
  /** send `strict: true` with the JSON schema */
  strict?: boolean;
  /** omit to use the provider's default */
  temperature?: number;
  /** omit to leave the answer length to the provider */
  maxTokens?: number;
  /** providers disagree on the name of this parameter */
  maxTokensParam?: "max_completion_tokens" | "max_tokens";
  /** extra provider-specific body fields, e.g. { reasoning_effort: "low" } */
  extraBody?: Record<string, unknown>;
  /** wait out short rate limits (eval); production fails fast instead */
  waitOnRateLimit?: boolean;
  /** longest single wait before giving up with QuotaError */
  maxWaitSeconds?: number;
  timeoutMs?: number;
  /**
   * How many times to repeat a request the provider refused with a temporary server error
   * (500/502/503/504). Default 0. Gemini's free models answer "high demand, try again" now and
   * then (about 1 in 5 requests when measured), and the same request usually works a moment later.
   */
  serverErrorRetries?: number;
  /** pause before the first repeat; doubles each time */
  retryDelayMs?: number;
}

const TEMPORARY_SERVER_ERRORS = new Set([500, 502, 503, 504]);

export class OpenAICompatJudge implements Judge {
  readonly model: string;
  readonly maxInputChars: number;

  constructor(private readonly o: CompatOptions) {
    this.model = `${o.name}/${o.model}`;
    this.maxInputChars = o.maxInputChars;
  }

  /** The JSON body sent to the provider (exposed for tests). */
  buildBody(req: JudgeRequest): Record<string, unknown> {
    const o = this.o;
    return {
      model: o.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
      ...(o.maxTokens !== undefined ? { [o.maxTokensParam ?? "max_completion_tokens"]: o.maxTokens } : {}),
      ...(o.extraBody ?? {}),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "skill_review",
          ...(o.strict === false ? {} : { strict: true }),
          schema: toStrictSchema(req.schema),
        },
      },
    };
  }

  async complete(req: JudgeRequest): Promise<string> {
    const o = this.o;
    const body = JSON.stringify(this.buildBody(req));
    const startedAt = Date.now();
    let serverTries = 0;

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(o.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(o.timeoutMs ?? 50_000),
      });

      if (res.status === 429) {
        const wait = parseRetryAfter(res);
        await res.body?.cancel();
        if (!o.waitOnRateLimit || wait > (o.maxWaitSeconds ?? 90) || attempt >= 3) {
          throw new QuotaError(`${o.label} rate limit (retry after ${wait}s)`, wait);
        }
        await sleep((wait + 1) * 1000);
        continue;
      }
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300);
        if (TEMPORARY_SERVER_ERRORS.has(res.status) && serverTries < (o.serverErrorRetries ?? 0)) {
          const delay = (o.retryDelayMs ?? 1500) * 2 ** serverTries;
          // never wait past the time this call is allowed to take; the next provider needs its turn
          if (Date.now() - startedAt + delay < (o.timeoutMs ?? 50_000)) {
            serverTries++;
            await sleep(delay);
            continue;
          }
        }
        throw new Error(`${o.label} ${res.status}: ${text}`);
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error(`${o.label} returned no content`);
      return content;
    }
  }
}
