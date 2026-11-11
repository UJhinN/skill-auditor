import { afterEach, describe, expect, it, vi } from "vitest";
import { FallbackJudge } from "./fallback";
import { GeminiJudge, DEFAULT_GEMINI_MODEL } from "./gemini";
import { GroqJudge } from "./groq";
import { getJudge, type Judge, type JudgeRequest, MockJudge, parseProviderOrder, QuotaError } from "./index";
import { judgeReportJsonSchema } from "./schema";

const req: JudgeRequest = { system: "sys", user: "usr", schema: judgeReportJsonSchema() };

interface SentBody {
  model: string;
  temperature?: number;
  max_completion_tokens?: number;
  max_tokens?: number;
  reasoning_effort?: string;
  response_format: { type: string; json_schema: { strict?: boolean } };
}
const bodyOf = (judge: { buildBody(r: JudgeRequest): Record<string, unknown> }) => judge.buildBody(req) as unknown as SentBody;

function stubFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GroqJudge request (must stay exactly as measured in the eval)", () => {
  it("keeps temperature 0, strict schema, token limit and reasoning effort", () => {
    const body = bodyOf(new GroqJudge("k"));
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.temperature).toBe(0);
    expect(body.max_completion_tokens).toBe(3000);
    expect(body.reasoning_effort).toBe("low");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(new GroqJudge("k").model).toBe("groq/openai/gpt-oss-120b");
    expect(new GroqJudge("k").maxInputChars).toBe(14_000);
  });
});

describe("GeminiJudge", () => {
  it("calls Google's OpenAI-compatible endpoint with a Bearer key", async () => {
    const fetch = stubFetch(ok('{"x":1}'));
    expect(await new GeminiJudge("AIza-test").complete(req)).toBe('{"x":1}');
    expect(fetch.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer AIza-test");
  });

  it("sends the schema but leaves out temperature, max tokens and reasoning effort by default", () => {
    const body = bodyOf(new GeminiJudge("k"));
    expect(body.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(body.response_format.type).toBe("json_schema");
    expect(JSON.stringify(body.response_format)).not.toMatch(/"minimum"|"maxLength"|\$schema/);
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("passes a reasoning effort only when asked", () => {
    const body = bodyOf(new GeminiJudge("k", { reasoningEffort: "low" }));
    expect(body.reasoning_effort).toBe("low");
  });

  it("records the model with its provider so reports say who read the skill", () => {
    expect(new GeminiJudge("k", { model: "gemini-3.6-flash" }).model).toBe("gemini/gemini-3.6-flash");
  });

  const unavailable = () =>
    new Response('[{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}]', {
      status: 503,
    });

  it("repeats a temporary 503 and succeeds when the next try works", async () => {
    vi.useFakeTimers();
    const fetch = stubFetch(unavailable(), unavailable(), ok("{}"));
    const p = new GeminiJudge("k").complete(req);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toBe("{}");
    expect(fetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("gives up after the retries and reports the provider's message", async () => {
    vi.useFakeTimers();
    const fetch = stubFetch(unavailable(), unavailable(), unavailable());
    const p = new GeminiJudge("k").complete(req);
    const assertion = expect(p).rejects.toThrow(/Gemini 503:.*high demand/);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(3); // the first try plus two repeats
    vi.useRealTimers();
  });

  it("does not repeat when the pause would use up the call's time", async () => {
    const fetch = stubFetch(unavailable(), ok("{}"));
    const judge = new GeminiJudge("k", { timeoutMs: 1000 }); // a 1.5 s pause does not fit in 1 s
    await expect(judge.complete(req)).rejects.toThrow(/Gemini 503/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a real client error such as 400", async () => {
    const fetch = stubFetch(new Response("bad request", { status: 400 }), ok("{}"));
    await expect(new GeminiJudge("k").complete(req)).rejects.toThrow(/Gemini 400/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("leaves Groq exactly as before: a 503 is reported at once, not repeated", async () => {
    const fetch = stubFetch(unavailable(), ok("{}"));
    await expect(new GroqJudge("k").complete(req)).rejects.toThrow(/Groq 503/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("turns a 429 into a QuotaError and other errors into readable messages", async () => {
    stubFetch(new Response("{}", { status: 429 }));
    await expect(new GeminiJudge("k").complete(req)).rejects.toBeInstanceOf(QuotaError);
    stubFetch(new Response("model not found", { status: 404 }));
    await expect(new GeminiJudge("k").complete(req)).rejects.toThrow(/Gemini 404: model not found/);
    stubFetch(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    await expect(new GeminiJudge("k").complete(req)).rejects.toThrow(/Gemini returned no content/);
  });
});

describe("FallbackJudge", () => {
  const failing = (e: Error): Judge => ({ model: "bad/m", maxInputChars: 5000, complete: async () => { throw e; } });
  const working = (model: string, maxInputChars?: number): Judge => ({ model, maxInputChars, complete: async () => "answer" });

  it("uses the first judge and does not touch the second when the first works", async () => {
    const second = vi.fn();
    const chain = new FallbackJudge([working("groq/a"), { model: "gemini/b", complete: second }]);
    expect(await chain.complete(req)).toBe("answer");
    expect(chain.model).toBe("groq/a");
    expect(second).not.toHaveBeenCalled();
  });

  it("moves on to the next judge on quota errors and on other failures, and reports who answered", async () => {
    for (const err of [new QuotaError("limit", 60), new Error("Groq 503: down"), new DOMException("t", "TimeoutError")]) {
      const chain = new FallbackJudge([failing(err as Error), working("gemini/b")]);
      expect(await chain.complete(req)).toBe("answer");
      expect(chain.model).toBe("gemini/b");
    }
  });

  it("throws the last error when every judge fails", async () => {
    const chain = new FallbackJudge([failing(new QuotaError("a", 1)), failing(new Error("second failed"))]);
    await expect(chain.complete(req)).rejects.toThrow("second failed");
  });

  it("builds the prompt for the smallest provider", () => {
    expect(new FallbackJudge([working("a", 14_000), working("b", 30_000)]).maxInputChars).toBe(14_000);
    expect(new FallbackJudge([working("a"), working("b")]).maxInputChars).toBeUndefined();
  });

  it("needs at least one judge", () => {
    expect(() => new FallbackJudge([])).toThrow();
  });

  it("works inside runJudge-style use with a mock", async () => {
    const chain = new FallbackJudge([new MockJudge(() => { throw new Error("first down"); }), new MockJudge(() => "ok")]);
    expect(await chain.complete(req)).toBe("ok");
  });
});

describe("parseProviderOrder", () => {
  it.each([
    [undefined, ["groq"]],
    ["", ["groq"]],
    ["gemini", ["gemini"]],
    ["groq,gemini", ["groq", "gemini"]],
    [" Gemini , GROQ ", ["gemini", "groq"]],
    ["groq,groq,gemini", ["groq", "gemini"]],
    ["openai,gemini", ["gemini"]],
    ["nonsense", ["groq"]],
  ])("%s → %j", (value, expected) => {
    expect(parseProviderOrder(value)).toEqual(expected);
  });
});

describe("getJudge", () => {
  const set = (env: Record<string, string>) => {
    for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY", "JUDGE_PROVIDERS", "GROQ_MODEL", "SCANNER_MODEL", "GEMINI_MODEL", "JUDGE_MAX_INPUT_CHARS"]) {
      vi.stubEnv(k, env[k] ?? "");
    }
  };

  it("is null with no keys (scans use rules only)", () => {
    set({});
    expect(getJudge()).toBeNull();
  });

  it("uses Groq alone by default, even when a Gemini key exists", () => {
    set({ GROQ_API_KEY: "g", GEMINI_API_KEY: "m" });
    const j = getJudge()!;
    expect(j).toBeInstanceOf(GroqJudge);
    expect(j.model).toBe("groq/openai/gpt-oss-120b");
  });

  it("builds a fallback chain only when JUDGE_PROVIDERS asks for it", () => {
    set({ GROQ_API_KEY: "g", GEMINI_API_KEY: "m", JUDGE_PROVIDERS: "groq,gemini" });
    expect(getJudge()).toBeInstanceOf(FallbackJudge);
  });

  it("skips a listed provider that has no key", () => {
    set({ GEMINI_API_KEY: "m", JUDGE_PROVIDERS: "groq,gemini" });
    expect(getJudge()).toBeInstanceOf(GeminiJudge);
    set({ JUDGE_PROVIDERS: "groq,gemini" });
    expect(getJudge()).toBeNull();
  });

  it("forces one provider with no fallback and ignores JUDGE_PROVIDERS (the eval relies on this)", () => {
    set({ GROQ_API_KEY: "g", GEMINI_API_KEY: "m", JUDGE_PROVIDERS: "gemini,groq" });
    expect(getJudge({ provider: "groq" })).toBeInstanceOf(GroqJudge);
    expect(getJudge({ provider: "gemini" })).toBeInstanceOf(GeminiJudge);
    set({ GROQ_API_KEY: "g" });
    expect(getJudge({ provider: "gemini" })).toBeNull(); // no silent switch to another model
  });

  it("keeps the older SCANNER_MODEL name working for Groq, and lets GROQ_MODEL win", () => {
    set({ GROQ_API_KEY: "g", SCANNER_MODEL: "openai/gpt-oss-20b" });
    expect(getJudge()!.model).toBe("groq/openai/gpt-oss-20b");
    set({ GROQ_API_KEY: "g", SCANNER_MODEL: "openai/gpt-oss-20b", GROQ_MODEL: "x/y" });
    expect(getJudge()!.model).toBe("groq/x/y");
  });

  it("picks the Gemini model from GEMINI_MODEL", () => {
    set({ GEMINI_API_KEY: "m", JUDGE_PROVIDERS: "gemini", GEMINI_MODEL: "gemini-3.6-flash" });
    expect(getJudge()!.model).toBe("gemini/gemini-3.6-flash");
  });

  it("applies JUDGE_MAX_INPUT_CHARS to every provider", () => {
    set({ GROQ_API_KEY: "g", GEMINI_API_KEY: "m", JUDGE_PROVIDERS: "groq,gemini", JUDGE_MAX_INPUT_CHARS: "9000" });
    expect(getJudge()!.maxInputChars).toBe(9000);
  });
});
