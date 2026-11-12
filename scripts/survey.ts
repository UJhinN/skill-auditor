// Ecosystem survey: scan a sample of skills from popular GitHub repos with the rule scanner.
//
//   GITHUB_TOKEN=... tsx scripts/survey.ts [--per-repo 12] [--max-repos 150]
//
// Input:  .eval-cache/survey/candidates.tsv  ("owner/repo<TAB>stars" per line)
// Output: .eval-cache/survey/repos/<owner>__<repo>.json  (one per repo; reruns skip these)
//         .eval-cache/survey/results.json               (everything, for the report)
//
// Rules only: no LLM judge, so a rerun gives the same numbers. Like the app, it only reads
// files as text from api.github.com / raw.githubusercontent.com and never runs anything.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSkill, getHead, getTree, GitHubError } from "../src/lib/github";
import { type Finding, SCANNER_VERSION, scanFiles } from "../src/lib/scanner";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, ".eval-cache", "survey");
const REPO_DIR = join(DIR, "repos");

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const PER_REPO = arg("per-repo", 12);
const MAX_REPOS = arg("max-repos", 150);

interface SkillRow {
  dir: string;
  files: number;
  incomplete: number;
  riskLevel: string;
  score: number;
  findings: Finding[];
}

interface RepoRow {
  repo: string;
  stars: number;
  commitSha?: string;
  scannerVersion: string;
  /** SKILL.md folders in the repo, before sampling */
  skillDirs?: number;
  treeTruncated?: boolean;
  skills: SkillRow[];
  error?: string;
}

/** Evenly spaced pick, so the sample does not depend on chance. */
function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

async function surveyRepo(repo: string, stars: number): Promise<RepoRow> {
  const row: RepoRow = { repo, stars, scannerVersion: SCANNER_VERSION, skills: [] };
  try {
    const head = await getHead(repo);
    row.commitSha = head.commitSha;
    const { entries, truncated } = await getTree(repo, head.treeSha);
    row.treeTruncated = truncated;
    const dirs = [
      ...new Set(
        entries
          .filter((e) => e.type === "blob" && (e.path.split("/").pop() ?? "") === "SKILL.md")
          .map((e) => (e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "")),
      ),
    ].sort();
    row.skillDirs = dirs.length;

    for (const dir of sample(dirs, PER_REPO)) {
      try {
        const fetched = await fetchSkill(repo, head, { dir, entries });
        const result = scanFiles(fetched.files);
        row.skills.push({
          dir,
          files: fetched.coverage.length,
          incomplete: fetched.coverage.filter((c) => c.status !== "full").length,
          riskLevel: result.riskLevel,
          score: result.score,
          findings: result.findings,
        });
      } catch (e) {
        // one unreadable skill must not drop the rest of the repo
        row.skills.push({ dir, files: 0, incomplete: 0, riskLevel: "error", score: 0, findings: [] });
        process.stderr.write(`  ! ${repo}/${dir}: ${e instanceof Error ? e.message : String(e)}\n`);
      }
    }
  } catch (e) {
    row.error = e instanceof GitHubError ? `${e.status}: ${e.message}` : e instanceof Error ? e.message : String(e);
  }
  return row;
}

async function main() {
  mkdirSync(REPO_DIR, { recursive: true });
  const candidates = readFileSync(join(DIR, "candidates.tsv"), "utf8")
    .split("\n")
    .map((l) => l.trim().split("\t"))
    .filter((p) => p.length === 2)
    .slice(0, MAX_REPOS);

  const all: RepoRow[] = [];
  for (const [i, [repo, stars]] of candidates.entries()) {
    const file = join(REPO_DIR, `${repo.replace("/", "__")}.json`);
    let row: RepoRow;
    if (existsSync(file)) {
      row = JSON.parse(readFileSync(file, "utf8")) as RepoRow;
    } else {
      row = await surveyRepo(repo, Number(stars));
      // a failed repo is not cached, so a rerun tries it again
      if (!row.error) writeFileSync(file, JSON.stringify(row));
    }
    all.push(row);
    process.stderr.write(
      `[${i + 1}/${candidates.length}] ${repo}: ${row.error ?? `${row.skills.length} of ${row.skillDirs} skills`}\n`,
    );
  }
  writeFileSync(join(DIR, "results.json"), JSON.stringify(all));
  const withSkills = all.filter((r) => r.skills.length > 0);
  process.stderr.write(
    `done: ${withSkills.length} repos with skills, ${withSkills.reduce((n, r) => n + r.skills.length, 0)} skills scanned\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
