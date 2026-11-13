import { describe, expect, it } from "vitest";
import { parseTarget, resolveSkillDir, targetText } from "./target";

describe("parseTarget", () => {
  it("reads owner/repo and a folder path", () => {
    expect(parseTarget("anthropics/skills")).toEqual({ repo: "anthropics/skills" });
    expect(parseTarget(" anthropics/skills/ ")).toEqual({ repo: "anthropics/skills" });
    expect(parseTarget("anthropics/skills/skills/pptx")).toEqual({
      repo: "anthropics/skills",
      hint: { kind: "path", value: "skills/pptx" },
    });
  });

  it("reads GitHub links to a repo, a folder or a file", () => {
    expect(parseTarget("https://github.com/anthropics/skills.git")).toEqual({ repo: "anthropics/skills" });
    expect(parseTarget("https://github.com/anthropics/skills/tree/main")).toEqual({ repo: "anthropics/skills" });
    expect(parseTarget("github.com/anthropics/skills/tree/main/skills/pptx")).toEqual({
      repo: "anthropics/skills",
      hint: { kind: "refpath", value: "main/skills/pptx" },
    });
    expect(parseTarget("https://github.com/a/b/blob/main/skills/x/SKILL.md?plain=1#L3")).toEqual({
      repo: "a/b",
      hint: { kind: "refpath", value: "main/skills/x/SKILL.md" },
    });
  });

  it("reads install commands from skill marketplaces", () => {
    expect(parseTarget("npx skillfish add hashgraph-online/awesome-codex-plugins skill-auditor")).toEqual({
      repo: "hashgraph-online/awesome-codex-plugins",
      hint: { kind: "name", value: "skill-auditor" },
    });
    expect(parseTarget("npx skills@latest add vercel-labs/agent-skills --skill web-design-guidelines -g")).toEqual({
      repo: "vercel-labs/agent-skills",
      hint: { kind: "name", value: "web-design-guidelines" },
    });
    expect(parseTarget("npx skills add owner/repo --skill=foo")).toEqual({ repo: "owner/repo", hint: { kind: "name", value: "foo" } });
    expect(parseTarget("npx skills add owner/repo@foo")).toEqual({ repo: "owner/repo", hint: { kind: "name", value: "foo" } });
    expect(parseTarget("npx skills add https://github.com/owner/repo")).toEqual({ repo: "owner/repo" });
    expect(parseTarget("npx -y @scope/installer add owner/repo")).toEqual({ repo: "owner/repo" });
  });

  it("rejects text without a usable repo, and path tricks", () => {
    for (const bad of ["", "anthropics", "npx skills add", "https://gitlab.com/a/b", "a/b/../../etc", "a/b/./x", "-x/y"]) {
      expect(parseTarget(bad)).toBeNull();
    }
    expect(parseTarget("a".repeat(2001))).toBeNull();
  });
});

describe("resolveSkillDir", () => {
  const paths = [
    "README.md",
    "skills/pptx/SKILL.md",
    "skills/pptx/scripts/build.py",
    "plugins/x/skills/agents/skill-auditor/SKILL.md",
    "plugins/y/skill-auditor/SKILL.md",
    "plugins/y/skill-auditor/deep/nested/SKILL.md",
  ];

  it("finds a skill by folder path, by a file inside it, or a folder of skills", () => {
    expect(resolveSkillDir(paths, { kind: "path", value: "skills/pptx" })).toBe("skills/pptx");
    expect(resolveSkillDir(paths, { kind: "path", value: "skills/pptx/scripts/build.py" })).toBe("skills/pptx");
    expect(resolveSkillDir(paths, { kind: "path", value: "skills" })).toBe("skills");
    expect(resolveSkillDir(paths, { kind: "path", value: "nope" })).toBeNull();
  });

  it("drops the branch from a /tree/ link, even one with slashes", () => {
    expect(resolveSkillDir(paths, { kind: "refpath", value: "main/skills/pptx/SKILL.md" })).toBe("skills/pptx");
    expect(resolveSkillDir(paths, { kind: "refpath", value: "feature/new/skills/pptx" })).toBe("skills/pptx");
  });

  it("finds a skill by folder name, preferring the shallowest", () => {
    expect(resolveSkillDir(paths, { kind: "name", value: "Skill-Auditor" })).toBe("plugins/y/skill-auditor");
    expect(resolveSkillDir(paths, { kind: "name", value: "missing" })).toBeNull();
  });

  it("returns null when the repo has no skills", () => {
    expect(resolveSkillDir(["README.md"], { kind: "name", value: "x" })).toBeNull();
  });
});

describe("targetText", () => {
  it("round-trips through parseTarget", () => {
    expect(parseTarget(targetText("a/b", "skills/x"))).toEqual({ repo: "a/b", hint: { kind: "path", value: "skills/x" } });
    expect(targetText("a/b", null)).toBe("a/b");
  });
});
