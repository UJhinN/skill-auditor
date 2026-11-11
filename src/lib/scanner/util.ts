import type { Severity } from "./types";

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Regexes only ever see this many characters of a line (keeps scans fast on minified files). */
export const MAX_LINE = 4000;

export type FileKind = "markdown" | "script" | "other";

const MARKDOWN_EXT = new Set(["md", "mdx", "markdown", "txt", "html", "htm"]);
const SCRIPT_EXT = new Set([
  "sh", "bash", "zsh", "fish", "ksh",
  "ps1", "psm1", "bat", "cmd",
  "py", "js", "mjs", "cjs", "ts", "rb", "pl", "php",
]);

export function fileKind(path: string): FileKind {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "other";
  const ext = name.slice(dot + 1).toLowerCase();
  if (MARKDOWN_EXT.has(ext)) return "markdown";
  if (SCRIPT_EXT.has(ext)) return "script";
  return "other";
}

/** Whole-line comment in a script file — not executed, so layer B skips it. */
export function isScriptComment(line: string): boolean {
  const t = line.trimStart();
  return (
    (t.startsWith("#") && !t.startsWith("#!")) ||
    t.startsWith("//") ||
    /^rem\s/i.test(t) ||
    t.startsWith("::")
  );
}

// Zero-width, bidi controls, BOM, soft hyphen, and Unicode tag characters.
const INVISIBLE_ANY =
  /[​-‏⁠-⁤‪-‮⁦-⁩﻿­]|[\u{E0000}-\u{E007F}]/gu;

/** Replace invisible characters with a visible ⟦U+XXXX⟧ marker. */
export function reveal(text: string): string {
  return text.replace(INVISIBLE_ANY, (ch) => {
    const hex = ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
    return `⟦U+${hex}⟧`;
  });
}

/** Short, single-line, invisible-safe snippet of `text` around position `at`. */
export function excerpt(text: string, at = 0, max = 160): string {
  const start = Math.max(0, at - 40);
  const slice = text.slice(start, start + max * 2);
  let out = reveal(slice).replace(/\s+/g, " ").trim();
  if (out.length > max) out = out.slice(0, max - 1) + "…";
  return start > 0 ? "…" + out : out;
}

/** Index → 1-based line number, via binary search over line starts. */
export function lineLocator(content: string): (index: number) => number {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}
