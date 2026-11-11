import { describe, expect, it } from "vitest";
import { GitHubError, LIMITS, planFiles, REPO_PATTERN, type TreeEntry } from "./github";

const blob = (path: string, size = 100): TreeEntry => ({ path, type: "blob", size });

describe("REPO_PATTERN", () => {
  it.each(["anthropics/skills", "a/b", "user-name/repo.name_2", "UJhinN/skill-auditor"])("accepts %s", (r) => {
    expect(REPO_PATTERN.test(r)).toBe(true);
  });

  it.each([
    "https://github.com/a/b",
    "a/b/c",
    "a",
    "-bad/repo",
    "owner/..",
    "owner/.",
    "a/b?x=1",
    "a/b#x",
    "a b/c",
    "../etc/passwd",
    "a/b%2F..",
    "x".repeat(40) + "/repo",
  ])("rejects %s", (r) => {
    expect(REPO_PATTERN.test(r)).toBe(false);
  });
});

describe("planFiles", () => {
  it("fails when there is no SKILL.md", () => {
    expect(() => planFiles([blob("README.md")])).toThrow(GitHubError);
  });

  it("takes only files inside skill folders, SKILL.md first, then scripts", () => {
    const plan = planFiles([
      blob("README.md"),
      blob("src/app.ts"),
      blob("skills/fmt/reference.md", 50),
      blob("skills/fmt/scripts/run.sh", 300),
      blob("skills/fmt/SKILL.md", 999),
      { path: "skills/fmt/scripts", type: "tree" },
    ]);
    expect(plan.skillDirs).toEqual(["skills/fmt"]);
    expect(plan.toFetch.map((f) => f.path)).toEqual([
      "skills/fmt/SKILL.md",
      "skills/fmt/scripts/run.sh",
      "skills/fmt/reference.md",
    ]);
  });

  it("treats a root SKILL.md as the whole repo being the skill", () => {
    const plan = planFiles([blob("SKILL.md"), blob("helper.py")]);
    expect(plan.skillDirs).toEqual([""]);
    expect(plan.toFetch).toHaveLength(2);
  });

  it("does not let a sibling folder with a shared prefix sneak in", () => {
    const plan = planFiles([blob("skills/a/SKILL.md"), blob("skills/ab/evil.sh")]);
    expect(plan.toFetch.map((f) => f.path)).toEqual(["skills/a/SKILL.md"]);
  });

  it("skips binaries and reports them in coverage", () => {
    const plan = planFiles([blob("SKILL.md"), blob("tool.exe"), blob("logo.png")]);
    expect(plan.toFetch.map((f) => f.path)).toEqual(["SKILL.md"]);
    expect(plan.skipped.map((s) => s.path).sort()).toEqual(["logo.png", "tool.exe"]);
  });

  it("caps the number of files", () => {
    const many = Array.from({ length: LIMITS.maxFiles + 5 }, (_, i) => blob(`f${i}.md`));
    const plan = planFiles([blob("SKILL.md"), ...many]);
    expect(plan.toFetch).toHaveLength(LIMITS.maxFiles);
    expect(plan.skipped).toHaveLength(6);
  });

  it("still plans an oversized file (it gets read partially, not skipped)", () => {
    const plan = planFiles([blob("SKILL.md", 22_000_000)]);
    expect(plan.toFetch.map((f) => f.path)).toEqual(["SKILL.md"]);
  });
});
