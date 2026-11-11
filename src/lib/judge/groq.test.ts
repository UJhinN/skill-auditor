import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqJudge, QuotaError, toStrictSchema } from "./groq";
import { judgeReportJsonSchema } from "./schema";

const req = { system: "s", user: "u", schema: judgeReportJsonSchema() };

function stubFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const limited = (retryAfter: number) => new Response("{}", { status: 429, headers: { "retry-after": String(retryAfter) } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("toStrictSchema", () => {
  it("drops keywords strict mode may reject but keeps structure", () => {
    const s = JSON.stringify(toStrictSchema(judgeReportJsonSchema()));
    expect(s).not.toMatch(/"\$schema"|"minimum"|"maximum"|"maxLength"|"minLength"/);
    expect(s).toContain('"additionalProperties":false');
    expect(s).toContain('"required"');
    expect(s).toContain("reviewer_manipulation");
  });
});

describe("GroqJudge", () => {
  it("sends a strict json_schema request and returns the content", async () => {
    const fetch = stubFetch(ok('{"x":1}'));
    const judge = new GroqJudge("gsk_test");
    expect(await judge.complete(req)).toBe('{"x":1}');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.temperature).toBe(0);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer gsk_test");
  });

  it("fails fast on a rate limit in production mode", async () => {
    stubFetch(limited(30));
    await expect(new GroqJudge("k").complete(req)).rejects.toBeInstanceOf(QuotaError);
  });

  it("waits out a short rate limit in eval mode, then succeeds", async () => {
    vi.useFakeTimers();
    const fetch = stubFetch(limited(2), ok("{}"));
    const p = new GroqJudge("k", { waitOnRateLimit: true }).complete(req);
    await vi.advanceTimersByTimeAsync(3500);
    expect(await p).toBe("{}");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up when the wait is too long (daily quota)", async () => {
    stubFetch(limited(3600));
    await expect(new GroqJudge("k", { waitOnRateLimit: true }).complete(req)).rejects.toBeInstanceOf(QuotaError);
  });

  it("reports other HTTP errors with a short body", async () => {
    stubFetch(new Response("bad request: schema", { status: 400 }));
    await expect(new GroqJudge("k").complete(req)).rejects.toThrow(/Groq 400: bad request/);
  });
});
