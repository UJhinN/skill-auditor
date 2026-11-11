// Reads a skill's files from GitHub. Talks only to api.github.com and
// raw.githubusercontent.com, never follows redirects, and times out every call.
// Nothing fetched here is ever executed.

import type { SkillFile } from "./scanner";

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

// owner: GitHub usernames are 1–39 chars of letters, digits and single hyphens.
// repo: letters, digits, . _ - (but never "." or "..").
export const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;

export const LIMITS = {
  maxFiles: 200,
  maxFileBytes: 1_000_000,
  /** How much of an oversized file we still read */
  partialBytes: 256 * 1024,
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

async function getTree(repo: string, treeSha: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
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
 * Pure: decide which files belong to the skill(s) and in what order to read them.
 * A skill is the folder holding a SKILL.md; a root SKILL.md makes the whole repo the skill.
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

  const inScope = skillDirs.includes("")
    ? blobs
    : blobs.filter((b) => skillDirs.some((d) => b.path.startsWith(d + "/")));

  // SKILL.md first, then scripts, then everything else (smallest first).
  const rank = (p: string) => (isSkillMd(p) ? 0 : SCRIPT_DIRS.test(p) ? 1 : 2);
  const ordered = [...inScope].sort(
    (a, b) => rank(a.path) - rank(b.path) || (a.size ?? 0) - (b.size ?? 0) || a.path.localeCompare(b.path),
  );

  const toFetch: { path: string; size: number }[] = [];
  const skipped: CoverageEntry[] = [];
  let budget = LIMITS.maxTotalBytes;

  for (const b of ordered) {
    const size = b.size ?? 0;
    if (BINARY_EXT.has(ext(b.path))) {
      skipped.push({ path: b.path, status: "skipped", reason: "ไฟล์ binary อ่านเป็นข้อความไม่ได้" });
    } else if (toFetch.length >= LIMITS.maxFiles) {
      skipped.push({ path: b.path, status: "skipped", reason: `เกินจำนวนไฟล์สูงสุด ${LIMITS.maxFiles} ไฟล์` });
    } else if (budget <= 0) {
      skipped.push({ path: b.path, status: "skipped", reason: "เกินขนาดรวมสูงสุด 5 MB" });
    } else {
      toFetch.push({ path: b.path, size });
      budget -= size > LIMITS.maxFileBytes ? LIMITS.partialBytes : size;
    }
  }
  return { skillDirs, toFetch, skipped };
}

async function fetchFile(repo: string, sha: string, path: string, size: number): Promise<SkillFile> {
  if (size === 0) return { path, content: "" }; // raw.githubusercontent.com answers 501 for empty files
  const partial = size > LIMITS.maxFileBytes;
  const res = await request(`${RAW}/${repoPath(repo)}/${sha}/${encodePath(path)}`, {
    headers: partial ? { Range: `bytes=0-${LIMITS.partialBytes - 1}` } : undefined,
  });
  let bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > LIMITS.maxFileBytes) bytes = bytes.slice(0, LIMITS.partialBytes); // server ignored Range
  const content = new TextDecoder("utf-8").decode(bytes);
  return partial || bytes.length < size ? { path, content, totalBytes: size } : { path, content };
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

export async function fetchSkill(repo: string, head: Head): Promise<FetchedSkill> {
  const { entries, truncated } = await getTree(repo, head.treeSha);
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
        ? { path: f.path, status: "partial", reason: `อ่านแค่ ${Math.round(LIMITS.partialBytes / 1024)} KB แรก` }
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
