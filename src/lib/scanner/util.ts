import type { Severity } from "./types";

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Long lines are scanned in overlapping windows so a payload hidden deep in a
 * minified or padded line is still seen, while each regex only runs on a bounded chunk.
 */
const WINDOW = 4000;
const OVERLAP = 400;

export function windows(line: string): { text: string; offset: number }[] {
  if (line.length <= WINDOW) return [{ text: line, offset: 0 }];
  const out: { text: string; offset: number }[] = [];
  for (let start = 0; ; start += WINDOW - OVERLAP) {
    out.push({ text: line.slice(start, start + WINDOW), offset: start });
    if (start + WINDOW >= line.length) break;
  }
  return out;
}

/** First match of `re` anywhere in `line`, with its index in the full line. */
export function findIn(line: string, re: RegExp): { index: number; match: string } | null {
  for (const w of windows(line)) {
    const m = re.exec(w.text);
    if (m) return { index: w.offset + m.index, match: m[0] };
  }
  return null;
}

/**
 * Is position `at` inside a quotation or inline code on this line?
 * Quoted phrases are usually examples being discussed, not instructions.
 */
export function isQuoted(line: string, at: number): boolean {
  const before = line.slice(0, at);
  const count = (re: RegExp) => (before.match(re) ?? []).length;
  return (
    count(/"/g) % 2 === 1 ||
    count(/`/g) % 2 === 1 ||
    count(/“/g) > count(/”/g) ||
    count(/«/g) > count(/»/g)
  );
}

export type FileKind = "markdown" | "html" | "script" | "other";

const MARKDOWN_EXT = new Set(["md", "mdx", "markdown", "txt"]);
const HTML_EXT = new Set(["html", "htm"]);
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
  if (HTML_EXT.has(ext)) return "html";
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
  /[\u0000\u200B-\u200F\u2060-\u2064\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]|[\u{E0000}-\u{E007F}]/gu;

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
