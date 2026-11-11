"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  type Coverage,
  githubLink,
  interpretRecheck,
  type RiskLevel,
  RISK_LABEL,
  type ScanResponse,
  SEVERITY_ORDER,
  type Severity,
  summarize,
  VERDICT,
} from "./report-model";

const SEVERITY_BADGE: Record<Severity, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-300 text-amber-950",
  low: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  info: "bg-muted text-muted-foreground",
};

const RISK_TEXT: Record<RiskLevel, string> = {
  critical: "text-red-700 dark:text-red-400",
  high: "text-orange-700 dark:text-orange-400",
  medium: "text-amber-700 dark:text-amber-400",
  low: "text-sky-700 dark:text-sky-400",
  info: "text-foreground",
  none_found: "text-foreground",
};

const CARD = "flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5";
const WARNING =
  "rounded-lg bg-amber-100 p-3 text-sm leading-6 text-amber-950 dark:bg-amber-950 dark:text-amber-100";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[severity]}`}>
      {RISK_LABEL[severity]}
    </span>
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

const SHOWN_INCOMPLETE = 8;

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
 * Files that were read only in part or not at all, each with the reason. A big repo can skip
 * hundreds of files, so only the first few show; the rest are one tap away, none are hidden.
 */
function IncompleteList({ items }: { items: Coverage[] }) {
  const rest = items.slice(SHOWN_INCOMPLETE);
  return (
    <>
      <IncompleteItems items={items.slice(0, SHOWN_INCOMPLETE)} />
      {rest.length > 0 && (
        <details className="text-sm">
          <summary className={`flex min-h-11 cursor-pointer items-center text-muted-foreground ${FOCUS}`}>
            {`ดูอีก ${rest.length} รายการ`}
          </summary>
          <IncompleteItems items={rest} />
        </details>
      )}
    </>
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
  const verdict = VERDICT[s.level];
  const readFiles = data.coverage.filter((c) => c.status !== "skipped");
  const riskWord = s.insufficient
    ? "ข้อมูลไม่เพียงพอสำหรับประเมิน"
    : s.level === "none_found"
      ? verdict.title
      : RISK_LABEL[s.level];
  const summaryLine = `พบ ${s.findingCount} รายการ${s.showScore ? ` · คะแนน ${data.score}/100` : ""}`;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ReportHeader data={data} actions={actions} />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <section aria-labelledby="risk-heading" className={CARD}>
          <h2 id="risk-heading" className="text-lg font-semibold">
            ระดับความเสี่ยง
          </h2>
          <p className={`text-2xl leading-tight font-bold sm:text-3xl ${s.insufficient ? "" : RISK_TEXT[s.level]}`}>
            {riskWord}
          </p>
          <p className="text-sm text-muted-foreground">{summaryLine}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {s.insufficient ? (
              "ไม่มีข้อมูลยืนยันว่าตัวสแกนตรวจไฟล์ใดได้ กรุณาสแกนใหม่หรือตรวจไฟล์ด้วยตนเอง"
            ) : s.level === "none_found" ? (
              verdict.detail
            ) : (
              <>
                <strong className="font-semibold text-foreground">{verdict.title}</strong> · {verdict.detail}
              </>
            )}
          </p>
          {s.legacy && (
            <p role="alert" className={WARNING}>
              รายงานรุ่นเก่าอาจนับไฟล์ที่ถูกข้ามว่าอ่านครบ กดปุ่ม “ตรวจเวอร์ชันล่าสุด” เพื่อสแกน repo นี้ใหม่และยืนยันผล
            </p>
          )}
          {s.findingCount > 0 && (
            <div className="flex flex-wrap gap-2">
              {SEVERITY_ORDER.filter((sev) => s.severityCounts[sev]).map((sev) => (
                <span key={sev} className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[sev]}`}>
                  {RISK_LABEL[sev]} {s.severityCounts[sev]}
                </span>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="coverage-heading" className={CARD}>
          <h2 id="coverage-heading" className="text-lg font-semibold">
            ขอบเขตการตรวจ
          </h2>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["อ่านครบ", s.files.full],
                ["อ่านบางส่วน", s.files.partial],
                ["ข้าม", s.files.skipped],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-lg bg-muted p-2">
                <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
                <dd className="m-0 text-2xl font-bold">{n}</dd>
              </div>
            ))}
          </dl>
          {s.incomplete.length > 0 ? (
            <p role="alert" className={WARNING}>
              {`ตรวจไม่ครบ · มี ${s.incomplete.length} รายการที่อ่านได้บางส่วนหรือข้าม ผลและคะแนนครอบคลุมเฉพาะส่วนที่ตรวจได้`}
              <br />
              <a href="#coverage" className={`inline-flex min-h-9 items-center font-medium underline underline-offset-2 ${FOCUS}`}>
                ดูไฟล์และเหตุผล
              </a>
            </p>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {s.files.read > 0 && !s.legacy ? "อ่านครบทุกไฟล์" : "ควรสแกนใหม่เพื่อยืนยันขอบเขตการตรวจ"}
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="findings-heading" className={CARD}>
          <h2 id="findings-heading" className="text-lg font-semibold">
            {`สิ่งที่พบ (${s.findingCount})`}
          </h2>
          {s.findingCount === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">ไม่พบรายการที่ตรงกับกฎที่รู้จัก</p>
          ) : (
            <div className="flex flex-col divide-y divide-foreground/10 rounded-lg ring-1 ring-foreground/10">
              {data.findings.map((f, i) => (
                <details key={i} open={i === 0} className="group">
                  <summary
                    className={`flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 [&::-webkit-details-marker]:hidden ${FOCUS}`}
                  >
                    <span aria-hidden className="text-xs text-muted-foreground transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    <SeverityBadge severity={f.severity} />
                    <code className="font-mono text-sm [overflow-wrap:anywhere]">
                      {`${f.file}${f.line ? `:${f.line}` : ""}`}
                    </code>
                  </summary>
                  <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
                    <p className="text-sm leading-6">{f.message}</p>
                    {f.excerpt && (
                      // rendered as text only — never as HTML (blocks XSS from scanned files)
                      <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">
                        {f.excerpt}
                      </pre>
                    )}
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono">{f.rule}</span>
                      <a
                        className={`inline-flex min-h-9 items-center underline underline-offset-2 hover:text-foreground ${FOCUS}`}
                        href={githubLink(data.repo, data.commitSha, f.file, f.line)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ดูบน GitHub
                      </a>
                    </p>
                  </div>
                </details>
              ))}
            </div>
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
              <summary className={`flex min-h-11 cursor-pointer items-center ${FOCUS}`}>ดูรายชื่อไฟล์ทั้งหมด</summary>
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
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        ตรวจแบบอ่านอย่างเดียว ไม่มีการรันโค้ดใดๆ ใช้ชุดกฎหารูปแบบที่รู้จักเท่านั้น
        ข้อความในรายงานบรรยายสิ่งที่พบในไฟล์ ไม่ได้กล่าวหาผู้เขียน
      </p>
    </div>
  );
}
