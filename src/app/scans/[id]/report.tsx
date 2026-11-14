"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  AI_FINDING_BADGE,
  AI_NOTE,
  byTopic,
  type Coverage,
  type Finding,
  githubLink,
  groupBySkill,
  incompleteReasons,
  INSTRUCTIONS_ONLY_NOTE,
  interpretRecheck,
  isAiFinding,
  MAX_MERGED,
  mergeUses,
  ruleResultLine,
  type ScanResponse,
  SHOWN_CHIPS,
  type SkillInfo,
  type SkillUses,
  skillTitle,
  summarize,
  topicOf,
  USES_GROUPS,
  usesLine,
} from "./report-model";
import { targetText } from "../../../lib/target"; // relative: the tests run without the @/ alias

const CARD =
  "rise flex flex-col gap-3 rounded-2xl bg-card/90 p-4 shadow-sm ring-1 ring-foreground/10 backdrop-blur-sm sm:p-5";
const WARNING =
  "rounded-lg bg-amber-100 p-3 text-sm leading-6 text-amber-950 dark:bg-amber-950 dark:text-amber-100";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const SHOWN_SKILLS = 6;
const AI_BADGE = "rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground";

/** Stagger the cards' entrance a little; the CSS turns it off for reduced motion. */
const delay = (i: number) => ({ animationDelay: `${i * 60}ms` });

const TILES: { key: keyof Omit<SkillUses, "instructionsOnly">; label: string }[] = [
  { key: "programs", label: "โปรแกรม" },
  { key: "sites", label: "เว็บที่อ้างถึง" },
  { key: "secrets", label: "ความลับ" },
  { key: "envVars", label: "ตัวแปร" },
  { key: "paths", label: "นอกโปรเจค" },
];

/** Five numbers a reader can take in at a glance; each jumps to the full list. */
function UsesTiles({ uses, skillCount }: { uses: SkillUses; skillCount: number }) {
  return (
    <ul aria-label={usesLine(uses, skillCount)} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {TILES.map((t) => {
        const n = uses[t.key].length;
        const hot = t.key === "secrets" && n > 0;
        return (
          <li key={t.key}>
            <a
              href="#uses-heading"
              className={`flex min-h-16 flex-col justify-center rounded-xl px-3 py-2 ring-1 transition-colors ${FOCUS} ${
                hot
                  ? "bg-brand-soft ring-brand/40 hover:ring-brand"
                  : n > 0
                    ? "bg-muted/60 ring-foreground/10 hover:ring-foreground/30"
                    : "ring-foreground/5 text-muted-foreground"
              }`}
            >
              <span className="text-2xl leading-8 font-bold tabular-nums">{n}</span>
              <span className="text-xs leading-4">{t.label}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Topics as bars, longest first, so the shape of the evidence shows before the details. */
function TopicBars({ topics }: { topics: ReturnType<typeof byTopic> }) {
  const max = Math.max(...topics.map((t) => t.findings.length), 1);
  return (
    <ul className="flex flex-col gap-2 text-sm leading-6">
      {[...topics]
        .sort((a, b) => b.findings.length - a.findings.length)
        .map((t) => (
          <li key={t.topic.id}>
            <a href={`#topic-${t.topic.id}`} className={`group block rounded-md ${FOCUS}`}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="group-hover:underline">{t.topic.title}</span>
                <span className="text-muted-foreground tabular-nums">{`${t.findings.length} จุด`}</span>
              </span>
              <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-foreground/70 group-hover:bg-brand"
                  style={{ width: `${Math.max(6, (t.findings.length / max) * 100)}%` }}
                />
              </span>
            </a>
          </li>
        ))}
    </ul>
  );
}

/** One bar split into read / partly read / skipped. */
function CoverageMeter({ full, partial, skipped }: { full: number; partial: number; skipped: number }) {
  const total = full + partial + skipped;
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div aria-hidden className="flex h-2.5 overflow-hidden rounded-full bg-muted">
      <span className="bg-emerald-500 dark:bg-emerald-400" style={{ width: pct(full) }} />
      <span className="bg-brand" style={{ width: pct(partial) }} />
      <span className="bg-foreground/20" style={{ width: pct(skipped) }} />
    </div>
  );
}

const STEPS = ["รอคิว", "ดึงไฟล์จาก GitHub", "สแกนไฟล์", "เขียนรายงาน"];

/** The scan job reports its step as Thai text; map it onto a fixed list of stages. */
function stageOf(step: string | null): number {
  if (!step) return 0;
  if (step.includes("GitHub")) return 1;
  if (step.includes("สแกน")) return 2;
  if (step.includes("AI")) return 3;
  return 1;
}

function ScanProgress({ step }: { step: string | null }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const at = stageOf(step);
  return (
    <section className={CARD} aria-live="polite">
      <div className="flex items-center gap-3">
        <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-foreground/15 border-t-brand" />
        <p role="status" className="font-medium">
          {step ?? "รอคิวสแกน…"}
        </p>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">{`${seconds} วิ`}</span>
      </div>
      <ol className="grid grid-cols-4 gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-col gap-1.5">
            <span
              aria-hidden
              className={`h-1.5 rounded-full ${i < at ? "bg-foreground/70" : i === at ? "animate-pulse bg-brand" : "bg-muted"}`}
            />
            <span className={i <= at ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm leading-6 text-muted-foreground">
        ส่วนใหญ่เสร็จใน 10–40 วินาที repo ที่มีหลายร้อยไฟล์อาจนานกว่านั้น ปิดหน้านี้แล้วกลับมาเปิดลิงก์เดิมได้
      </p>
    </section>
  );
}

function LoadingSkeleton() {
  const bar = "animate-pulse rounded-lg bg-muted";
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <p className="sr-only">กำลังโหลด…</p>
      <div className={`${bar} h-8 w-2/3`} />
      <div className={`${bar} h-4 w-1/3`} />
      <div className={`${bar} h-28`} />
      <div className={`${bar} h-48`} />
    </div>
  );
}


/**
 * Monospace chips, the first few always visible and the rest behind a toggle. Plain text
 * only: these values come from untrusted files, so nothing here is ever a link.
 */
function Chips({ items }: { items: string[] }) {
  const chip = "rounded-md bg-muted px-2 py-1 font-mono text-xs leading-5 [overflow-wrap:anywhere]";
  const head = items.slice(0, SHOWN_CHIPS);
  const rest = items.slice(SHOWN_CHIPS);
  return (
    <>
      <ul className="flex flex-wrap gap-1.5">
        {head.map((v) => (
          <li key={v} className={chip}>
            {v}
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group text-sm">
          <summary className={`flex min-h-11 cursor-pointer items-center text-muted-foreground ${FOCUS}`}>
            <span className="group-open:hidden">{`ดูทั้งหมด (${items.length})`}</span>
            <span className="hidden group-open:inline">ซ่อน</span>
          </summary>
          <ul className="flex flex-wrap gap-1.5">
            {rest.map((v) => (
              <li key={v} className={chip}>
                {v}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** The five groups of an inventory; groups with nothing in them are left out. */
function UsesGroups({ uses, skillCount = 1 }: { uses: SkillUses; skillCount?: number }) {
  if (uses.instructionsOnly) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-base leading-7 font-semibold">{usesLine(uses, skillCount)}</p>
        <p className="text-sm leading-6 text-muted-foreground">{INSTRUCTIONS_ONLY_NOTE}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {USES_GROUPS.filter((g) => uses[g.key].length > 0).map((g) => {
        const items = uses[g.key];
        return (
          <div key={g.key} className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold">
              {g.title}
              <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{`(${items.length})`}</span>
            </h3>
            {g.note && <p className="text-xs leading-5 text-muted-foreground">{g.note}</p>}
            <Chips items={items.slice(0, MAX_MERGED)} />
            {items.length > MAX_MERGED && (
              <p className="text-xs text-muted-foreground">{`แสดง ${MAX_MERGED} รายการแรกจาก ${items.length}`}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** “skill นี้ใช้อะไรบ้าง”: the whole inventory, or a pointer to re-check when the scan predates it. */
function UsesCard({ skills }: { skills: SkillInfo[] | null | undefined }) {
  if (!skills || skills.length === 0) return null; // SkillAbout already explains old reports
  const uses = mergeUses(skills);
  return (
    <section aria-labelledby="uses-heading" className={`${CARD} scroll-mt-4`} style={delay(3)}>
      <h2 id="uses-heading" className="scroll-mt-4 text-lg font-semibold">
        skill นี้ใช้อะไรบ้าง
      </h2>
      {uses ? (
        <>
          {skills.length > 1 && (
            <p className="text-sm leading-6 text-muted-foreground">
              {`รวมจาก ${skills.length} skill · ดูแยกทีละ skill ได้โดยกดที่รายการ skill ด้านบน`}
            </p>
          )}
          <UsesGroups uses={uses} skillCount={skills.length} />
          <p className="text-xs leading-5 text-muted-foreground">
            อ่านจากข้อความในไฟล์ของ skill เท่านั้น ไม่ได้รันอะไร และไม่ได้บอกว่าสิ่งเหล่านี้ดีหรือไม่ดี
          </p>
        </>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          รายงานนี้สร้างก่อนที่ระบบจะสรุปสิ่งที่ skill ใช้ กดปุ่ม “ตรวจเวอร์ชันล่าสุด” เพื่อดูรายการนี้
        </p>
      )}
    </section>
  );
}

/** Compact row for repos with several skills: name and summary; tap to see the original. */
function SkillRow({ info }: { info: SkillInfo }) {
  const line = info.summary ?? info.description ?? "ไม่มีคำอธิบายใน SKILL.md";
  const body = (
    <span className="flex min-w-0 flex-col py-2">
      <span className="font-mono text-sm font-semibold [overflow-wrap:anywhere]">{skillTitle(info)}</span>
      <span className={`line-clamp-2 text-sm leading-6 [overflow-wrap:anywhere] ${info.description ? "" : "text-muted-foreground"}`}>
        {line}
      </span>
      {info.uses && (
        <span className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{usesLine(info.uses)}</span>
      )}
    </span>
  );
  if (!info.description && !info.uses) return <li className="min-h-11">{body}</li>;
  return (
    <li>
      <details className="group">
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 ${FOCUS}`}>
          {body}
          <span aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="mb-2 flex flex-col gap-3">
          {info.description && (
            <p className="whitespace-pre-line rounded-lg bg-muted p-3 text-sm leading-6 [overflow-wrap:anywhere]">
              {info.description}
            </p>
          )}
          {info.uses && <UsesGroups uses={info.uses} />}
        </div>
      </details>
    </li>
  );
}

/** A repo that is one skill: the summary large, the original behind a toggle. */
function SkillAboutItem({ info }: { info: SkillInfo }) {
  return (
    <li className="flex flex-col gap-1">
      {info.summary ? (
        <p className="text-base leading-7">
          {info.summary}
          <span className={`ml-2 align-middle ${AI_BADGE}`}>สรุปโดย AI</span>
        </p>
      ) : info.description ? (
        <p className="line-clamp-2 text-sm leading-6 [overflow-wrap:anywhere]">{info.description}</p>
      ) : (
        <p className="text-sm text-muted-foreground">ไม่มีคำอธิบายใน SKILL.md</p>
      )}
      {info.description && (
        <details className="text-sm">
          <summary className={`flex min-h-11 cursor-pointer items-center text-muted-foreground ${FOCUS}`}>
            ดูคำอธิบายเต็ม (ต้นฉบับ)
          </summary>
          <p className="whitespace-pre-line rounded-lg bg-muted p-3 leading-6 [overflow-wrap:anywhere]">{info.description}</p>
        </details>
      )}
    </li>
  );
}

function SkillAbout({ skills }: { skills: SkillInfo[] | null | undefined }) {
  if (!skills) {
    return (
      <section aria-labelledby="about-heading" className={CARD}>
        <h2 id="about-heading" className="text-sm font-medium text-muted-foreground">
          skill นี้คืออะไร
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          รายงานนี้สร้างก่อนที่ระบบจะเก็บคำอธิบายของ skill กดปุ่ม “ตรวจเวอร์ชันล่าสุด” เพื่อดูว่า skill นี้เกี่ยวกับอะไร
        </p>
      </section>
    );
  }
  if (skills.length === 0) return null;
  if (skills.length === 1) {
    return (
      <section aria-labelledby="about-heading" className={CARD}>
        <h2 id="about-heading" className="text-sm font-medium text-muted-foreground">
          {`skill นี้คืออะไร · ${skillTitle(skills[0])}`}
        </h2>
        <ul>
          <SkillAboutItem info={skills[0]} />
        </ul>
        <p className="text-xs leading-5 text-muted-foreground">
          มาจากคำอธิบายที่ผู้เขียน skill เขียนไว้ใน SKILL.md ยังไม่ได้ยืนยันว่าทำแบบนั้นจริง ดูหลักฐานด้านล่างประกอบ
        </p>
      </section>
    );
  }
  return <SkillList skills={skills} />;
}

function SkillList({ skills }: { skills: SkillInfo[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q
    ? skills.filter((k) =>
        [k.root, k.name ?? "", k.summary ?? "", k.description ?? ""].some((v) => v.toLowerCase().includes(q)),
      )
    : skills;
  const head = q ? matches : skills.slice(0, SHOWN_SKILLS);
  const rest = q ? [] : skills.slice(SHOWN_SKILLS);
  const anySummary = skills.some((k) => k.summary);
  const LIST = "flex flex-col divide-y divide-foreground/10";
  return (
    <section aria-labelledby="about-heading" className={CARD} style={delay(1)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id="about-heading" className="text-sm font-medium text-muted-foreground">
          {`skill ใน repo นี้ (${skills.length})`}
        </h2>
        {anySummary && <span className={AI_BADGE}>สรุปโดย AI · กดเพื่อดูต้นฉบับ</span>}
      </div>
      {skills.length > SHOWN_SKILLS && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหา skill ตามชื่อหรือคำอธิบาย"
          aria-label="ค้นหา skill"
          className={`h-11 w-full rounded-lg border border-input bg-background px-3 text-sm ${FOCUS}`}
        />
      )}
      {q && (
        <p role="status" className="text-sm text-muted-foreground">
          {matches.length > 0 ? `พบ ${matches.length} skill` : "ไม่พบ skill ที่ตรงกับคำค้น"}
        </p>
      )}
      <ul className={LIST}>
        {head.map((k) => (
          <SkillRow key={k.root} info={k} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details>
          <summary className={`flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground ${FOCUS}`}>
            {`ดูอีก ${rest.length} skill`}
          </summary>
          <ul className={`${LIST} border-t border-foreground/10`}>
            {rest.map((k) => (
              <SkillRow key={k.root} info={k} />
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        มาจากคำอธิบายที่ผู้เขียน skill เขียนไว้ใน SKILL.md ยังไม่ได้ยืนยันว่าทำแบบนั้นจริง ดูหลักฐานด้านล่างประกอบ
      </p>
    </section>
  );
}

function ReportHeader({ data, actions }: { data: ScanResponse; actions?: ReactNode }) {
  return (
    <header className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
      <div className="min-w-0">
        <h1 className="font-mono text-2xl font-semibold [overflow-wrap:anywhere]">{data.repo}</h1>
        {data.path && (
          <p className="font-mono text-sm [overflow-wrap:anywhere]">
            <span className="text-muted-foreground">เฉพาะโฟลเดอร์ </span>
            {data.path}
          </p>
        )}
        {data.commitSha && (
          <a
            className={`inline-flex min-h-9 items-center font-mono text-sm text-muted-foreground hover:text-foreground ${FOCUS}`}
            href={`https://github.com/${data.repo}/tree/${data.commitSha}${data.path ? `/${data.path}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            commit {data.commitSha.slice(0, 7)}
          </a>
        )}
      </div>
      {actions}
    </header>
  );
}

function IncompleteItems({ items }: { items: Coverage[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map((c) => (
        <li key={c.path}>
          <code className="font-mono text-xs [overflow-wrap:anywhere]">{c.path}</code>
          <span className="text-muted-foreground">
            {` · ${c.status === "partial" ? "◐ อ่านบางส่วน" : "○ ข้าม"}${c.reason ? ` — ${c.reason}` : ""}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Files that were read only in part or not at all. A big repo can skip hundreds of files for
 * the same reason, so the reasons show as a short summary and the full list is one tap away.
 */
function IncompleteList({ items }: { items: Coverage[] }) {
  return (
    <>
      <ul className="flex flex-col gap-1 text-sm leading-6">
        {incompleteReasons(items).map((r) => (
          <li key={`${r.status}|${r.reason}`}>
            <strong className="font-semibold">{`${r.status === "partial" ? "อ่านบางส่วน" : "ข้าม"} ${r.count} ไฟล์`}</strong>
            <span className="text-muted-foreground">{` — ${r.reason}`}</span>
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className={`flex min-h-11 cursor-pointer items-center text-muted-foreground ${FOCUS}`}>
          {`ดูทั้ง ${items.length} รายการ`}
        </summary>
        <IncompleteItems items={items} />
      </details>
    </>
  );
}

function FindingRow({ f, data, open, shownPath }: { f: Finding; data: ScanResponse; open: boolean; shownPath: string }) {
  const ai = isAiFinding(f);
  return (
    <details open={open} className="group">
      <summary
        className={`flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        <span aria-hidden className="text-xs text-muted-foreground transition-transform group-open:rotate-90">
          ▸
        </span>
        <code className="font-mono text-sm [overflow-wrap:anywhere]">{`${shownPath}${f.line ? `:${f.line}` : ""}`}</code>
        {ai && (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-100">
            {AI_FINDING_BADGE}
          </span>
        )}
      </summary>
      <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
        {ai && <p className="text-xs leading-5 text-muted-foreground">{AI_NOTE}</p>}
        <p className="text-sm leading-6">{f.message}</p>
        {f.excerpt && (
          // rendered as text only — never as HTML (blocks XSS from scanned files)
          <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
            {f.excerpt}
          </pre>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono">{f.rule}</span>
          <a
            className={`inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground ${FOCUS}`}
            href={githubLink(data.repo, data.commitSha, f.file, f.line)}
            target="_blank"
            rel="noopener noreferrer"
          >
            ดูบน GitHub
          </a>
        </p>
      </div>
    </details>
  );
}

export function Report({ id }: { id: string }) {
  // `data` must stay the first useState: report.test.tsx injects a scan result into it.
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [navigating, startNavigation] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/scans/${encodeURIComponent(id)}`, { cache: "no-store" });
        const body = await res.json();
        if (stopped) return;
        if (!res.ok) {
          setLoadError(body.error ?? "โหลดผลการสแกนไม่สำเร็จ");
          return;
        }
        setData(body);
        if (body.status === "pending" || body.status === "running") {
          timer = setTimeout(poll, 2000);
        }
      } catch {
        if (!stopped) timer = setTimeout(poll, 4000); // network blip — keep trying
      }
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (loadError) {
    return (
      <section className={CARD}>
        <p role="alert" className="font-medium text-destructive">
          {loadError}
        </p>
        <p className="text-sm text-muted-foreground">ลิงก์อาจพิมพ์ผิด หรือรายงานถูกลบไปแล้ว ลองสแกนใหม่จากหน้าแรก</p>
      </section>
    );
  }
  if (!data) return <LoadingSkeleton />;

  // The button asks the same API as the home page. It answers with this very report when
  // the commit and the rules are unchanged, and with a new scan otherwise.
  async function recheck(current: ScanResponse) {
    setChecking(true);
    setNote("");
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: targetText(current.repo, current.path) }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      const outcome = interpretRecheck(id, res.ok, body);
      if (outcome.kind === "newer") {
        startNavigation(() => router.push(`/scans/${outcome.id}`));
      } else if (outcome.kind === "current") {
        const sha = current.commitSha ? ` ${current.commitSha.slice(0, 7)}` : "";
        setNote(`commit${sha} ตรงกับรายงานนี้และตรวจด้วยกฎรุ่นล่าสุดแล้ว ยังไม่มีเวอร์ชันที่ใหม่กว่า`);
      } else {
        setNote(outcome.message);
      }
    } catch {
      setNote("ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      // Always unlock: Next.js keeps this page's state when the user comes back with "back".
      setChecking(false);
    }
  }

  async function copyLink() {
    // Phones get the system share sheet (LINE, Messenger…); elsewhere the link is copied.
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: `Skill Auditor · ${data?.repo ?? ""}`, url: window.location.href });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // the user closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNote("");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNote("คัดลอกลิงก์ไม่สำเร็จ ลองคัดลอกจากแถบที่อยู่ของเบราว์เซอร์");
    }
  }

  const busy = checking || navigating;
  const statusText = navigating ? "พบเวอร์ชันใหม่ กำลังเปิดรายงานใหม่…" : checking ? "กำลังตรวจเวอร์ชันล่าสุด…" : note;
  const actions = (
    <div className="flex flex-col gap-2 lg:min-w-[210px]">
      <Button type="button" className="h-11 w-full" disabled={busy} onClick={() => recheck(data)}>
        {busy ? "กำลังตรวจ…" : "ตรวจเวอร์ชันล่าสุด"}
      </Button>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={copyLink}>
        {copied ? "คัดลอกแล้ว ✓" : "แชร์ลิงก์รายงาน"}
      </Button>
      <p role="status" aria-live="polite" className="text-sm leading-6 text-muted-foreground">
        {statusText}
      </p>
    </div>
  );

  if (data.status === "pending" || data.status === "running") {
    return (
      <div className="flex flex-col gap-4">
        <ReportHeader data={data} />
        <ScanProgress step={data.step} />
      </div>
    );
  }

  if (data.status === "failed") {
    const failedFiles = data.coverage.filter((c) => c.status !== "full");
    return (
      <div className="flex flex-col gap-4">
        <ReportHeader data={data} actions={actions} />
        <section className={CARD}>
          <p role="alert" className="text-destructive">
            สแกนไม่สำเร็จ: {data.error}
          </p>
          {failedFiles.length > 0 && <IncompleteList items={failedFiles} />}
        </section>
      </div>
    );
  }

  const s = summarize(data);
  const readFiles = data.coverage.filter((c) => c.status !== "skipped");
  const skills = groupBySkill(data.findings, data.coverage, data.skills ?? []);
  const bySkill = skills.length > 1;
  const flagged = skills.filter((g) => g.findings.length > 0);
  const quiet = skills.filter((g) => g.findings.length === 0);
  const quietIncomplete = quiet.filter((g) => g.incompleteCount > 0).length;
  const total = data.coverage.length;
  const topics = byTopic(data.findings);
  // each topic's first block gets the id the summary bars link to
  const anchored = new Set<string>();
  const anchorFor = (topic: string) => {
    if (anchored.has(topic)) return undefined;
    anchored.add(topic);
    return `topic-${topic}`;
  };
  const firstFinding = flagged[0] ? byTopic(flagged[0].findings)[0]?.findings[0] : undefined;
  // Reports made before the inventory existed have no `uses`: they keep the old headline.
  const uses = mergeUses(data.skills ?? []);
  const skillCount = data.skills?.length ?? 1;
  // The rule result leads; the inventory sits right under it as numbers. Reports made before
  // the inventory existed keep their old wording.
  const headline = s.insufficient
    ? "ข้อมูลไม่เพียงพอสำหรับประเมิน"
    : uses?.instructionsOnly && s.findingCount === 0
      ? usesLine(uses, skillCount)
      : !uses && s.findingCount === 0
        ? "ไม่พบสิ่งที่ตรงกับกฎ"
        : ruleResultLine(s.ruleCount, s.aiCount);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ReportHeader data={data} actions={actions} />

      <SkillAbout skills={data.skills} />

      <section
        aria-labelledby="summary-heading"
        className={`${CARD} lg:grid lg:grid-cols-[1fr_minmax(0,20rem)] lg:gap-8`}
        style={delay(2)}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="summary-heading" className="text-sm font-medium text-muted-foreground">
              สิ่งที่ skill นี้ทำ
            </h2>
            {uses && !s.insufficient && !uses.instructionsOnly && (
              <p className="text-xs font-medium tracking-wide text-muted-foreground">ผลตรวจด้วยกฎ</p>
            )}
            <p className="text-2xl leading-tight font-bold text-balance sm:text-3xl">{headline}</p>
          </div>
          {uses && !s.insufficient && !uses.instructionsOnly && <UsesTiles uses={uses} skillCount={skillCount} />}
          {s.ai && !s.insufficient && (
            <p className="text-sm leading-6 text-muted-foreground">{`AI อ่าน ${s.ai.read} จาก ${s.ai.total} ไฟล์`}</p>
          )}
          {s.insufficient ? (
            <p className="text-sm leading-6 text-muted-foreground">
              ไม่มีข้อมูลยืนยันว่าตัวสแกนตรวจไฟล์ใดได้ กรุณาสแกนใหม่หรือตรวจไฟล์ด้วยตนเอง
            </p>
          ) : s.findingCount === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">
              ไม่ได้แปลว่าปลอดภัย: ตัวสแกนรู้จักเฉพาะรูปแบบที่มีในชุดกฎ คำสั่งที่เขียนเป็นภาษาคนธรรมดายังตรวจไม่ได้
            </p>
          ) : (
            <>
              {bySkill && (
                <p className="text-sm text-muted-foreground">{`อยู่ใน ${flagged.length} จาก ${skills.length} กลุ่มไฟล์`}</p>
              )}
              <TopicBars topics={topics} />
              <p className="text-sm leading-6 text-muted-foreground">
                รายงานนี้บอกว่า skill ทำอะไร ไม่ได้ตัดสินว่าอันตรายหรือไม่ หลายข้อเป็นเรื่องปกติของงานบางประเภท
                อ่านหลักฐานด้านล่างแล้วตัดสินใจเอง
              </p>
            </>
          )}
          {s.legacy && (
            <p role="alert" className={WARNING}>
              รายงานรุ่นเก่าอาจนับไฟล์ที่ถูกข้ามว่าอ่านครบ กดปุ่ม “ตรวจเวอร์ชันล่าสุด” เพื่อสแกน repo นี้ใหม่และยืนยันผล
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 max-lg:border-t max-lg:border-foreground/10 max-lg:pt-4">
          <h3 id="coverage-heading" className="text-sm font-medium text-muted-foreground">
            ขอบเขตการตรวจ
          </h3>
          {total > 0 && <p className="text-base font-semibold">{`อ่านครบ ${s.files.full} จาก ${total} ไฟล์`}</p>}
          <CoverageMeter full={s.files.full} partial={s.files.partial} skipped={s.files.skipped} />
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["อ่านครบ", s.files.full, "bg-emerald-500 dark:bg-emerald-400"],
                ["อ่านบางส่วน", s.files.partial, "bg-brand"],
                ["ข้าม", s.files.skipped, "bg-foreground/20"],
              ] as const
            ).map(([label, n, dot]) => (
              <div key={label} className="rounded-lg bg-muted p-2">
                <dt className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden className={`size-2 rounded-full ${dot}`} />
                  {label}
                </dt>
                <dd className="m-0 text-xl font-bold">{n}</dd>
              </div>
            ))}
          </dl>
          {s.incomplete.length > 0 ? (
            <p role="alert" className={WARNING}>
              {`ตรวจไม่ครบ · มี ${s.incomplete.length} รายการที่อ่านได้บางส่วนหรือข้าม ผลครอบคลุมเฉพาะส่วนที่ตรวจได้`}
              <br />
              <a href="#coverage" className={`inline-flex min-h-11 items-center font-medium underline underline-offset-2 ${FOCUS}`}>
                ดูไฟล์และเหตุผล
              </a>
            </p>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {s.files.read > 0 && !s.legacy ? "อ่านครบทุกไฟล์" : "ควรสแกนใหม่เพื่อยืนยันขอบเขตการตรวจ"}
            </p>
          )}
        </div>
      </section>

      <UsesCard skills={data.skills} />

      <section aria-labelledby="findings-heading" className={`${CARD} scroll-mt-4 gap-5`} style={delay(4)}>
        <h2 id="findings-heading" className="text-lg font-semibold">
          {`หลักฐาน (${s.findingCount})`}
        </h2>
        {topics.length > 1 && (
          <div
            role="group"
            aria-label="กรองตามหัวข้อ"
            className="-mx-4 -mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          >
            {[{ id: null, title: "ทั้งหมด", n: s.findingCount }, ...topics.map((t) => ({ id: t.topic.id, title: t.topic.title, n: t.findings.length }))].map(
              (t) => {
                const on = topicFilter === t.id;
                return (
                  <button
                    key={t.id ?? "all"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTopicFilter(t.id)}
                    className={`min-h-9 shrink-0 rounded-full px-3 text-sm whitespace-nowrap ring-1 transition-colors ring-inset ${FOCUS} ${
                      on ? "bg-foreground text-background ring-foreground" : "ring-foreground/15 hover:ring-foreground/40"
                    }`}
                  >
                    {t.title}
                    <span className={`ml-1.5 tabular-nums ${on ? "opacity-70" : "text-muted-foreground"}`}>{t.n}</span>
                  </button>
                );
              },
            )}
          </div>
        )}
        {s.findingCount === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">ไม่พบรายการที่ตรงกับกฎที่รู้จัก</p>
        ) : (
          flagged
            .filter((g) => !topicFilter || g.findings.some((f) => topicOf(f.rule) === topicFilter))
            .map((g) => (
            <div key={g.root ?? "(outside)"} className="flex flex-col gap-3">
              {bySkill && (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-foreground/10 pb-2">
                  <h3 className="font-mono text-base font-semibold [overflow-wrap:anywhere]">{g.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {`${g.findings.length} จุด · ${g.fileCount} ไฟล์`}
                    {g.incompleteCount > 0 ? ` · ตรวจไม่ครบ ${g.incompleteCount} ไฟล์` : ""}
                  </p>
                  {(g.info?.summary ?? g.info?.description) && (
                    <p className="line-clamp-1 w-full text-sm leading-6 [overflow-wrap:anywhere]">
                      {g.info?.summary ?? g.info?.description}
                    </p>
                  )}
                </div>
              )}
              {byTopic(g.findings)
                .filter((t) => !topicFilter || t.topic.id === topicFilter)
                .map((t) => (
                <div
                  key={t.topic.id}
                  id={anchorFor(t.topic.id)}
                  className="flex scroll-mt-4 flex-col gap-2"
                >
                  <div>
                    <h4 className="text-sm font-semibold">{`${t.topic.title} (${t.findings.length})`}</h4>
                    <p className="text-sm leading-6 text-muted-foreground">{t.topic.note}</p>
                  </div>
                  <div className="flex flex-col divide-y divide-foreground/10 rounded-lg ring-1 ring-foreground/10">
                    {t.findings.map((f, i) => (
                      <FindingRow
                        key={i}
                        f={f}
                        data={data}
                        open={f === firstFinding}
                        shownPath={bySkill && g.root ? f.file.slice(g.root.length + 1) : f.file}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        {bySkill && quiet.length > 0 && (
          <details className="text-sm">
            <summary className={`flex min-h-11 cursor-pointer items-center text-muted-foreground ${FOCUS}`}>
              {`อีก ${quiet.length} กลุ่มไฟล์ไม่พบรายการที่ตรงกับกฎ` +
                (quietIncomplete > 0 ? ` (ในนั้น ${quietIncomplete} กลุ่มตรวจไม่ครบ)` : "")}
            </summary>
            <ul className="mt-1 flex flex-col gap-1">
              {quiet.map((g) => (
                <li key={g.root ?? "(outside)"}>
                  <code className="font-mono text-xs [overflow-wrap:anywhere]">{g.name}</code>
                  <span className="text-muted-foreground">
                    {g.incompleteCount > 0
                      ? ` · ตรวจไม่ครบ ${g.incompleteCount} จาก ${g.fileCount} ไฟล์`
                      : ` · อ่านครบ ${g.fileCount} ไฟล์`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section id="coverage" aria-labelledby="files-heading" className={`${CARD} scroll-mt-4`} style={delay(5)}>
        <h2 id="files-heading" className="text-lg font-semibold">
          {s.incomplete.length > 0 ? "ไฟล์ที่อ่านบางส่วนหรือข้าม" : "ไฟล์ที่ตรวจ"}
        </h2>
        <p className="text-sm text-muted-foreground">{`อ่าน ${s.files.read} ไฟล์`}</p>
        {s.incomplete.length > 0 && <IncompleteList items={s.incomplete} />}
        {readFiles.length > 0 && (
          <details className="text-sm text-muted-foreground">
            <summary className={`flex min-h-11 cursor-pointer items-center ${FOCUS}`}>ดูรายชื่อไฟล์ที่อ่าน</summary>
            <ul className="mt-1 flex flex-col gap-1">
              {readFiles.map((c) => (
                <li key={c.path} className="font-mono text-xs [overflow-wrap:anywhere]">
                  {c.path}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <p className="text-xs leading-5 text-muted-foreground">
        ตรวจแบบอ่านอย่างเดียว ไม่มีการรันโค้ดใดๆ ใช้ชุดกฎหารูปแบบที่รู้จักเท่านั้น
        ข้อความในรายงานบรรยายสิ่งที่พบในไฟล์ ไม่ได้กล่าวหาผู้เขียน
      </p>
    </div>
  );
}
