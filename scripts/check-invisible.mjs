// npm run check:invisible        — fail if source files contain literal invisible characters
// npm run check:invisible -- --fix — replace them with visible escape sequences
//
// A security scanner whose own source hides zero-width, bidi or Unicode-tag characters
// is exactly what it warns about. Some editors and AI tools write such characters
// literally when given escape sequences, so this check runs before every commit.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFE00-\uFE0F\uFEFF]|[\u{E0000}-\u{E01EF}]/gu;
const hex = (n) => n.toString(16).toUpperCase().padStart(4, "0");
const fix = process.argv.includes("--fix");

const files = execSync("git ls-files --cached --others --exclude-standard -- src scripts fixtures docs README.md AGENTS.md", {
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => /\.(ts|tsx|mjs|js|json|md|fixture)$/.test(f));

// Emoji legitimately use variation selector 16 and ZWJ (e.g. the warning sign emoji, family emoji).
const PICTO = /\p{Extended_Pictographic}/u;
function isEmojiPart(src, offset, ch) {
  const cp = ch.codePointAt(0);
  const prev = String.fromCodePoint(src.codePointAt(Math.max(0, offset - 2)) ?? 0);
  const prev1 = src[offset - 1] ?? "";
  const before = PICTO.test(prev) || PICTO.test(prev1) || /[\u{1F3FB}-\u{1F3FF}]/u.test(prev);
  if (cp === 0xfe0f || cp === 0xfe0e) return before;
  if (cp === 0x200d) return before || prev1 === "\uFE0F";
  return false;
}

let total = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const json = file.endsWith(".json");
  let n = 0;
  const out = src.replace(INVISIBLE, (ch, offset) => {
    if (isEmojiPart(src, offset, ch)) return ch;
    n++;
    const cp = ch.codePointAt(0);
    if (cp <= 0xffff) return `\\u${hex(cp)}`;
    if (!json) return `\\u{${hex(cp)}}`;
    return [...Array(ch.length)].map((_, i) => `\\u${hex(ch.charCodeAt(i))}`).join("");
  });
  if (n === 0) continue;
  total += n;
  console.log(`${file}: ${n} invisible character(s)${fix ? " — escaped" : ""}`);
  if (fix) writeFileSync(file, out, "utf8");
}

if (total === 0) console.log("No literal invisible characters.");
else if (!fix) {
  console.error("Run `npm run check:invisible -- --fix` to replace them with escapes.");
  process.exit(1);
}
