"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// owner/repo only — no free-form URLs (blocks SSRF once the scanner fetches from GitHub)
const REPO_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

const EXAMPLES = ["anthropics/skills", "vercel-labs/agent-skills"];

export function RepoForm() {
  const [repo, setRepo] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function submit(value: string) {
    const trimmed = value.trim();
    if (!REPO_PATTERN.test(trimmed)) {
      setMessage("รูปแบบต้องเป็น owner/repo เช่น anthropics/skills");
      return;
    }
    setMessage(`รับ ${trimmed} แล้ว — ตัวสแกนยังไม่เปิดใช้`);
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
        />
        <Button type="submit" className="h-10 px-5">
          สแกน
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
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
