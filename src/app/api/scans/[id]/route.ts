import { and, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { findings, scans } from "@/db/schema";
import { STALE_AFTER_MS } from "@/lib/scan-job";
import { SEVERITY_RANK } from "@/lib/scanner/util";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_request: Request, ctx: RouteContext<"/api/scans/[id]">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "ไม่พบผลการสแกนนี้" }, { status: 404, headers: NO_STORE });
  }

  // A scan whose worker died (timeout, crash) would otherwise poll forever.
  await db
    .update(scans)
    .set({ status: "failed", step: null, error: "สแกนใช้เวลานานเกินไปจนหมดเวลา ลองสแกนใหม่อีกครั้ง", updatedAt: new Date() })
    .where(
      and(
        eq(scans.id, id),
        inArray(scans.status, ["pending", "running"]),
        lt(scans.updatedAt, new Date(Date.now() - STALE_AFTER_MS)),
      ),
    );

  const [scan] = await db.select().from(scans).where(eq(scans.id, id)).limit(1);
  if (!scan) {
    return Response.json({ error: "ไม่พบผลการสแกนนี้" }, { status: 404, headers: NO_STORE });
  }

  const rows =
    scan.status === "done"
      ? await db
          .select({
            severity: findings.severity,
            rule: findings.rule,
            file: findings.file,
            line: findings.line,
            message: findings.message,
            excerpt: findings.excerpt,
          })
          .from(findings)
          .where(eq(findings.scanId, id))
      : [];
  rows.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );

  return Response.json(
    {
      id: scan.id,
      repo: scan.repo,
      path: scan.path,
      commitSha: scan.commitSha,
      status: scan.status,
      step: scan.step,
      error: scan.error,
      score: scan.score,
      riskLevel: scan.status === "done" ? (rows[0]?.severity ?? "none_found") : null,
      coverage: scan.coverage ?? [],
      // null = scanned before descriptions were recorded
      skills: scan.skills ?? null,
      scannerVersion: scan.scannerVersion,
      createdAt: scan.createdAt,
      findings: rows,
    },
    { headers: NO_STORE },
  );
}
