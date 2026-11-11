"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Same rule the API enforces: owner/repo only, no URLs (blocks SSRF).
const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;

const EXAMPLES = ["anthropics/skills", "vercel-labs/agent-skills"];

/** Accept a pasted GitHub URL too, and reduce it to owner/repo. */
function normalize(value: string): string {
  const v = value.trim().replace(/\.git$/, "");
  const m = v.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+\/[^/\s#?]+)/i);
  return m ? m[1] : v;
}

export function RepoForm() {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    const target = normalize(value);
    if (!REPO_PATTERN.test(target)) {
      setMessage("รูปแบบต้องเป็น owner/repo เช่น anthropics/skills");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: target }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setMessage(body.error ?? "เริ่มสแกนไม่สำเร็จ ลองใหม่อีกครั้ง");
        setBusy(false);
        return;
      }
      router.push(`/scans/${body.id}`);
    } catch {
      setMessage("ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
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
          aria-label="GitHub repo"
          placeholder="owner/repo"
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

      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
