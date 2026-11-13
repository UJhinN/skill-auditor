// Reads a skill's files from GitHub. Talks only to api.github.com and
// raw.githubusercontent.com, never follows redirects, and times out every call.
// Nothing fetched here is ever executed.

import type { SkillFile } from "./scanner";
import { fileKind } from "./scanner/util";

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

// owner/repo rule shared with the browser form; see target.ts
export { REPO_PATTERN } from "./target";

export const LIMITS = {
  // 200 → 400 after the per-skill split: measured on real repos, 100 extra files cost only
  // ~0.3–0.7s (the fixed cost is GitHub listing a repo's files, ~7s when not cached), and 400
  // lets repos with a few hundred files be read in full instead of warning "incomplete".
  maxFiles: 400,
  maxFileBytes: 1_000_000,
  /** How much of an oversized file we still read: its start and its end */
  partialBytes: 256 * 1024,
  tailBytes: 64 * 1024,
  maxTotalBytes: 5_000_000,
  timeoutMs: 10_000,
  concurrency: 6,
};

const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff", "psd",
  "pdf", "zip", "gz", "tgz", "tar", "7z", "rar", "bz2", "xz",
  "exe", "dll", "so", "dylib", "bin", "o", "a", "pyc", "pyo", "class", "jar", "wasm",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "mp4", "mov", "avi", "wav", "ogg", "webm",
]);

/** Error whose message is safe to show to the user (Thai). */
export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Head {
  commitSha: string;
  treeSha: string;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

export interface CoverageEntry {
  path: string;
  status: "full" | "partial" | "skipped";
  reason?: string;
  /** whether the LLM judge read this file; absent when no judge ran */
  llm?: "read" | "not_read";
}

export interface FetchedSkill {
  files: SkillFile[];
  coverage: CoverageEntry[];
  skillDirs: string[];
}

function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

function repoPath(repo: string): string {
  const [owner, name] = repo.split("/");
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", "skill-auditor");
  if (url.startsWith(API)) {
    headers.set("Accept", "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(LIMITS.timeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new GitHubError("GitHub ตอบช้าเกินไป ลองใหม่อีกครั้ง", 504);
    }
    throw new GitHubError("ติดต่อ GitHub ไม่ได้ ลองใหม่อีกครั้ง", 502);
  }

  if (res.status >= 300 && res.status < 400) {
    throw new GitHubError("repo นี้ถูกย้ายหรือเปลี่ยนชื่อ ลองใส่ชื่อใหม่ของ repo", 400);
  }
  if (res.status === 404) {
    throw new GitHubError("ไม่พบ repo นี้ หรือเป็น repo ส่วนตัว (สแกนได้เฉพาะ repo สาธารณะ)", 404);
  }
  if (res.status === 409) {
    throw new GitHubError("repo นี้ยังว่างอยู่ ไม่มีไฟล์ให้สแกน", 400);
  }
  if (res.status === 403 || res.status === 429) {
    throw new GitHubError("GitHub จำกัดจำนวนครั้งที่เรียกใช้ชั่วคราว ลองใหม่ในอีกสักครู่", 503);
  }
  if (!res.ok && res.status !== 206) {
    throw new GitHubError(`GitHub ตอบกลับผิดปกติ (${res.status})`, 502);
  }
  return res;
}

/** Latest commit on the default branch. */
export async function getHead(repo: string): Promise<Head> {
  const res = await request(`${API}/repos/${repoPath(repo)}/commits?per_page=1`);
  const body = (await res.json()) as Array<{ sha: string; commit: { tree: { sha: string } } }>;
  const c = body[0];
  if (!c) throw new GitHubError("repo นี้ยังว่างอยู่ ไม่มีไฟล์ให้สแกน", 400);
  return { commitSha: c.sha, treeSha: c.commit.tree.sha };
}

/** A specific commit (used by the eval to pin sources). */
export async function getCommit(repo: string, sha: string): Promise<Head> {
  const res = await request(`${API}/repos/${repoPath(repo)}/commits/${encodeURIComponent(sha)}`);
  const body = (await res.json()) as { sha: string; commit: { tree: { sha: string } } };
  return { commitSha: body.sha, treeSha: body.commit.tree.sha };
}

export async function getTree(repo: string, treeSha: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const res = await request(`${API}/repos/${repoPath(repo)}/git/trees/${treeSha}?recursive=1`);
  const body = (await res.json()) as { tree: TreeEntry[]; truncated: boolean };
  return { entries: body.tree, truncated: body.truncated };
}

function ext(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function isSkillMd(path: string): boolean {
  return (path.split("/").pop() ?? "").toLowerCase() === "skill.md";
}

const SCRIPT_DIRS = /(^|\/)(scripts?|bin|tools)\//i;

/**
 * How early a file should be read. What matters is what the file is, not which folder it
 * sits in: a schema under scripts/ is data, a .py under references/ is still code.
 *   0  SKILL.md — the instructions the agent follows
 *   1  code that can run (scripts, or extensionless files in script folders)
 *   2  text the agent may read (markdown, txt, html)
 *   3  everything else (json, xml, xsd, csv, …): rarely carries instructions, often huge
 */
export function readRank(path: string): 0 | 1 | 2 | 3 {
  if (isSkillMd(path)) return 0;
  const kind = fileKind(path);
  if (kind === "script") return 1;
  if (kind === "markdown" || kind === "html") return 2;
  if (ext(path) === "" && SCRIPT_DIRS.test(path)) return 1;
  return 3;
}

/** The skill folder a file belongs to: the deepest one containing it, or "" for a root skill. */
function ownerOf(path: string, skillDirs: Set<string>): string | null {
  let d = dirname(path);
  while (true) {
    if (skillDirs.has(d)) return d;
    if (d === "") return null;
    d = dirname(d);
  }
}

/**
 * Pure: decide which files belong to the skill(s) and in what order to read them.
 * A skill is the folder holding a SKILL.md; a root SKILL.md makes the whole repo the skill.
 *
 * The limits are for the whole repo, but they are shared out fairly: files are read by
 * importance (SKILL.md, then code, then text, then data) and, within each level, skills
 * take turns. A repo with many skills therefore gets every skill's SKILL.md and scripts
 * read before any skill's reference files, instead of the first skills in alphabetical
 * order using up the allowance.
 */
export function planFiles(entries: TreeEntry[]): {
  skillDirs: string[];
  toFetch: { path: string; size: number }[];
  skipped: CoverageEntry[];
} {
  const blobs = entries.filter((e) => e.type === "blob");
  const skillDirs = [...new Set(blobs.filter((b) => isSkillMd(b.path)).map((b) => dirname(b.path)))].sort();
  if (skillDirs.length === 0) {
    throw new GitHubError("ไม่พบไฟล์ SKILL.md ใน repo นี้ จึงไม่ใช่ skill ที่สแกนได้", 400);
  }
  const dirSet = new Set(skillDirs);
  const skillIndex = new Map(skillDirs.map((d, i) => [d, i]));

  interface Item {
    path: string;
    size: number;
    rank: number;
    ordinal: number;
    skill: number;
  }
  const skipped: CoverageEntry[] = [];
  const groups = new Map<string, Item[]>(); // one list per (skill, rank), smallest file first

  for (const b of blobs) {
    const owner = ownerOf(b.path, dirSet);
    if (owner === null) continue; // not part of any skill
    if (BINARY_EXT.has(ext(b.path))) {
      skipped.push({ path: b.path, status: "skipped", reason: "ไฟล์ binary อ่านเป็นข้อความไม่ได้" });
      continue;
    }
    const rank = readRank(b.path);
    const key = `${owner}\u0000${rank}`;
    const item: Item = { path: b.path, size: b.size ?? 0, rank, ordinal: 0, skill: skillIndex.get(owner)! };
    const g = groups.get(key);
    if (g) g.push(item);
    else groups.set(key, [item]);
  }

  const items: Item[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.size - b.size || a.path.localeCompare(b.path));
    g.forEach((it, i) => {
      it.ordinal = i; // this skill's 1st, 2nd, 3rd … file of this level
      items.push(it);
    });
  }
  // by importance, then by turn (every skill's 1st file before any skill's 2nd), then skill order
  items.sort((a, b) => a.rank - b.rank || a.ordinal - b.ordinal || a.skill - b.skill || a.path.localeCompare(b.path));

  const toFetch: { path: string; size: number }[] = [];
  let budget = LIMITS.maxTotalBytes;
  for (const it of items) {
    if (toFetch.length >= LIMITS.maxFiles) {
      skipped.push({ path: it.path, status: "skipped", reason: `เกินจำนวนไฟล์สูงสุด ${LIMITS.maxFiles} ไฟล์` });
    } else if (budget <= 0) {
      skipped.push({ path: it.path, status: "skipped", reason: "เกินขนาดรวมสูงสุด 5 MB" });
    } else {
      toFetch.push({ path: it.path, size: it.size });
      budget -= it.size > LIMITS.maxFileBytes ? LIMITS.partialBytes + LIMITS.tailBytes : it.size;
    }
  }
  return { skillDirs, toFetch, skipped };
}

/**
 * Join the start and end of an oversized file. Padding a file so the payload sits
 * past what scanners read is a known trick, so the end is read too.
 */
export function stitchPartial(head: string, tail: string): string {
  return `${head}\n\n[… ส่วนกลางไฟล์ไม่ได้อ่าน — เลขบรรทัดหลังจากนี้ไม่ตรงกับไฟล์จริง …]\n\n${tail}`;
}

async function fetchRange(url: string, range: string): Promise<Uint8Array> {
  const res = await request(url, { headers: { Range: range } });
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchFile(repo: string, sha: string, path: string, size: number): Promise<SkillFile> {
  if (size === 0) return { path, content: "" }; // raw.githubusercontent.com answers 501 for empty files
  const url = `${RAW}/${repoPath(repo)}/${sha}/${encodePath(path)}`;
  const decode = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);

  if (size <= LIMITS.maxFileBytes) {
    const res = await request(url);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length <= LIMITS.maxFileBytes) return { path, content: decode(bytes) };
    // the tree under-reported the size; fall through to a partial read
  }

  let head = await fetchRange(url, `bytes=0-${LIMITS.partialBytes - 1}`);
  let tail = await fetchRange(url, `bytes=-${LIMITS.tailBytes}`);
  // if the server ignored Range and sent everything, cut it ourselves
  if (head.length > LIMITS.partialBytes) head = head.slice(0, LIMITS.partialBytes);
  if (tail.length > LIMITS.tailBytes) tail = tail.slice(tail.length - LIMITS.tailBytes);
  return { path, content: stitchPartial(decode(head), decode(tail)), totalBytes: size };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/**
 * Fetch the skill files of a repo. With `only`, read just that one skill folder
 * from an already-listed tree (the eval scans each skill on its own).
 */
export async function fetchSkill(
  repo: string,
  head: Head,
  only?: { dir: string; entries: TreeEntry[] },
): Promise<FetchedSkill> {
  const { entries, truncated } = only
    ? { entries: only.entries.filter((e) => only.dir === "" || e.path.startsWith(only.dir + "/")), truncated: false }
    : await getTree(repo, head.treeSha);
  const { skillDirs, toFetch, skipped } = planFiles(entries);

  // One unreadable file is reported in coverage, not allowed to sink the whole scan.
  const results = await pool(toFetch, LIMITS.concurrency, async (f) => {
    try {
      return await fetchFile(repo, head.commitSha, f.path, f.size);
    } catch (e) {
      const why = e instanceof GitHubError ? e.message : "ดึงไฟล์ไม่สำเร็จ";
      return { failed: f.path, why };
    }
  });
  const files = results.filter((r): r is SkillFile => "content" in r);
  const failed = results.filter((r): r is { failed: string; why: string } => "failed" in r);
  if (files.length === 0) {
    throw new GitHubError(failed[0]?.why ?? "ดึงไฟล์ของ skill ไม่สำเร็จ", 502);
  }

  const coverage: CoverageEntry[] = [
    ...files.map((f): CoverageEntry =>
      f.totalBytes !== undefined
        ? {
            path: f.path,
            status: "partial",
            reason: `ไฟล์ใหญ่เกิน อ่าน ${Math.round(LIMITS.partialBytes / 1024)} KB แรกกับ ${Math.round(LIMITS.tailBytes / 1024)} KB สุดท้าย`,
          }
        : { path: f.path, status: "full" },
    ),
    ...failed.map((f): CoverageEntry => ({ path: f.failed, status: "skipped", reason: f.why })),
    ...skipped,
  ];
  if (truncated) {
    coverage.push({ path: "(ทั้ง repo)", status: "skipped", reason: "repo ใหญ่เกินกว่าที่ GitHub ส่งรายชื่อไฟล์มาให้ครบ" });
  }
  return { files, coverage, skillDirs };
}
