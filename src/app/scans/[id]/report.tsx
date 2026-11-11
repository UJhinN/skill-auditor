"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface Finding {
  severity: Severity;
  rule: string;
  file: string;
  line: number | null;
  message: string;
  excerpt: string | null;
}

interface Coverage {
  path: string;
  status: "full" | "partial" | "skipped";
  reason?: string;
}

interface ScanResponse {
  id: string;
  repo: string;
  commitSha: string | null;
  status: "pending" | "running" | "done" | "failed";
  step: string | null;
  error: string | null;
  score: number | null;
  riskLevel: Severity | "none_found" | null;
  coverage: Coverage[];
  findings: Finding[];
}

const SEVERITY: Record<Severity, { label: string; className: string }> = {
  critical: { label: "วิกฤต", className: "bg-red-600 text-white" },
  high: { label: "สูง", className: "bg-orange-500 text-white" },
  medium: { label: "กลาง", className: "bg-amber-300 text-amber-950" },
  low: { label: "ต่ำ", className: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100" },
  info: { label: "ข้อมูล", className: "bg-muted text-muted-foreground" },
};

const VERDICT: Record<Severity | "none_found", { title: string; detail: string }> = {
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

function githubLink(repo: string, sha: string | null, file: string, line: number | null) {
  const ref = sha ?? "HEAD";
  const path = file.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${repo}/blob/${ref}/${path}${line ? `#L${line}` : ""}`;
}

export function Report({ id }: { id: string }) {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="font-mono text-2xl font-semibold break-all">{data.repo}</h1>
      {data.commitSha && (
        <a
          className="font-mono text-sm text-muted-foreground hover:text-foreground"
          href={`https://github.com/${data.repo}/tree/${data.commitSha}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          commit {data.commitSha.slice(0, 7)}
        </a>
      )}
    </div>
  );

  if (data.status === "pending" || data.status === "running") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p role="status" className="animate-pulse">
          {data.step ?? "รอคิวสแกน…"}
        </p>
      </div>
    );
  }

  if (data.status === "failed") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p role="alert" className="text-destructive">
          สแกนไม่สำเร็จ: {data.error}
        </p>
      </div>
    );
  }

  const level = data.riskLevel ?? "none_found";
  const verdict = VERDICT[level];
  const counts = data.findings.reduce<Partial<Record<Severity, number>>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const read = data.coverage.filter((c) => c.status !== "skipped");
  const notFull = data.coverage.filter((c) => c.status !== "full");

  return (
    <div className="flex flex-col gap-8">
      {header}

      <section className="flex flex-col gap-3 rounded-xl p-5 ring-1 ring-foreground/10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold">{verdict.title}</h2>
          {data.score !== null && (
            <span className="font-mono text-sm text-muted-foreground">คะแนน {data.score}/100</span>
          )}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{verdict.detail}</p>
        {data.findings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SEVERITY) as Severity[])
              .filter((s) => counts[s])
              .map((s) => (
                <span key={s} className={`rounded px-2 py-0.5 text-xs ${SEVERITY[s].className}`}>
                  {SEVERITY[s].label} {counts[s]}
                </span>
              ))}
          </div>
        )}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์รายงาน"}
          </Button>
        </div>
      </section>

      {data.findings.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">สิ่งที่พบ ({data.findings.length})</h2>
          <ul className="flex flex-col gap-3">
            {data.findings.map((f, i) => (
              <li key={i} className="flex flex-col gap-2 rounded-lg p-4 ring-1 ring-foreground/10">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded px-2 py-0.5 text-xs ${SEVERITY[f.severity].className}`}>
                    {SEVERITY[f.severity].label}
                  </span>
                  <a
                    className="font-mono break-all underline-offset-2 hover:underline"
                    href={githubLink(data.repo, data.commitSha, f.file, f.line)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {f.file}
                    {f.line ? `:${f.line}` : ""}
                  </a>
                  <span className="font-mono text-xs text-muted-foreground">{f.rule}</span>
                </div>
                <p className="text-sm leading-6">{f.message}</p>
                {f.excerpt && (
                  // rendered as text only — never as HTML (blocks XSS from scanned files)
                  <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">
                    {f.excerpt}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="text-lg font-semibold">ไฟล์ที่ตรวจ</h2>
        <p className="text-muted-foreground">
          อ่าน {read.length} ไฟล์
          {notFull.length > 0 ? ` · อ่านไม่ครบหรือข้าม ${notFull.length} ไฟล์ (รายการด้านล่าง)` : " ครบทุกไฟล์"}
        </p>
        {notFull.length > 0 && (
          <ul className="flex flex-col gap-1">
            {notFull.map((c) => (
              <li key={c.path} className="font-mono text-xs break-all">
                {c.status === "partial" ? "◐" : "○"} {c.path}
                <span className="font-sans text-muted-foreground"> — {c.reason}</span>
              </li>
            ))}
          </ul>
        )}
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">ดูรายชื่อไฟล์ทั้งหมด</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {read.map((c) => (
              <li key={c.path} className="font-mono text-xs break-all">
                {c.path}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <p className="text-xs leading-5 text-muted-foreground">
        ตรวจแบบอ่านอย่างเดียว ไม่มีการรันโค้ดใดๆ ใช้ชุดกฎหารูปแบบที่รู้จักเท่านั้น
        ข้อความในรายงานบรรยายสิ่งที่พบในไฟล์ ไม่ได้กล่าวหาผู้เขียน
      </p>
    </div>
  );
}
