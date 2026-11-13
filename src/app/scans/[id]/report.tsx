"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  byTopic,
  type Coverage,
  type Finding,
  githubLink,
  groupBySkill,
  incompleteReasons,
  interpretRecheck,
  type ScanResponse,
  type SkillInfo,
  skillTitle,
  summarize,
} from "./report-model";

const CARD = "flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5";
const WARNING =
  "rounded-lg bg-amber-100 p-3 text-sm leading-6 text-amber-950 dark:bg-amber-950 dark:text-amber-100";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const SHOWN_SKILLS = 6;
const AI_BADGE = "rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground";

/** Compact row for repos with several skills: name and summary; tap to see the original. */
function SkillRow({ info }: { info: SkillInfo }) {
  const line = info.summary ?? info.description ?? "ไม่มีคำอธิบายใน SKILL.md";
  const body = (
    <span className="flex min-w-0 flex-col py-2">
      <span className="font-mono text-sm font-semibold [overflow-wrap:anywhere]">{skillTitle(info)}</span>
      <span className={`line-clamp-2 text-sm leading-6 [overflow-wrap:anywhere] ${info.description ? "" : "text-muted-foreground"}`}>
        {line}
      </span>
    </span>
  );
  if (!info.description) return <li className="min-h-11">{body}</li>;
  return (
    <li>
      <details className="group">
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 ${FOCUS}`}>
          {body}
          <span aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <p className="mb-2 whitespace-pre-line rounded-lg bg-muted p-3 text-sm leading-6 [overflow-wrap:anywhere]">
          {info.description}
        </p>
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
  const head = skills.slice(0, SHOWN_SKILLS);
  const rest = skills.slice(SHOWN_SKILLS);
  const anySummary = skills.some((k) => k.summary);
  const LIST = "flex flex-col divide-y divide-foreground/10";
  return (
    <section aria-labelledby="about-heading" className={CARD}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id="about-heading" className="text-sm font-medium text-muted-foreground">
          {`skill ใน repo นี้ (${skills.length})`}
        </h2>
        {anySummary && <span className={AI_BADGE}>สรุปโดย AI · กดเพื่อดูต้นฉบับ</span>}
      </div>
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
        {data.commitSha && (
          <a
            className={`inline-flex min-h-9 items-center font-mono text-sm text-muted-foreground hover:text-foreground ${FOCUS}`}
            href={`https://github.com/${data.repo}/tree/${data.commitSha}`}
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
  return (
    <details open={open} className="group">
      <summary
        className={`flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        <span aria-hidden className="text-xs text-muted-foreground transition-transform group-open:rotate-90">
          ▸
        </span>
        <code className="font-mono text-sm [overflow-wrap:anywhere]">{`${shownPath}${f.line ? `:${f.line}` : ""}`}</code>
      </summary>
      <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
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

  if (loadError) return <p className="text-destructive">{loadError}</p>;
  if (!data) return <p className="text-muted-foreground">กำลังโหลด…</p>;

  // The button asks the same API as the home page. It answers with this very report when
  // the commit and the rules are unchanged, and with a new scan otherwise.
  async function recheck(current: ScanResponse) {
    setChecking(true);
    setNote("");
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: current.repo }),
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
        {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์รายงาน"}
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
        <p role="status" className="animate-pulse">
          {data.step ?? "รอคิวสแกน…"}
        </p>
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
  const firstFinding = flagged[0] ? byTopic(flagged[0].findings)[0]?.findings[0] : undefined;
  const headline = s.insufficient
    ? "ข้อมูลไม่เพียงพอสำหรับประเมิน"
    : s.findingCount === 0
      ? "ไม่พบสิ่งที่ตรงกับกฎ"
      : `พบ ${s.findingCount} จุดที่ควรรู้ก่อนติดตั้ง`;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ReportHeader data={data} actions={actions} />

      <SkillAbout skills={data.skills} />

      <section aria-labelledby="summary-heading" className={`${CARD} lg:grid lg:grid-cols-[1fr_minmax(0,22rem)] lg:gap-8`}>
        <div className="flex flex-col gap-3">
          <h2 id="summary-heading" className="text-sm font-medium text-muted-foreground">
            สิ่งที่ skill นี้ทำ
          </h2>
          <p className="text-2xl leading-tight font-bold sm:text-3xl">{headline}</p>
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
              <ul className="flex flex-col gap-1 text-sm leading-6">
                {topics.map((t) => (
                  <li key={t.topic.id} className="flex items-baseline justify-between gap-3">
                    <span>{t.topic.title}</span>
                    <span className="text-muted-foreground tabular-nums">{`${t.findings.length} จุด`}</span>
                  </li>
                ))}
              </ul>
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
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["อ่านครบ", s.files.full],
                ["อ่านบางส่วน", s.files.partial],
                ["ข้าม", s.files.skipped],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-lg bg-muted p-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
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

      <section aria-labelledby="findings-heading" className={`${CARD} gap-5`}>
        <h2 id="findings-heading" className="text-lg font-semibold">
          {`หลักฐาน (${s.findingCount})`}
        </h2>
        {s.findingCount === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">ไม่พบรายการที่ตรงกับกฎที่รู้จัก</p>
        ) : (
          flagged.map((g) => (
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
              {byTopic(g.findings).map((t) => (
                <div key={t.topic.id} className="flex flex-col gap-2">
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

      <section id="coverage" aria-labelledby="files-heading" className={`${CARD} scroll-mt-4`}>
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
