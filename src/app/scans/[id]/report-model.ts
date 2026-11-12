// Pure data and logic behind the report page: types, Thai labels, and the numbers the
// page shows (risk level, file counts, warnings). No React here, so it is easy to test.

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

export interface ScanResponse {
  id: string;
  repo: string;
  commitSha: string | null;
  status: "pending" | "running" | "done" | "failed";
  step: string | null;
  error: string | null;
  score: number | null;
  riskLevel: RiskLevel | null;
  coverage: Coverage[];
  scannerVersion?: string | null;
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
}

export const OUTSIDE_SKILLS = "ไฟล์นอกโฟลเดอร์ skill";

export function groupBySkill(findings: Finding[], coverage: Coverage[]): SkillGroup[] {
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
      g = { root, name, findings: [], top: null, fileCount: 0, incompleteCount: 0 };
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

  const rank = (g: SkillGroup) => (g.top === null ? SEVERITY_ORDER.length : SEVERITY_ORDER.indexOf(g.top));
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
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
