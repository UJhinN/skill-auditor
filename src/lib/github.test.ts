import { afterEach, describe, expect, it } from "vitest";
import { GitHubError, LIMITS, planFiles, readRank, REPO_PATTERN, type TreeEntry } from "./github";

const blob = (path: string, size = 100): TreeEntry => ({ path, type: "blob", size });

const DEFAULT_MAX_FILES = LIMITS.maxFiles;
afterEach(() => {
  LIMITS.maxFiles = DEFAULT_MAX_FILES;
});

const planned = (entries: TreeEntry[]) => planFiles(entries).toFetch.map((f) => f.path);

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

describe("readRank", () => {
  it.each([
    ["skills/a/SKILL.md", 0],
    ["skills/a/skill.md", 0],
    ["skills/a/scripts/run.sh", 1],
    ["skills/a/references/helper.py", 1], // code is code, wherever it sits
    ["skills/a/scripts/install", 1], // extensionless file in a script folder
    ["skills/a/references/notes.md", 2],
    ["skills/a/page.html", 2],
    ["skills/a/scripts/office/schemas/wml.xsd", 3], // data is data, even under scripts/
    ["skills/a/data/catalog.json", 3],
    ["skills/a/Makefile", 3],
  ])("%s → %i", (path, rank) => {
    expect(readRank(path)).toBe(rank);
  });
});

describe("planFiles: sharing the limit between skills", () => {
  it("reads every skill's SKILL.md and scripts before any skill's reference files", () => {
    LIMITS.maxFiles = 7;
    // skill "a" comes first alphabetically and has lots of reference files
    const a = Array.from({ length: 50 }, (_, i) => blob(`skills/a/references/r${String(i).padStart(2, "0")}.md`));
    const files = [
      blob("skills/a/SKILL.md"),
      ...a,
      blob("skills/b/SKILL.md"),
      blob("skills/b/scripts/run.sh"),
      blob("skills/c/SKILL.md"),
      blob("skills/c/scripts/run.sh"),
    ];
    const got = planned(files);
    for (const must of [
      "skills/a/SKILL.md",
      "skills/b/SKILL.md",
      "skills/c/SKILL.md",
      "skills/b/scripts/run.sh",
      "skills/c/scripts/run.sh",
    ]) {
      expect(got).toContain(must);
    }
    expect(got).toHaveLength(7);
  });

  it("lets skills take turns for reference files instead of the first skill taking them all", () => {
    LIMITS.maxFiles = 2 + 4; // two SKILL.md + four reference files
    const files = [
      blob("skills/a/SKILL.md"),
      blob("skills/b/SKILL.md"),
      ...[1, 2, 3, 4, 5].map((i) => blob(`skills/a/references/a${i}.md`)),
      ...[1, 2, 3, 4, 5].map((i) => blob(`skills/b/references/b${i}.md`)),
    ];
    const refs = planned(files).filter((p) => p.includes("/references/"));
    expect(refs.filter((p) => p.startsWith("skills/a/"))).toHaveLength(2);
    expect(refs.filter((p) => p.startsWith("skills/b/"))).toHaveLength(2);
  });

  it("orders by what the file is, not the folder it is in", () => {
    const got = planned([
      blob("SKILL.md"),
      blob("scripts/office/schemas/big.xsd", 10),
      blob("references/notes.md", 500),
      blob("references/helper.py", 900),
      blob("data.json", 1),
    ]);
    expect(got).toEqual(["SKILL.md", "references/helper.py", "references/notes.md", "data.json", "scripts/office/schemas/big.xsd"]);
  });

  it("keeps big data files for last so they cannot crowd out instructions or code", () => {
    LIMITS.maxFiles = 3;
    const got = planned([
      blob("skills/a/SKILL.md"),
      blob("skills/a/schema.xsd", 5),
      blob("skills/a/scripts/run.sh", 5000),
      blob("skills/a/guide.md", 5000),
    ]);
    expect(got).toEqual(["skills/a/SKILL.md", "skills/a/scripts/run.sh", "skills/a/guide.md"]);
  });

  it("gives a file to the deepest skill that contains it", () => {
    LIMITS.maxFiles = 4;
    const files = [
      blob("skills/a/SKILL.md"),
      blob("skills/a/sub/SKILL.md"),
      blob("skills/a/guide.md"),
      blob("skills/a/sub/guide.md"),
    ];
    const plan = planFiles(files);
    expect(plan.skillDirs).toEqual(["skills/a", "skills/a/sub"]);
    expect(plan.toFetch).toHaveLength(4);
  });

  it("covers as many SKILL.md files as the limit allows when there are more skills than files", () => {
    LIMITS.maxFiles = 5;
    const files = Array.from({ length: 12 }, (_, i) => blob(`skills/s${String(i).padStart(2, "0")}/SKILL.md`));
    const plan = planFiles(files);
    expect(plan.toFetch).toHaveLength(5);
    expect(plan.skipped).toHaveLength(7);
    expect(plan.skipped[0].reason).toContain("5");
  });

  it("is deterministic", () => {
    const files = Array.from({ length: 30 }, (_, i) => blob(`skills/s${i % 3}/references/r${i}.md`)).concat([
      blob("skills/s0/SKILL.md"),
      blob("skills/s1/SKILL.md"),
      blob("skills/s2/SKILL.md"),
    ]);
    LIMITS.maxFiles = 10;
    expect(planned(files)).toEqual(planned([...files].reverse()));
  });

  it("still never reads binaries and never reads files outside any skill", () => {
    const got = planned([blob("skills/a/SKILL.md"), blob("skills/a/logo.png"), blob("docs/guide.md"), blob("README.md")]);
    expect(got).toEqual(["skills/a/SKILL.md"]);
  });

  it("applies the size budget after the order, so SKILL.md and code are not lost to a huge file", () => {
    const got = planned([
      blob("skills/a/SKILL.md", 100),
      blob("skills/a/scripts/run.sh", 100),
      blob("skills/a/huge.json", 900_000),
      ...Array.from({ length: 6 }, (_, i) => blob(`skills/a/big${i}.json`, 900_000)),
    ]);
    expect(got.slice(0, 2)).toEqual(["skills/a/SKILL.md", "skills/a/scripts/run.sh"]);
    expect(got.length).toBeLessThan(9); // 5 MB budget stops the data files
  });
});
