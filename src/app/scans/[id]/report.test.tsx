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
    expect(html).toContain("ไม่พบสิ่งที่ตรงกับกฎ");
    expect(html).toContain("ครบทุกไฟล์");
    expect(html).not.toContain('role="alert"');
  });

  it("warns about historical coverage and does not call it complete", () => {
    const html = render({ ...completed, scannerVersion: "0.3.0" });
    expect(html).toContain("รายงานรุ่นเก่า");
    expect(html).not.toContain("ครบทุกไฟล์");
  });

  it("warns prominently when any file was skipped", () => {
    const html = render({ ...completed, coverage: [
      ...completed.coverage, { path: "data.unknown", status: "skipped", reason: "พบ NUL" },
    ] });
    expect(html).toContain("ตรวจไม่ครบ");
    expect(html).toContain("ผลครอบคลุมเฉพาะส่วนที่ตรวจได้");
    expect(html).toContain("พบ NUL");
  });

  it("does not report a clean result when coverage is missing", () => {
    const html = render({ ...completed, coverage: [] });
    expect(html).toContain("ข้อมูลไม่เพียงพอสำหรับประเมิน");
    expect(html).not.toContain("ไม่พบสิ่งที่ตรงกับกฎ");
    expect(html).not.toContain("ครบทุกไฟล์");
  });

  it.each(["0.1.0", "0.2.0", "0.2.1", "0.2.2", "0.3.0"])("treats scanner %s reports as old", (version) => {
    const html = render({ ...completed, scannerVersion: version });
    expect(html).toContain("รายงานรุ่นเก่า");
    expect(html).not.toContain("ครบทุกไฟล์");
  });

  it("does not treat a newer scanner version as old", () => {
    const html = render({ ...completed, scannerVersion: "0.4.0" });
    expect(html).not.toContain("รายงานรุ่นเก่า");
    expect(html).toContain("ครบทุกไฟล์");
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
  it("says what the skill does by topic, with counts, and never a risk verdict or score", () => {
    const html = render({
      ...completed,
      riskLevel: "high",
      score: 72,
      findings: [finding(), finding({ severity: "medium", file: "SKILL.md", line: 24 }), finding({ severity: "low" })],
      coverage: manyFiles,
    });
    expect(html).toContain("สิ่งที่ skill นี้ทำ");
    expect(html).toContain("พบ 3 จุดที่ควรรู้ก่อนติดตั้ง");
    expect(html).toContain("ดาวน์โหลดแล้วรันทันที (3)");
    expect(html).toContain("ไม่ได้ตัดสินว่าอันตรายหรือไม่");
    expect(html).not.toContain("ระดับความเสี่ยง");
    expect(html).not.toContain("/100");
    expect(html).not.toContain("ไม่ควรติดตั้ง");
    expect(html).not.toMatch(/>(วิกฤต|สูง|กลาง|ต่ำ)</);
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

  it("states how many files were read next to the summary", () => {
    const html = render({ ...completed, riskLevel: "medium", score: 90, findings: [finding({ severity: "medium" })], coverage: manyFiles });
    expect(html).toContain("อ่านครบ 12 จาก 15 ไฟล์");
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

  it("splits one skill's findings into topics, each with a note to weigh it", () => {
    const html = render({
      ...completed,
      riskLevel: "critical",
      findings: [
        finding({ rule: "hidden.html-comment", file: "SKILL.md", line: 7, severity: "high" }),
        finding(),
        finding({ rule: "script.unknown-new-rule", line: 99 }),
      ],
    });
    const hidden = html.indexOf("ข้อความที่คนอ่านไม่เห็นบนหน้าเว็บ (1)");
    const remote = html.indexOf("ดาวน์โหลดแล้วรันทันที (1)");
    const other = html.indexOf("อื่นๆ (1)");
    expect(hidden).toBeGreaterThan(-1);
    expect(remote).toBeGreaterThan(hidden); // hidden text is listed first
    expect(other).toBeGreaterThan(remote); // an unmapped rule is still shown
    expect(html).toContain("โปรแกรมติดตั้งทางการหลายตัวใช้วิธีนี้");
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
    expect(html).toContain("ไม่พบสิ่งที่ตรงกับกฎ");
    expect(html).toContain("ไม่ได้แปลว่าปลอดภัย");
    expect(html).not.toMatch(/(?<!ไม่ได้แปลว่า)ปลอดภัย/);
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

describe("what the skill is about", () => {
  const info = {
    root: "",
    name: "pptx",
    description: "Create and edit PowerPoint decks.",
    summary: "ช่วยสร้างและแก้ไขไฟล์ PowerPoint",
  };

  it("shows the Thai summary with the original behind a toggle", () => {
    const html = render({ ...completed, skills: [info] });
    expect(html).toContain("skill นี้คืออะไร · pptx");
    expect(html).toContain("ช่วยสร้างและแก้ไขไฟล์ PowerPoint");
    expect(html).toContain("สรุปโดย AI");
    expect(html).toContain("ดูคำอธิบายเต็ม (ต้นฉบับ)");
    expect(html).toContain("Create and edit PowerPoint decks.");
  });

  it("falls back to the original description without an AI label", () => {
    const html = render({ ...completed, skills: [{ ...info, summary: null }] });
    expect(html).toContain("Create and edit PowerPoint decks.");
    expect(html).not.toContain("สรุปโดย AI");
  });

  it("says so when SKILL.md has no description", () => {
    const html = render({ ...completed, skills: [{ ...info, description: null, summary: null }] });
    expect(html).toContain("ไม่มีคำอธิบายใน SKILL.md");
    expect(html).not.toContain("ดูคำอธิบายเต็ม");
  });

  it("asks for a rescan on reports made before descriptions were kept", () => {
    expect(render(completed)).toContain("รายงานนี้สร้างก่อนที่ระบบจะเก็บคำอธิบายของ skill");
    expect(render({ ...completed, skills: null })).toContain("รายงานนี้สร้างก่อนที่ระบบจะเก็บคำอธิบายของ skill");
  });

  it("lists many skills and folds the rest", () => {
    const skills = Array.from({ length: 8 }, (_, i) => ({ ...info, root: `skills/s${i}`, summary: `สรุป ${i}` }));
    const html = render({ ...completed, skills });
    expect(html).toContain("skill ใน repo นี้ (8)");
    expect(html).toContain("ดูอีก 2 skill");
    expect(html).toContain("s7");
  });

  it("renders description text as plain text, not HTML", () => {
    const html = render({ ...completed, skills: [{ ...info, summary: null, description: "<img src=x onerror=alert(1)>" }] });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("what the skill uses", () => {
  const empty = { programs: [], sites: [], secrets: [], envVars: [], paths: [], instructionsOnly: false };
  const uses = {
    ...empty,
    programs: ["git", "npm", "docker"],
    sites: ["github.com", "docs.dev", "a.dev", "b.dev", "c.dev", "d.dev"],
    secrets: ["VERCEL_TOKEN"],
  };
  const info = { root: "", name: "deploy", description: "Deploys.", summary: null, uses };
  const inside = (html: string, heading: string) => {
    const start = html.indexOf(heading);
    return start === -1 ? "" : html.slice(start);
  };

  it("leads with the rule result, then what the skill uses as numbers", () => {
    const html = render({ ...completed, skills: [info] });
    expect(html).toContain("ผลตรวจด้วยกฎ");
    expect(html).toContain("ไม่พบรูปแบบเสี่ยงที่รู้จัก");
    expect(html).not.toContain("ไม่พบสิ่งที่ตรงกับกฎ");
    // the tiles carry the whole inventory line for screen readers
    expect(html).toContain('aria-label="ใช้ 3 โปรแกรม · อ้างถึง 6 เว็บ · แตะความลับ 1 ตัว"');
    expect(html.indexOf("ไม่พบรูปแบบเสี่ยงที่รู้จัก")).toBeLessThan(html.indexOf('aria-label="ใช้ 3 โปรแกรม'));
  });

  it("keeps the note that rules cannot read natural language and never says safe", () => {
    const html = render({ ...completed, skills: [info] });
    expect(html).toContain("ไม่ได้แปลว่าปลอดภัย");
    expect(html).not.toMatch(/(?<!ไม่ได้แปลว่า)ปลอดภัย/);
  });

  it("shows the findings summary after the inventory when rules matched", () => {
    const html = render({ ...completed, riskLevel: "high", skills: [info], findings: [finding(), finding({ line: 20 })] });
    expect(html).toContain("ใช้ 3 โปรแกรม");
    expect(html).toContain("พบ 2 จุดที่ควรรู้ก่อนติดตั้ง");
    expect(html).not.toContain("ไม่พบรูปแบบเสี่ยงที่รู้จัก");
    expect(html).toContain("หลักฐาน (2)");
  });

  it("says plainly that a skill with no commands is only advice for the AI", () => {
    const html = render({ ...completed, skills: [{ ...info, uses: { ...empty, instructionsOnly: true } }] });
    expect(html).toContain("skill นี้มีแต่คำแนะนำให้ AI ไม่มีคำสั่งให้รันโปรแกรม");
    expect(html).toContain("ตัวสแกนอ่านไม่ได้");
    expect(html).toContain("ไม่ได้แปลว่าปลอดภัย");
    expect(html).not.toContain("โปรแกรมที่สั่งรัน");
  });

  it("has a card with the five groups, each as monospace chips, and hides empty groups", () => {
    const html = render({
      ...completed,
      skills: [{ ...info, uses: { ...uses, envVars: ["PORT"], paths: ["~/.codex"] } }],
    });
    const card = inside(html, "skill นี้ใช้อะไรบ้าง");
    for (const title of ["โปรแกรมที่สั่งรัน", "เว็บที่อ้างถึง", "ความลับที่ใช้", "ตัวแปรอื่น", "ไฟล์/โฟลเดอร์นอกโปรเจค"]) {
      expect(card).toContain(title);
    }
    expect(card).toMatch(/<li class="[^"]*font-mono[^"]*">docker<\/li>/);
    expect(card).toContain("~/.codex");
    expect(card).toContain("VERCEL_TOKEN");
    const html2 = render({ ...completed, skills: [{ ...info, uses: { ...empty, programs: ["git"] } }] });
    expect(inside(html2, "skill นี้ใช้อะไรบ้าง")).not.toContain("เว็บที่อ้างถึง");
  });

  it("gives secrets a neutral note and does not call sites contacted", () => {
    const card = inside(render({ ...completed, skills: [info] }), "skill นี้ใช้อะไรบ้าง");
    expect(card).toContain("เป็นเรื่องปกติของหลายเครื่องมือ");
    expect(card).toContain("ดูว่ามันถูกส่งไปที่ไหน");
    expect(card).toContain("ไม่ได้แปลว่า skill ติดต่อเว็บนั้นจริง");
  });

  it("shows the first 8 chips and folds the rest behind a toggle", () => {
    const programs = Array.from({ length: 11 }, (_, i) => `tool${String.fromCharCode(97 + i)}`);
    const card = inside(render({ ...completed, skills: [{ ...info, uses: { ...empty, programs } }] }), "skill นี้ใช้อะไรบ้าง");
    expect(card).toContain("ดูทั้งหมด (11)");
    const [visible, folded] = card.split("<details");
    for (const p of programs.slice(0, 8)) expect(visible).toContain(`>${p}<`);
    for (const p of programs.slice(8)) {
      expect(visible).not.toContain(`>${p}<`);
      expect(folded).toContain(`>${p}<`);
    }
  });

  it("shows no toggle when everything fits", () => {
    const card = inside(render({ ...completed, skills: [{ ...info, uses: { ...empty, programs: ["git", "npm"] } }] }), "skill นี้ใช้อะไรบ้าง");
    expect(card).not.toContain("ดูทั้งหมด");
  });

  it("shows sites as plain text, never as links", () => {
    const html = render({ ...completed, skills: [{ ...info, uses: { ...empty, sites: ["evil.dev", "docs.dev"] } }] });
    expect(html).toContain("evil.dev");
    expect(html).not.toMatch(/<a [^>]*evil\.dev/);
    expect(html).not.toMatch(/href="[^"]*(evil|docs)\.dev/);
  });

  it("prints inventory values as text, never as HTML", () => {
    const html = render({ ...completed, skills: [{ ...info, uses: { ...empty, programs: ["<img src=x onerror=alert(1)>"] } }] });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("puts a count line on each skill row and the full inventory inside the expanded row", () => {
    const skills = [
      { ...info, root: "skills/a", name: "a", uses },
      { ...info, root: "skills/b", name: "b", description: null, uses: { ...empty, instructionsOnly: true } },
      { ...info, root: "skills/c", name: "c", description: "C", uses: undefined },
    ];
    const html = render({
      ...completed,
      coverage: skills.map((k) => ({ path: `${k.root}/SKILL.md`, status: "full" })),
      skills,
    });
    const about = html.slice(html.indexOf("skill ใน repo นี้ (3)"), html.indexOf("skill นี้ใช้อะไรบ้าง"));
    expect(about).toContain("ใช้ 3 โปรแกรม · อ้างถึง 6 เว็บ · แตะความลับ 1 ตัว");
    expect(about).toContain("skill นี้มีแต่คำแนะนำให้ AI ไม่มีคำสั่งให้รันโปรแกรม");
    // the groups sit inside the row's <details>, so a closed row stays compact
    const row = about.slice(about.indexOf("<details"), about.indexOf("</details>"));
    expect(row).toContain("โปรแกรมที่สั่งรัน");
    expect(row).toContain("VERCEL_TOKEN");
  });

  it("merges several skills into one headline and card", () => {
    const skills = [
      { ...info, root: "skills/a", name: "a", uses: { ...empty, programs: ["git", "npm"] } },
      { ...info, root: "skills/b", name: "b", uses: { ...empty, programs: ["git", "docker"], secrets: ["API_KEY"] } },
    ];
    const html = render({ ...completed, skills });
    expect(html).toContain("ใช้ 3 โปรแกรม · แตะความลับ 1 ตัว");
    expect(html).toContain("รวมจาก 2 skill");
  });

  it("still renders a report made before the inventory existed", () => {
    const html = render({ ...completed, skills: [{ root: "", name: "old", description: "Old.", summary: null }] });
    expect(html).toContain("ไม่พบสิ่งที่ตรงกับกฎ");
    expect(html).toContain("รายงานนี้สร้างก่อนที่ระบบจะสรุปสิ่งที่ skill ใช้");
    expect(html).toContain("“ตรวจเวอร์ชันล่าสุด”");
    expect(html).not.toContain("โปรแกรมที่สั่งรัน");
    expect(html).toContain("ไม่ได้แปลว่าปลอดภัย");
  });

  it("still says there is not enough data when nothing was read, whatever the inventory says", () => {
    const html = render({ ...completed, coverage: [], skills: [info] });
    expect(html).toContain("ข้อมูลไม่เพียงพอสำหรับประเมิน");
    expect(html).not.toContain("ไม่พบรูปแบบเสี่ยงที่รู้จัก");
  });

  it("keeps coverage, evidence and the old-report warning alongside the inventory", () => {
    const html = render({
      ...completed,
      scannerVersion: "0.3.0",
      riskLevel: "high",
      skills: [info],
      findings: [finding()],
      coverage: [{ path: "SKILL.md", status: "full" }, { path: "big.md", status: "partial", reason: "ไฟล์ใหญ่" }],
    });
    expect(html).toContain("รายงานรุ่นเก่า");
    expect(html).toContain("ขอบเขตการตรวจ");
    expect(html).toContain("หลักฐาน (1)");
    expect(html).toContain("ตรวจไม่ครบ");
    expect(html).toContain("skill นี้คืออะไร");
  });
});

describe("AI findings kept apart from rule findings", () => {
  const rule = (over: object = {}) => finding({ rule: "script.pipe-to-shell", file: "scripts/a.sh", ...over });
  const ai = (over: object = {}) =>
    finding({ rule: "llm.instruction-override", severity: "medium", file: "SKILL.md", line: 7, message: "AI พบคำสั่งให้ข้ามการยืนยัน", excerpt: "skip confirmation", ...over });
  const read = [{ path: "SKILL.md", status: "full", llm: "read" }, { path: "scripts/a.sh", status: "full", llm: "read" }];
  const unread = read.map((c) => ({ ...c, llm: "not_read" }));
  const BADGE = "AI ตั้งข้อสังเกต · อาจคลาดเคลื่อน";
  const NOTE = "ข้อความที่ยกมาตรวจแล้วว่ามีอยู่ในไฟล์จริง แต่การตีความมาจาก AI อาจผิดได้";
  const count = (html: string, text: string) => html.split(text).length - 1;

  it("rule findings only: no AI badge, note or counts", () => {
    const html = render({ ...completed, riskLevel: "high", coverage: unread, findings: [rule(), rule({ line: 20 })] });
    expect(html).toContain("พบ 2 จุดที่ควรรู้ก่อนติดตั้ง");
    expect(html).not.toContain("AI");
    expect(html).not.toContain(BADGE);
    expect(html).not.toContain(NOTE);
  });

  it("AI findings only: badge and note on each, counted as AI, none from rules", () => {
    const html = render({ ...completed, riskLevel: "medium", coverage: read, findings: [ai(), ai({ line: 9 })] });
    expect(count(html, BADGE)).toBe(2);
    expect(count(html, NOTE)).toBe(2);
    expect(html).toContain("ไม่พบรูปแบบเสี่ยงที่รู้จักจากกฎ · AI ตั้งข้อสังเกต 2 จุด");
    expect(html).toContain("AI อ่าน 2 จาก 2 ไฟล์");
    expect(html).not.toContain("ไม่พบสิ่งที่ตรงกับกฎ");
  });

  it("mixed: counts them separately and lists rule findings before AI ones in a topic", () => {
    // both land in the same topic ("ai-instruction") so the order inside it is what is tested
    const html = render({
      ...completed,
      riskLevel: "high",
      coverage: read,
      findings: [
        ai({ rule: "llm.instruction-override", message: "จาก AI ก่อน" }),
        finding({ rule: "hidden.instruction-override", file: "SKILL.md", line: 3, message: "จากกฎ" }),
        rule({ message: "คำสั่งรันจากกฎ" }),
      ],
    });
    expect(html).toContain("พบ 2 จุดจากกฎ · AI ตั้งข้อสังเกตอีก 1 จุด");
    expect(count(html, BADGE)).toBe(1);
    expect(html.indexOf("จากกฎ")).toBeLessThan(html.indexOf("จาก AI ก่อน"));
    // the badge belongs to the AI row only
    const aiRow = html.slice(html.lastIndexOf("<details", html.indexOf("จาก AI ก่อน")));
    expect(aiRow.slice(0, aiRow.indexOf(BADGE) + 1)).toContain("SKILL.md:7");
    expect(html.slice(0, html.indexOf("จากกฎ"))).not.toContain(BADGE);
  });

  it("AI did not read the files, or no llm marks at all: nothing about AI", () => {
    for (const coverage of [unread, [{ path: "SKILL.md", status: "full" }, { path: "scripts/a.sh", status: "full" }]]) {
      const html = render({ ...completed, riskLevel: "high", coverage, findings: [rule()] });
      expect(html).not.toMatch(/AI อ่าน/);
      expect(html).not.toContain(BADGE);
    }
  });

  it("AI read only some files: says how many", () => {
    const some = [read[0], { ...read[1], llm: "not_read" }, { path: "ref.md", status: "full", llm: "not_read" }];
    const html = render({ ...completed, riskLevel: "high", coverage: some, findings: [rule(), ai()] });
    expect(html).toContain("AI อ่าน 1 จาก 3 ไฟล์");
  });

  it("keeps AI text as plain text", () => {
    const html = render({ ...completed, riskLevel: "medium", coverage: read, findings: [ai({ excerpt: "<img src=x onerror=1>", message: "<b>x</b>" })] });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("also separates them in the inventory headline layout", () => {
    const html = render({
      ...completed, riskLevel: "high", coverage: read, findings: [rule(), ai()],
      skills: [{ root: "", name: "s", description: "d", summary: null, uses: { programs: ["git"], sites: [], secrets: [], envVars: [], paths: [], instructionsOnly: false } }],
    });
    expect(html).toContain("ใช้ 1 โปรแกรม");
    expect(html).toContain("พบ 1 จุดจากกฎ · AI ตั้งข้อสังเกตอีก 1 จุด");
  });
});
