// Tries judges in order. Free tiers run out and change, so the second one is a safety net:
// if the first fails for any reason (quota, outage, timeout) the next one is asked instead.
// If every judge fails, the last error is thrown and the scan falls back to rules only.

import type { Judge, JudgeRequest } from "./index";

export class FallbackJudge implements Judge {
  readonly maxInputChars?: number;
  private used: Judge;

  constructor(private readonly judges: Judge[]) {
    if (judges.length === 0) throw new Error("FallbackJudge needs at least one judge");
    this.used = judges[0];
    // the prompt is built once, so it must fit the smallest provider
    const sizes = judges.map((j) => j.maxInputChars).filter((n): n is number => n !== undefined);
    this.maxInputChars = sizes.length > 0 ? Math.min(...sizes) : undefined;
  }

  /** The model that produced the last answer, so reports say who really read the skill. */
  get model(): string {
    return this.used.model;
  }

  async complete(req: JudgeRequest): Promise<string> {
    let lastError: unknown;
    for (const judge of this.judges) {
      try {
        const answer = await judge.complete(req);
        this.used = judge;
        return answer;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }
}
