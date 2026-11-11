// Layer A — text a human reviewer can't see, or text that tries to take over the agent.

import type { Finding } from "./types";
import { excerpt, type FileKind, lineLocator, MAX_LINE } from "./util";

const ZERO_WIDTH = /[​-‏⁠-⁤﻿­]/g;
const BIDI = /[‪-‮⁦-⁩]/;
const TAGS = /[\u{E0000}-\u{E007F}]+/gu;

// Legitimate uses of invisible characters, removed before checking:
// - subdivision flags (England, Scotland, Wales) are 🏴 + tag letters + cancel tag
const TAG_FLAG = /\u{1F3F4}[\u{E0061}-\u{E007A}]{2,8}\u{E007F}/gu;
// - ZWJ between emoji builds one glyph (👨‍👩‍👧, 🏳️‍🌈)
const EMOJI_ZWJ = /(\p{Extended_Pictographic}[\u{1F3FB}-\u{1F3FF}️]?)‍(?=\p{Extended_Pictographic})/gu;
// - ZWJ/ZWNJ are part of normal spelling in Arabic-script and Indic languages
const SCRIPT_JOINER =
  /([\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}]\p{M}*)[‌‍]/gu;

function withoutLegitInvisibles(s: string): string {
  return s.replace(TAG_FLAG, "").replace(EMOJI_ZWJ, "$1").replace(SCRIPT_JOINER, "$1");
}

// Phrases that try to override the agent's instructions or hide actions from the user.
// Every gap is bounded ({0,N}) and excludes newlines so matching stays linear-ish.
export const OVERRIDE_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b[^\n.]{0,40}\b(previous|prior|above|earlier|all|any|system|original)\b[^\n.]{0,25}\b(instructions?|prompts?|rules?|guidelines?|directives?)\b/i,
  /\b(do not|don't|dont|never)\b[^\n.]{0,30}\b(tell|inform|mention|reveal|show|notify|alert)\b[^\n.]{0,20}\bthe user\b/i,
  /\bwithout\b[^\n.]{0,20}\b(asking|telling|informing|notifying|alerting|confirming with)\b[^\n.]{0,15}\bthe user\b/i,
  /\b(new|updated|real) system prompt\b/i,
  /\byou are (now|no longer)\b[^\n.]{0,40}\b(unrestricted|jailbroken|developer mode|dan)\b/i,
  /(ไม่ต้อง|ห้าม|อย่า)\s*(บอก|แจ้ง|เตือน)\s*(ให้)?\s*ผู้ใช้/,
  /(เพิกเฉย|ไม่ต้องสนใจ|ลืม|ข้าม)\s*(ต่อ)?\s*คำสั่ง\s*(ก่อนหน้า|เดิม|ทั้งหมด|ข้างบน)/,
];

// Skipping the user's confirmation. Sometimes reasonable (a deploy skill the user
// already invoked), sometimes how harm slips through — worth a look, not alarming alone.
// ("don't ask the user for a key" is fine and must not match.)
export const SKIP_CONFIRM_PATTERNS: RegExp[] = [
  /\b(do not|don't|dont|never|no need to)\b[^\n.]{0,30}\b(ask|request|wait)\b[^\n.]{0,25}\b(permission|confirmation|approval|consent)\b/i,
  /(ไม่ต้อง|ห้าม|อย่า)\s*(ขอ|รอ)\s*(การ)?\s*(อนุญาต|ยืนยัน|อนุมัติ)/,
];

// Words that make an HTML comment worth a closer look.
const SUSPICIOUS_COMMENT =
  /\b(assistant|claude|agent|llm|model|system|instructions?|execute|run|curl|wget|token|secret|password|api[ _-]?key|send|upload|silently|secretly)\b/i;

const HIDDEN_STYLE =
  /style\s*=\s*["'][^"']{0,200}(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0(?![.\d]*[1-9])|color\s*:\s*(#fff\b|#ffffff\b|white\b))/i;

const BASE64_BLOB = /[A-Za-z0-9+/]{200,}={0,2}/;

function decodeTags(s: string): string {
  return Array.from(s)
    .map((ch) => {
      const c = ch.codePointAt(0)! - 0xe0000;
      return c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : "";
    })
    .join("");
}

export function scanHidden(path: string, content: string, kind: FileKind): Finding[] {
  const out: Finding[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = raw.length > MAX_LINE ? raw.slice(0, MAX_LINE) : raw;
    const lineNo = i + 1;
    const clean = withoutLegitInvisibles(raw);

    // Unicode tag characters: invisible ASCII smuggled into the text.
    const tags = clean.match(TAGS);
    if (tags) {
      const decoded = decodeTags(tags.join(""));
      out.push({
        severity: "critical",
        rule: "hidden.unicode-tags",
        file: path,
        line: lineNo,
        message: `มีข้อความซ่อนด้วย Unicode tag ที่มองไม่เห็น ถอดได้ว่า: "${decoded.slice(0, 120)}"`,
        excerpt: excerpt(clean, clean.search(TAGS)),
      });
    }

    // Bidi controls: can make text read differently from what it really says.
    if (BIDI.test(raw)) {
      out.push({
        severity: "high",
        rule: "hidden.bidi-control",
        file: path,
        line: lineNo,
        message: "มีอักขระควบคุมทิศทางข้อความ (bidi) ที่ทำให้สิ่งที่เห็นต่างจากสิ่งที่ AI อ่าน",
        excerpt: excerpt(raw, raw.search(BIDI)),
      });
    }

    // Zero-width characters (a BOM at the very start of the file is normal).
    const scan = i === 0 && clean.startsWith("﻿") ? clean.slice(1) : clean;
    const zw = scan.match(ZERO_WIDTH);
    if (zw) {
      const many = zw.length >= 3;
      out.push({
        severity: many ? "high" : "low",
        rule: "hidden.zero-width",
        file: path,
        line: lineNo,
        message: many
          ? `มีอักขระความกว้างศูนย์ ${zw.length} ตัวในบรรทัดเดียว อาจใช้ซ่อนข้อมูล`
          : "มีอักขระความกว้างศูนย์ (มองไม่เห็น) ซึ่งอาจติดมาจากการคัดลอก",
        excerpt: excerpt(scan, scan.search(ZERO_WIDTH)),
      });
    }

    for (const p of OVERRIDE_PATTERNS) {
      const m = p.exec(line);
      if (m) {
        out.push({
          severity: "high",
          rule: "hidden.instruction-override",
          file: path,
          line: lineNo,
          message: "มีประโยคที่พยายามสั่งให้ AI ทิ้งคำสั่งเดิม หรือทำบางอย่างโดยไม่บอกผู้ใช้",
          excerpt: excerpt(line, m.index),
        });
        break;
      }
    }

    for (const p of SKIP_CONFIRM_PATTERNS) {
      const m = p.exec(line);
      if (m) {
        out.push({
          severity: "medium",
          rule: "hidden.skip-confirmation",
          file: path,
          line: lineNo,
          message: "สั่งให้ AI ทำต่อโดยไม่ต้องขอความยินยอมหรือการยืนยันจากผู้ใช้ ควรดูว่าขั้นนั้นทำอะไร",
          excerpt: excerpt(line, m.index),
        });
        break;
      }
    }

    if (kind === "markdown") {
      const m = HIDDEN_STYLE.exec(line);
      if (m) {
        out.push({
          severity: "medium",
          rule: "hidden.css-hidden",
          file: path,
          line: lineNo,
          message: "มี HTML ที่ตั้งค่าให้ซ่อนข้อความจากสายตาคน แต่ AI ยังอ่านได้",
          excerpt: excerpt(line, m.index),
        });
      }
    }

    const b = BASE64_BLOB.exec(line);
    // Skip data: URIs (inline images) — matching starts right after "base64,".
    if (b && !/base64,\s*$/i.test(line.slice(0, b.index))) {
      out.push({
        severity: "medium",
        rule: "hidden.encoded-blob",
        file: path,
        line: lineNo,
        message: `มีข้อมูลเข้ารหัสยาว ${b[0].length} ตัวอักษร ที่คนอ่านไม่ออกว่าข้างในคืออะไร`,
        excerpt: excerpt(line, b.index, 80),
      });
    }
  });

  if (kind === "markdown") out.push(...scanHtmlComments(path, content));
  return out;
}

// HTML comments don't render on GitHub, but the agent reads them.
function scanHtmlComments(path: string, content: string): Finding[] {
  const out: Finding[] = [];
  const lineAt = lineLocator(content);
  let from = 0;

  while (true) {
    const start = content.indexOf("<!--", from);
    if (start === -1) break;
    const end = content.indexOf("-->", start + 4);
    const inner = content.slice(start + 4, end === -1 ? content.length : end);
    from = end === -1 ? content.length : end + 3;

    if (inner.trim().length === 0) continue;

    const suspicious =
      end === -1 ||
      SUSPICIOUS_COMMENT.test(inner) ||
      OVERRIDE_PATTERNS.some((p) => p.test(inner));

    out.push({
      severity: suspicious ? "high" : "low",
      rule: "hidden.html-comment",
      file: path,
      line: lineAt(start),
      message:
        end === -1
          ? "มี HTML comment ที่ไม่ปิด ทำให้ทุกอย่างหลังจากนั้นถูกซ่อนจากหน้าเว็บ"
          : suspicious
            ? "มีข้อความใน HTML comment ที่ซ่อนจากหน้าเว็บแต่ AI อ่านได้ และดูเหมือนคำสั่ง"
            : "มี HTML comment (ซ่อนจากหน้าเว็บ แต่ AI อ่านได้)",
      excerpt: excerpt(inner),
    });
  }
  return out;
}
