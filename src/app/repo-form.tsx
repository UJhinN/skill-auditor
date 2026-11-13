"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseTarget } from "@/lib/target";

const EXAMPLES = ["anthropics/skills", "vercel-labs/agent-skills"];

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
          className="h-10 font-mono"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <Button type="submit" className="h-10 px-5" disabled={busy}>
          {busy ? "กำลังเริ่ม…" : "สแกน"}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>ลองดู:</span>
        {EXAMPLES.map((ex) => (
          <Button
            key={ex}
            type="button"
            variant="outline"
            size="sm"
            className="font-mono"
            disabled={busy}
            onClick={() => {
              setRepo(ex);
              submit(ex);
            }}
          >
            {ex}
          </Button>
        ))}
      </div>

      <p className="text-sm leading-6 text-muted-foreground">
        วางได้ทั้งชื่อ repo, ลิงก์โฟลเดอร์ skill บน GitHub หรือคำสั่งติดตั้งจากหน้าร้าน skill เช่น{" "}
        <code className="font-mono text-xs [overflow-wrap:anywhere]">npx skills add owner/repo --skill ชื่อ</code>{" "}
        ระบบจะสแกนเฉพาะ skill นั้น
      </p>

      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
