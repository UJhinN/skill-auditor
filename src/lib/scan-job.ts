import { eq } from "drizzle-orm";
import { db } from "@/db";
import { findings, scans } from "@/db/schema";
import { fetchSkill, GitHubError, type Head } from "./github";
import { getJudge, runJudge } from "./judge";
import { type Finding, scanFiles } from "./scanner";
import { reveal } from "./scanner/util";
import { collectSkillInfo, getSummarizer, summarizeSkills } from "./skill-info";

/** A pending/running scan untouched for this long is treated as dead. */
export const STALE_AFTER_MS = 3 * 60 * 1000;

async function setStatus(id: string, fields: Partial<typeof scans.$inferInsert>) {
  await db
    .update(scans)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(scans.id, id));
}

/** Runs after the POST response has been sent (via `after`). Never throws. */
export async function runScan(id: string, repo: string, head: Head): Promise<void> {
  try {
    await setStatus(id, { status: "running", step: "กำลังดึงไฟล์จาก GitHub" });
    const fetched = await fetchSkill(repo, head);
    // runs beside the scan and the judge; never throws, worst case no Thai summaries
    const skillsInfo = summarizeSkills(collectSkillInfo(fetched.files), getSummarizer());

    await setStatus(id, { step: `กำลังสแกน ${fetched.files.length} ไฟล์` });
    const scanned = scanFiles(fetched.files);
    const inspected = new Map(scanned.coverage.map((c) => [c.path, c]));
    const coverage = fetched.coverage.map((c) => {
      const actual = inspected.get(c.path);
      if (!actual || actual.status === "full") return c;
      return { ...c, status: actual.status, reason: [c.reason, actual.reason].filter(Boolean).join(" · ") };
    });
    if (scanned.filesScanned === 0) {
      await setStatus(id, {
        status: "failed", step: null, score: null, coverage,
        error: "ข้อมูลไม่เพียงพอสำหรับประเมิน ไม่มีไฟล์ที่ตัวสแกนอ่านเป็นข้อความที่รองรับได้",
        skills: await skillsInfo,
      });
      return;
    }
    const reviewedFiles = fetched.files.filter((f) => inspected.get(f.path)?.status !== "skipped");
    let result: { findings: Finding[]; score: number } = scanned;

    // Optional second opinion from the LLM judge. Any failure (quota, timeout, bad
    // answer) falls back to the rule-based result; the report says the AI didn't read it.
    const judge = getJudge();
    if (judge) {
      await setStatus(id, { step: "AI กำลังอ่านเนื้อหา skill" });
      try {
        const out = await runJudge(judge, reviewedFiles, result.findings);
        result = out;
        for (const c of coverage) {
          if (c.status !== "skipped") c.llm = out.included.includes(c.path) ? "read" : "not_read";
        }
      } catch (e) {
        console.error(`scan ${id}: judge failed, using rules only`, e);
        for (const c of coverage) if (c.status !== "skipped") c.llm = "not_read";
      }
    }

    // insert in chunks to stay well under query size limits
    for (let i = 0; i < result.findings.length; i += 200) {
      await db.insert(findings).values(
        result.findings.slice(i, i + 200).map((f) => ({
          scanId: id,
          severity: f.severity,
          rule: f.rule,
          file: f.file,
          line: f.line,
          message: reveal(f.message),
          excerpt: f.excerpt === undefined ? null : reveal(f.excerpt),
        })),
      );
    }

    await setStatus(id, {
      status: "done",
      step: null,
      score: result.score,
      coverage,
      skills: await skillsInfo,
    });
  } catch (e) {
    console.error(`scan ${id} (${repo}) failed`, e);
    const message = e instanceof GitHubError ? e.message : "เกิดข้อผิดพลาดระหว่างสแกน ลองใหม่อีกครั้ง";
    await setStatus(id, { status: "failed", step: null, error: message }).catch((err) =>
      console.error(`could not mark scan ${id} as failed`, err),
    );
  }
}
