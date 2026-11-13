// Pure data and logic behind the report page: types, Thai labels, and the numbers the
// page shows (risk level, file counts, warnings). No React here, so it is easy to test.

import type { SkillUses } from "../../../lib/inventory"; // relative: the tests run without the @/ alias

export type { SkillUses };

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type RiskLevel = Severity | "none_found";

export interface Finding {
  severity: Severity;
  rule: string;
  file: string;
  line: number | null;
  message: string;
  excerpt: string | null;
}

export interface Coverage {
  path: string;
  status: "full" | "partial" | "skipped";
  reason?: string;
}

/** What a skill says it does, from its SKILL.md front matter (see src/lib/skill-info.ts). */
export interface SkillInfo {
  root: string;
  name: string | null;
  description: string | null;
  /** one-line Thai summary written by an LLM, when it was available */
  summary: string | null;
  /** what the skill uses; missing on scans made before the inventory existed */
  uses?: SkillUses | null;
}

export interface ScanResponse {
  id: string;
  repo: string;
  /** folder inside the repo when one skill was scanned; null/missing = whole repo */
  path?: string | null;
  commitSha: string | null;
  status: "pending" | "running" | "done" | "failed";
  step: string | null;
  error: string | null;
  score: number | null;
  riskLevel: RiskLevel | null;
  coverage: Coverage[];
  scannerVersion?: string | null;
  /** null or missing = scanned before descriptions were recorded */
  skills?: SkillInfo[] | null;
  findings: Finding[];
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

/** The risk level as one Thai word, shown large at the top of the report. */
export const RISK_LABEL: Record<Severity, string> = {
  critical: "วิกฤต",
  high: "สูง",
  medium: "กลาง",
  low: "ต่ำ",
  info: "ข้อมูล",
};

export const VERDICT: Record<RiskLevel, { title: string; detail: string }> = {
  critical: {
    title: "ไม่ควรติดตั้ง",
    detail: "พบรูปแบบที่อันตรายร้ายแรง เช่น ขโมยข้อมูล รันโค้ดจากภายนอก หรือซ่อนคำสั่งไว้",
  },
  high: { title: "เสี่ยงสูง", detail: "พบสิ่งที่ควรอ่านโค้ดเองให้เข้าใจก่อนติดตั้ง" },
  medium: { title: "ควรตรวจเพิ่ม", detail: "พบจุดที่อาจเป็นปัญหา ขึ้นกับว่า skill นี้ทำหน้าที่อะไร" },
  low: { title: "พบเรื่องเล็กน้อย", detail: "ไม่พบรูปแบบอันตรายร้ายแรง มีแค่จุดที่ควรรู้ไว้" },
  info: { title: "พบเรื่องเล็กน้อย", detail: "ไม่พบรูปแบบอันตรายร้ายแรง" },
  none_found: {
    title: "ไม่พบปัญหาที่รู้จัก",
    detail: "ไม่ได้แปลว่าปลอดภัย: ตัวสแกนรู้จักเฉพาะรูปแบบที่มีในชุดกฎ คำสั่งที่เขียนเป็นภาษาคนธรรมดายังตรวจไม่ได้",
  },
};

/**
 * Scanner 0.3.1 is the first version that records what it really inspected. Reports from
 * older versions may count skipped files as read, so their coverage and score are not trusted.
 * Compared as numbers (not a fixed list), so 0.2.1, 0.2.2 and any future version are handled.
 */
export const COVERAGE_RELIABLE_FROM: readonly [number, number, number] = [0, 3, 1];

export function isLegacyReport(version: string | null | undefined): boolean {
  const m = version ? /^(\d+)\.(\d+)\.(\d+)/.exec(version) : null;
  if (!m) return true; // unknown version: do not trust it
  const v = [Number(m[1]), Number(m[2]), Number(m[3])];
  for (let i = 0; i < 3; i++) {
    if (v[i] !== COVERAGE_RELIABLE_FROM[i]) return v[i] < COVERAGE_RELIABLE_FROM[i];
  }
  return false;
}

export interface ReportSummary {
  level: RiskLevel;
  findingCount: number;
  severityCounts: Partial<Record<Severity, number>>;
  files: { full: number; partial: number; skipped: number; read: number };
  /** files read only in part, or not at all */
  incomplete: Coverage[];
  /** no file was actually read, so there is nothing to base a verdict on */
  insufficient: boolean;
  legacy: boolean;
  showScore: boolean;
}

/** Every number on the report comes from here, from the stored scan result. */
export function summarize(data: ScanResponse): ReportSummary {
  const severityCounts: Partial<Record<Severity, number>> = {};
  for (const f of data.findings) severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;

  const count = (s: Coverage["status"]) => data.coverage.filter((c) => c.status === s).length;
  const files = { full: count("full"), partial: count("partial"), skipped: count("skipped"), read: 0 };
  files.read = files.full + files.partial;

  const insufficient = files.read === 0;
  const legacy = isLegacyReport(data.scannerVersion);
  return {
    level: data.riskLevel ?? "none_found",
    findingCount: data.findings.length,
    severityCounts,
    files,
    incomplete: data.coverage.filter((c) => c.status !== "full"),
    insufficient,
    legacy,
    showScore: data.score !== null && !insufficient && !legacy,
  };
}

export type RecheckOutcome =
  | { kind: "current" } // the server answered with this same report: nothing newer to scan
  | { kind: "newer"; id: string } // a different scan: new commit, newer rules, or this one failed
  | { kind: "error"; message: string };

/**
 * What POST /api/scans means for the open report. The API looks up the repo's latest commit
 * and reuses a finished scan only for the same commit and the same scanner version, so
 * getting this report's own id back proves it is already up to date.
 */
export function interpretRecheck(
  currentId: string,
  ok: boolean,
  body: { id?: string; error?: string },
): RecheckOutcome {
  if (!ok || !body.id) {
    return { kind: "error", message: body.error ?? "ตรวจเวอร์ชันล่าสุดไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
  return body.id === currentId ? { kind: "current" } : { kind: "newer", id: body.id };
}

export function githubLink(repo: string, sha: string | null, file: string, line: number | null) {
  const ref = sha ?? "HEAD";
  const path = file.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${repo}/blob/${ref}/${path}${line ? `#L${line}` : ""}`;
}

// ---------- per-skill view ----------
// People install one skill, not a whole repo. A skill is a folder that holds a SKILL.md;
// every file belongs to the deepest such folder above it.

export interface SkillGroup {
  /** folder of the skill ("" = repo root); null = files outside every skill folder */
  root: string | null;
  name: string;
  findings: Finding[];
  /** highest severity among its findings */
  top: Severity | null;
  fileCount: number;
  /** files of this skill read only in part or skipped */
  incompleteCount: number;
  /** its SKILL.md description, when the scan recorded one */
  info?: SkillInfo;
}

export const OUTSIDE_SKILLS = "ไฟล์นอกโฟลเดอร์ skill";

/** Folder name, or the front matter name for a skill at the repo root. */
export function skillTitle(info: Pick<SkillInfo, "root" | "name">): string {
  if (info.root === "") return info.name ?? "skill ที่ราก repo";
  return info.root.split("/").pop() ?? info.root;
}

export function groupBySkill(findings: Finding[], coverage: Coverage[], skills: SkillInfo[] = []): SkillGroup[] {
  const roots = coverage
    .filter((c) => c.path === "SKILL.md" || c.path.endsWith("/SKILL.md"))
    .map((c) => (c.path === "SKILL.md" ? "" : c.path.slice(0, -"/SKILL.md".length)))
    .sort((a, b) => b.length - a.length); // deepest first

  const rootOf = (path: string): string | null => roots.find((r) => r === "" || path.startsWith(`${r}/`)) ?? null;

  const groups = new Map<string | null, SkillGroup>();
  const get = (root: string | null) => {
    let g = groups.get(root);
    if (!g) {
      const name = root === null ? OUTSIDE_SKILLS : root === "" ? "skill ที่ราก repo" : (root.split("/").pop() ?? root);
      const info = root === null ? undefined : skills.find((k) => k.root === root);
      g = { root, name: info ? skillTitle(info) : name, findings: [], top: null, fileCount: 0, incompleteCount: 0, info };
      groups.set(root, g);
    }
    return g;
  };

  for (const r of roots) get(r);
  for (const c of coverage) {
    const g = get(rootOf(c.path));
    g.fileCount++;
    if (c.status !== "full") g.incompleteCount++;
  }
  for (const f of findings) {
    const g = get(rootOf(f.file));
    g.findings.push(f);
    if (g.top === null || SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(g.top)) g.top = f.severity;
  }

  return [...groups.values()].sort((a, b) => b.findings.length - a.findings.length || a.name.localeCompare(b.name));
}

/** One line per distinct reason a file was not fully read, biggest first. */
export function incompleteReasons(items: Coverage[]): { status: Coverage["status"]; reason: string; count: number }[] {
  const out = new Map<string, { status: Coverage["status"]; reason: string; count: number }>();
  for (const c of items) {
    const reason = c.reason ?? "ไม่ระบุเหตุผล";
    const key = `${c.status}|${reason}`;
    const cur = out.get(key);
    if (cur) cur.count++;
    else out.set(key, { status: c.status, reason, count: 1 });
  }
  return [...out.values()].sort((a, b) => b.count - a.count);
}

// ---------- "what this skill does" view ----------
// A survey of 1,041 real skills (2026-11-12, see README) showed that severity verdicts from
// pattern rules are often wrong: "critical" was mostly the official `curl … | sh` installers.
// What a rule matched is still a true fact about the skill, so the report groups findings by
// what the skill does and leaves the judgement to the reader.

export type TopicId =
  | "hidden-text"
  | "ai-instruction"
  | "agent-bypass"
  | "send-out"
  | "credentials"
  | "run-remote"
  | "privilege"
  | "persistence"
  | "destructive"
  | "other";

export interface Topic {
  id: TopicId;
  title: string;
  /** one line that helps the reader weigh it; never a verdict */
  note: string;
}

/** Display order: what a reader cannot see for themselves comes first. */
export const TOPICS: Topic[] = [
  {
    id: "hidden-text",
    title: "ข้อความที่คนอ่านไม่เห็นบนหน้าเว็บ",
    note: "AI อ่านได้ แต่ไม่แสดงบน GitHub เช่น HTML comment หรืออักขระที่มองไม่เห็น หลายครั้งเป็นแค่หมายเหตุของผู้เขียน",
  },
  {
    id: "ai-instruction",
    title: "คำสั่งที่เปลี่ยนวิธีทำงานของ AI",
    note: "เช่น ให้ข้ามการยืนยัน หรือให้เมินคำสั่งอื่น บางครั้งเขียนไว้เพื่อป้องกันการถูกหลอก ควรอ่านบริบทรอบข้าง",
  },
  {
    id: "agent-bypass",
    title: "สั่ง AI ตัวอื่นให้ทำงานโดยไม่ขออนุญาต",
    note: "เปิด AI coding agent อีกตัวโดยปิดการถามก่อนรันคำสั่งหรือแก้ไฟล์ บางงานตั้งแบบนี้ในสภาพแวดล้อมที่แยกไว้ ควรดูว่า agent นั้นรันที่ไหนและเข้าถึงอะไรได้",
  },
  {
    id: "send-out",
    title: "ส่งข้อมูลออกไปภายนอก",
    note: "skill ที่เรียก API ต้องทำแบบนี้อยู่แล้ว ควรดูว่าส่งอะไร และส่งไปที่ไหน",
  },
  {
    id: "credentials",
    title: "แตะรหัสผ่าน key หรือ token",
    note: "ควรดูว่าอ่านไฟล์ไหน และเกี่ยวกับงานที่ skill บอกว่าทำหรือไม่",
  },
  {
    id: "run-remote",
    title: "ดาวน์โหลดแล้วรันทันที",
    note: "โปรแกรมติดตั้งทางการหลายตัวใช้วิธีนี้ เช่น curl … | sh ควรดูว่าดาวน์โหลดจากที่ไหน",
  },
  {
    id: "privilege",
    title: "ขอสิทธิ์ผู้ดูแลระบบ",
    note: "เช่น sudo พบได้ทั่วไปในขั้นตอนติดตั้งโปรแกรม",
  },
  {
    id: "persistence",
    title: "ตั้งให้รันเองภายหลัง",
    note: "เช่น cron หรือไฟล์เริ่มต้นของ shell ควรดูว่าตั้งให้รันอะไร",
  },
  {
    id: "destructive",
    title: "ลบข้อมูลหรือปิดระบบป้องกัน",
    note: "ควรดูว่าลบอะไร หรือปิดการตรวจสอบส่วนไหน",
  },
  { id: "other", title: "อื่นๆ", note: "รายการที่ยังไม่ได้จัดหมวด" },
];

const RULE_TOPIC: Record<string, TopicId> = {
  "hidden.zero-width": "hidden-text",
  "hidden.unicode-tags": "hidden-text",
  "hidden.bidi-control": "hidden-text",
  "hidden.html-comment": "hidden-text",
  "hidden.css-hidden": "hidden-text",
  "hidden.null-byte": "hidden-text",
  "hidden.encoded-blob": "hidden-text",
  "hidden.oversized-file": "hidden-text",
  "llm.obfuscation": "hidden-text",
  "llm.concealment": "hidden-text",
  "hidden.instruction-override": "ai-instruction",
  "hidden.skip-confirmation": "ai-instruction",
  "hidden.quoted-injection-phrase": "ai-instruction",
  "llm.instruction-override": "ai-instruction",
  "llm.scope-violation": "ai-instruction",
  "llm.reviewer-manipulation": "ai-instruction",
  "llm.undisclosed-commercial-steering": "ai-instruction",
  "script.agent-bypass-permissions": "agent-bypass",
  "script.exfiltration": "send-out",
  "script.exfil-endpoint": "send-out",
  "script.credential-exfil": "send-out",
  "llm.data-exfiltration": "send-out",
  "llm.third-party-content-exposure": "send-out",
  "script.credential-access": "credentials",
  "llm.credential-access": "credentials",
  "llm.secret-handling": "credentials",
  "llm.financial-access": "credentials",
  "script.pipe-to-shell": "run-remote",
  "script.download-exec": "run-remote",
  "script.encoded-exec": "run-remote",
  "llm.remote-code-or-instructions": "run-remote",
  "script.privilege": "privilege",
  "llm.privilege-or-persistence": "privilege",
  "script.persistence": "persistence",
  "script.destructive": "destructive",
  "script.disable-security": "destructive",
  "llm.destructive-or-security-disabling": "destructive",
};

export function topicOf(rule: string): TopicId {
  return RULE_TOPIC[rule] ?? "other";
}

/** Findings split by topic, in display order; topics with nothing are left out. */
export function byTopic(findings: Finding[]): { topic: Topic; findings: Finding[] }[] {
  return TOPICS.map((topic) => ({ topic, findings: findings.filter((f) => topicOf(f.rule) === topic.id) })).filter(
    (t) => t.findings.length > 0,
  );
}

// ---------- "what this skill uses" view ----------
// A neutral inventory (programs, sites, secrets …) that every report can show, even when no
// rule matched. It lists what the files contain; it never says whether that is a problem.

export const INSTRUCTIONS_ONLY = "skill นี้มีแต่คำแนะนำให้ AI ไม่มีคำสั่งให้รันโปรแกรม";
export const INSTRUCTIONS_ONLY_NOTE =
  "คำแนะนำที่เขียนเป็นภาษาคนธรรมดา ตัวสแกนอ่านไม่ได้ ควรอ่าน SKILL.md ด้วยตนเอง";
/** Chips shown before the “ดูทั้งหมด” toggle. */
export const SHOWN_CHIPS = 8;
/** A merged list for a repo with many skills is shown up to this many entries. */
export const MAX_MERGED = 100;

export type UsesGroupKey = "programs" | "sites" | "secrets" | "envVars" | "paths";

export const USES_GROUPS: { key: UsesGroupKey; title: string; note?: string }[] = [
  {
    key: "programs",
    title: "โปรแกรมที่สั่งรัน",
    note: "ดูจากคำสั่งในบล็อกโค้ดและสคริปต์ของ skill ไม่ได้แปลว่าจะรันครบทุกตัวเสมอไป",
  },
  {
    key: "sites",
    title: "เว็บที่อ้างถึง",
    note: "ชื่อเว็บที่ปรากฏในไฟล์ หลายรายการเป็นลิงก์เอกสาร ไม่ได้แปลว่า skill ติดต่อเว็บนั้นจริง แสดงเป็นข้อความเท่านั้น ไม่ใช่ลิงก์",
  },
  {
    key: "secrets",
    title: "ความลับที่ใช้",
    note: "การใช้ token หรือ key เป็นเรื่องปกติของหลายเครื่องมือ ควรดูว่ามันถูกส่งไปที่ไหน",
  },
  { key: "envVars", title: "ตัวแปรอื่น" },
  {
    key: "paths",
    title: "ไฟล์/โฟลเดอร์นอกโปรเจค",
    note: "ตำแหน่งนอกโฟลเดอร์ของโปรเจค เช่น โฟลเดอร์ตั้งค่าในเครื่องของผู้ใช้",
  },
];

/** “ใช้ 3 โปรแกรม · อ้างถึง 6 เว็บ · แตะความลับ 1 ตัว”: only the groups that have something. */
export function usesLine(u: SkillUses, skillCount = 1): string {
  if (u.instructionsOnly) {
    return skillCount > 1
      ? `skill ทั้ง ${skillCount} ตัวมีแต่คำแนะนำให้ AI ไม่มีคำสั่งให้รันโปรแกรม`
      : INSTRUCTIONS_ONLY;
  }
  const parts: string[] = [];
  if (u.programs.length) parts.push(`ใช้ ${u.programs.length} โปรแกรม`);
  if (u.sites.length) parts.push(`อ้างถึง ${u.sites.length} เว็บ`);
  if (u.secrets.length) parts.push(`แตะความลับ ${u.secrets.length} ตัว`);
  if (u.envVars.length) parts.push(`ตัวแปรอื่น ${u.envVars.length} ตัว`);
  if (u.paths.length) parts.push(`อ้างถึงที่นอกโปรเจค ${u.paths.length} ที่`);
  return parts.join(" · ");
}

/** What the rules found, in one short line. Never a verdict. */
export function ruleResultLine(findingCount: number): string {
  return findingCount === 0 ? "ไม่พบรูปแบบเสี่ยงที่รู้จัก" : `พบ ${findingCount} จุดที่ควรรู้ก่อนติดตั้ง`;
}

/**
 * The inventories of several skills as one: each list is the union, items used by more
 * skills first. Skills scanned before the inventory existed (no `uses`) are left out; null
 * when none of them has one, so the report can tell “not recorded” from “nothing found”.
 */
export function mergeUses(skills: Pick<SkillInfo, "uses">[]): SkillUses | null {
  const withUses = skills.map((k) => k.uses).filter((u): u is SkillUses => !!u);
  if (withUses.length === 0) return null;
  if (withUses.length === 1) return withUses[0];
  const merge = (key: UsesGroupKey): string[] => {
    const counts = new Map<string, number>();
    for (const u of withUses) for (const v of u[key]) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([v]) => v);
  };
  const lists = { programs: merge("programs"), sites: merge("sites"), secrets: merge("secrets"), envVars: merge("envVars"), paths: merge("paths") };
  return { ...lists, instructionsOnly: Object.values(lists).every((l) => l.length === 0) };
}
