import { describe, expect, it } from "vitest";
import {
  aiReading, byTopic, githubLink, INSTRUCTIONS_ONLY, isAiFinding, interpretRecheck, isLegacyReport, mergeUses, ruleResultLine,
  type ScanResponse, summarize, TOPICS, topicOf, usesLine,
} from "./report-model";

const base: ScanResponse = {
  id: "a",
  repo: "demo/repo",
  commitSha: "abcdef1234",
  status: "done",
  step: null,
  error: null,
  score: 90,
  riskLevel: "low",
  scannerVersion: "0.3.1",
  coverage: [{ path: "SKILL.md", status: "full" }],
  findings: [],
};

describe("isLegacyReport", () => {
  it.each([null, undefined, "", "dev", "0.1.0", "0.2.0", "0.2.1", "0.2.2", "0.3.0"])("%s is old or unknown", (v) => {
    expect(isLegacyReport(v)).toBe(true);
  });

  it.each(["0.3.1", "0.3.2", "0.3.10", "0.4.0", "1.0.0", "0.3.1-beta"])("%s is trusted", (v) => {
    expect(isLegacyReport(v)).toBe(false);
  });
});

describe("summarize", () => {
  it("counts files by their real status and lists the incomplete ones", () => {
    const s = summarize({
      ...base,
      coverage: [
        { path: "a", status: "full" },
        { path: "b", status: "full" },
        { path: "c", status: "partial", reason: "ใหญ่" },
        { path: "d", status: "skipped", reason: "ไฟล์ภาพ" },
      ],
    });
    expect(s.files).toEqual({ full: 2, partial: 1, skipped: 1, read: 3 });
    expect(s.incomplete.map((c) => c.path)).toEqual(["c", "d"]);
    expect(s.insufficient).toBe(false);
  });

  it("counts findings by severity and takes the level from the scan", () => {
    const s = summarize({
      ...base,
      riskLevel: "high",
      findings: [
        { severity: "high", rule: "r", file: "f", line: 1, message: "m", excerpt: null },
        { severity: "high", rule: "r", file: "f", line: 2, message: "m", excerpt: null },
        { severity: "low", rule: "r", file: "f", line: 3, message: "m", excerpt: null },
      ],
    });
    expect(s.level).toBe("high");
    expect(s.findingCount).toBe(3);
    expect(s.severityCounts).toEqual({ high: 2, low: 1 });
  });

  it("falls back to none_found when the scan has no level", () => {
    expect(summarize({ ...base, riskLevel: null }).level).toBe("none_found");
  });

  it("is insufficient and hides the score when no file was read", () => {
    const s = summarize({ ...base, coverage: [{ path: "x", status: "skipped" }] });
    expect(s.insufficient).toBe(true);
    expect(s.showScore).toBe(false);
    expect(summarize({ ...base, coverage: [] }).insufficient).toBe(true);
  });

  it("shows the score only for a current, readable report", () => {
    expect(summarize(base).showScore).toBe(true);
    expect(summarize({ ...base, scannerVersion: "0.3.0" }).showScore).toBe(false);
    expect(summarize({ ...base, score: null }).showScore).toBe(false);
  });
});

describe("interpretRecheck", () => {
  it("says the report is current when the API returns the same scan", () => {
    expect(interpretRecheck("a", true, { id: "a" })).toEqual({ kind: "current" });
  });

  it("points to the new scan when the API returns another id", () => {
    expect(interpretRecheck("a", true, { id: "b" })).toEqual({ kind: "newer", id: "b" });
  });

  it("returns the API's own error message", () => {
    expect(interpretRecheck("a", false, { error: "ไม่พบ repo นี้" })).toEqual({ kind: "error", message: "ไม่พบ repo นี้" });
  });

  it("has a fallback message when the error has no text or no id came back", () => {
    expect(interpretRecheck("a", false, {})).toMatchObject({ kind: "error" });
    expect(interpretRecheck("a", true, {})).toMatchObject({ kind: "error" });
  });
});

describe("githubLink", () => {
  it("pins the link to the commit and encodes the path", () => {
    expect(githubLink("o/r", "abc", "dir/a b.md", 7)).toBe("https://github.com/o/r/blob/abc/dir/a%20b.md#L7");
    expect(githubLink("o/r", null, "x.md", null)).toBe("https://github.com/o/r/blob/HEAD/x.md");
  });
});

describe("agent-bypass topic", () => {
  it("groups the permission-bypass rule under its own topic", () => {
    expect(topicOf("script.agent-bypass-permissions")).toBe("agent-bypass");
    expect(TOPICS.find((t) => t.id === "agent-bypass")?.title).toBe("สั่ง AI ตัวอื่นให้ทำงานโดยไม่ขออนุญาต");
  });
});

describe("inventory summary", () => {
  const empty = { programs: [], sites: [], secrets: [], envVars: [], paths: [], instructionsOnly: false };

  it("names only the groups that have something", () => {
    expect(usesLine({ ...empty, programs: ["a", "b", "c"], sites: ["x", "y"], secrets: ["T"] })).toBe(
      "ใช้ 3 โปรแกรม · อ้างถึง 2 เว็บ · แตะความลับ 1 ตัว",
    );
    expect(usesLine({ ...empty, programs: ["a"] })).toBe("ใช้ 1 โปรแกรม");
    expect(usesLine({ ...empty, envVars: ["P"], paths: ["~/.x", "/etc/y"] })).toBe("ตัวแปรอื่น 1 ตัว · อ้างถึงที่นอกโปรเจค 2 ที่");
  });

  it("says a skill with no commands is only advice", () => {
    expect(usesLine({ ...empty, instructionsOnly: true })).toBe(INSTRUCTIONS_ONLY);
    expect(usesLine({ ...empty, instructionsOnly: true }, 4)).toContain("ทั้ง 4 ตัว");
  });

  it("words the rule result without a verdict", () => {
    expect(ruleResultLine(0)).toBe("ไม่พบรูปแบบเสี่ยงที่รู้จัก");
    expect(ruleResultLine(3)).toBe("พบ 3 จุดที่ควรรู้ก่อนติดตั้ง");
    expect(ruleResultLine(0)).not.toContain("ปลอดภัย");
  });

  it("merges skills: union, shared items first, null when nothing was recorded", () => {
    expect(mergeUses([{}, { uses: null }])).toBeNull();
    const a = { uses: { ...empty, programs: ["git", "npm"] } };
    const b = { uses: { ...empty, programs: ["docker", "git"], instructionsOnly: false } };
    expect(mergeUses([a])).toBe(a.uses);
    expect(mergeUses([a, b, {}])?.programs).toEqual(["git", "docker", "npm"]);
    const none = { uses: { ...empty, instructionsOnly: true } };
    expect(mergeUses([none, none])?.instructionsOnly).toBe(true);
    expect(mergeUses([none, a])?.instructionsOnly).toBe(false);
  });
});

describe("AI findings and reading", () => {
  const f = (rule: string) => ({ severity: "low" as const, rule, file: "a", line: 1, message: "m", excerpt: null });

  it("tells AI findings from rule findings and counts them apart", () => {
    expect(isAiFinding(f("llm.obfuscation"))).toBe(true);
    expect(isAiFinding(f("script.persistence"))).toBe(false);
    const s = summarize({ ...base, findings: [f("llm.obfuscation"), f("script.persistence"), f("hidden.html-comment")] });
    expect([s.ruleCount, s.aiCount, s.findingCount]).toEqual([2, 1, 3]);
  });

  it("puts rule findings before AI findings inside a topic", () => {
    const got = byTopic([f("llm.instruction-override"), f("hidden.skip-confirmation"), f("llm.scope-violation"), f("hidden.instruction-override")]);
    expect(got).toHaveLength(1);
    expect(got[0].findings.map((x) => x.rule)).toEqual([
      "hidden.skip-confirmation", "hidden.instruction-override", "llm.instruction-override", "llm.scope-violation",
    ]);
  });

  it("reports how much the AI read, or null when it read nothing or never ran", () => {
    expect(aiReading([{ path: "a", status: "full" }])).toBeNull();
    expect(aiReading([{ path: "a", status: "full", llm: "not_read" }])).toBeNull();
    expect(aiReading([{ path: "a", status: "full", llm: "read" }, { path: "b", status: "full", llm: "not_read" }, { path: "c", status: "skipped" }])).toEqual({ read: 1, total: 2 });
  });

  it("words the counts without a verdict", () => {
    expect(ruleResultLine(3, 2)).toBe("พบ 3 จุดจากกฎ · AI ตั้งข้อสังเกตอีก 2 จุด");
    expect(ruleResultLine(0, 2)).toBe("ไม่พบรูปแบบเสี่ยงที่รู้จักจากกฎ · AI ตั้งข้อสังเกต 2 จุด");
    expect(ruleResultLine(3)).toBe("พบ 3 จุดที่ควรรู้ก่อนติดตั้ง");
  });
});
