import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { getHead, getTree, GitHubError, type TreeEntry } from "@/lib/github";
import { runScan, STALE_AFTER_MS } from "@/lib/scan-job";
import { SCANNER_VERSION } from "@/lib/scanner";
import { parseTarget, resolveSkillDir } from "@/lib/target";

// The scan itself runs in after(), which lives as long as this function may.
export const maxDuration = 60;

// "repo" may be owner/repo, owner/repo/folder, a GitHub link or an install command (see target.ts)
const Body = z.object({
  repo: z.string().trim().min(1).max(2000),
});

// Protects the free GitHub quota: at most this many new scans per window, for everyone.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_NEW_SCANS_PER_WINDOW = 30;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return error(400, "ข้อมูลที่ส่งมาไม่ใช่ JSON");
  }
  const parsed = Body.safeParse(json);
  const target = parsed.success ? parseTarget(parsed.data.repo) : null;
  if (!target) {
    return error(400, "ไม่พบ repo บน GitHub ในข้อความนี้ ใส่ owner/repo ลิงก์ GitHub หรือคำสั่งติดตั้ง skill");
  }
  // GitHub names are case-insensitive; store one spelling so the cache works.
  const repo = target.repo.toLowerCase();

  let head;
  try {
    head = await getHead(repo);
  } catch (e) {
    if (e instanceof GitHubError) return error(e.status, e.message);
    throw e;
  }

  // A single skill: find its folder in the repo's own file list (never trust the pasted path as is).
  let path: string | null = null;
  let entries: TreeEntry[] | undefined;
  if (target.hint) {
    try {
      const tree = await getTree(repo, head.treeSha);
      entries = tree.entries;
      path = resolveSkillDir(
        entries.filter((e) => e.type === "blob").map((e) => e.path),
        target.hint,
      );
      if (path === null) {
        const what = target.hint.kind === "name" ? `skill ชื่อ “${target.hint.value}”` : `โฟลเดอร์ “${target.hint.value}”`;
        const more = tree.truncated ? " (repo นี้ใหญ่เกินกว่าที่ GitHub ส่งรายชื่อไฟล์มาให้ครบ)" : "";
        return error(404, `ไม่พบ ${what} ใน ${repo}${more} ลองวางลิงก์โฟลเดอร์ของ skill จาก GitHub แทน`);
      }
    } catch (e) {
      if (e instanceof GitHubError) return error(e.status, e.message);
      throw e;
    }
  }

  // Same repo, same folder, same commit, same rules → reuse the finished result, or join one still in progress.
  const [reuse] = await db
    .select({ id: scans.id, status: scans.status })
    .from(scans)
    .where(
      and(
        eq(scans.repo, repo),
        path === null ? isNull(scans.path) : eq(scans.path, path),
        eq(scans.commitSha, head.commitSha),
        eq(scans.scannerVersion, SCANNER_VERSION),
        or(
          // a finished scan from before skill descriptions existed is redone, not reused
          and(eq(scans.status, "done"), isNotNull(scans.skills)),
          and(
            inArray(scans.status, ["pending", "running"]),
            gt(scans.updatedAt, new Date(Date.now() - STALE_AFTER_MS)),
          ),
        ),
      ),
    )
    .orderBy(desc(scans.createdAt))
    .limit(1);
  if (reuse) {
    return Response.json({ id: reuse.id, status: reuse.status, cached: true });
  }

  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(scans)
    .where(gt(scans.createdAt, new Date(Date.now() - WINDOW_MS)));
  if (recent >= MAX_NEW_SCANS_PER_WINDOW) {
    return error(429, "ตอนนี้มีคนสแกนเยอะเกินไป ลองใหม่ในอีกไม่กี่นาที");
  }

  const [created] = await db
    .insert(scans)
    .values({ repo, path, commitSha: head.commitSha, scannerVersion: SCANNER_VERSION, status: "pending" })
    .returning({ id: scans.id });

  after(() => runScan(created.id, repo, head, path === null || !entries ? undefined : { dir: path, entries }));

  return Response.json({ id: created.id, status: "pending", cached: false }, { status: 202 });
}
