"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseTarget } from "@/lib/target";

// one example of each kind of input the box accepts; tapping one fills the box and scans it
const EXAMPLES: { label: string; value: string }[] = [
  { label: "owner/repo", value: "anthropics/skills" },
  { label: "ลิงก์โฟลเดอร์ GitHub", value: "https://github.com/anthropics/skills/tree/main/skills/pptx" },
  { label: "คำสั่งติดตั้ง", value: "npx skills add vercel-labs/agent-skills --skill web-design-guidelines" },
];

export function RepoForm() {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    // The same parser runs on the server; this only gives a quick answer for obvious typos.
    if (!parseTarget(value)) {
      setMessage("ใส่ owner/repo ลิงก์ GitHub หรือคำสั่งติดตั้ง skill เช่น anthropics/skills");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: value.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setMessage(body.error ?? "เริ่มสแกนไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      router.push(`/scans/${body.id}`);
    } catch {
      setMessage("ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          submit(repo);
        }}
      >
        <Input
          aria-label="GitHub repo, ลิงก์ หรือคำสั่งติดตั้ง skill"
          placeholder="owner/repo หรือวางคำสั่งติดตั้ง"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="h-12 bg-background font-mono text-base sm:text-sm"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <Button type="submit" className="h-12 gap-2 px-6 text-base" disabled={busy}>
          {busy && (
            <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {busy ? "กำลังเริ่ม…" : "สแกน"}
        </Button>
      </form>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-muted-foreground">
          วางได้ทั้งชื่อ repo, ลิงก์ GitHub, คำสั่ง <code className="font-mono text-xs">npx …</code> หรือ install prompt
          จากหน้าร้าน skill · ลองกดตัวอย่าง:
        </p>
        <ul className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <li key={ex.label}>
              <button
                type="button"
                disabled={busy}
                title={ex.value}
                onClick={() => {
                  setRepo(ex.value);
                  submit(ex.value);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-sm ring-1 ring-foreground/10 transition-colors hover:ring-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-brand" />
                {ex.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
