// Layer B — commands that are risky to run. Applied to scripts AND to markdown,
// because an agent will happily run a command it reads in SKILL.md.

import type { Finding, Severity } from "./types";
import { excerpt, type FileKind, findIn, isScriptComment, windows } from "./util";

interface Rule {
  id: string;
  severity: Severity;
  /** Lower severity when the match is only prose/docs in a markdown file. */
  markdownSeverity?: Severity;
  message: string;
  patterns: RegExp[];
  /**
   * Optional: decide per match whether the text only explains or warns about the command.
   * `start`/`end` bound the part of the match to judge (capture group 1 when present).
   * A rule with this runs on every match in the line, and the line counts as soft only
   * when all of its matches are soft.
   */
  soften?: (line: string, start: number, end: number) => boolean;
  softSeverity?: Severity;
  softMessage?: string;
}

// "never use", "don't run", "avoid passing" … right before the flag, in the same clause.
// Needs a verb so "don't worry, claude --yolo" stays an instruction.
const WARNING_BEFORE =
  /(?:\b(?:never|do not|don't|dont|must not|should not|shouldn't|not to)\s+(?:ever\s+)?(?:use|using|run|running|pass|passing|add|adding|enable|enabling|set|setting|launch|launching|start|starting|invoke|invoking|include|including|call|calling|specify)\b|\bavoid(?:ing)?\b|(?:ห้าม|อย่า|ไม่ควร|หลีกเลี่ยง))[^\n.;&|]{0,60}$/i;

/** The flag alone in quotes or backticks ("--yolo") is a mention; `claude --yolo` is a command. */
function isMention(line: string, start: number, end: number): boolean {
  const open = line[start - 1];
  const close = line[end];
  return (
    open !== undefined && close !== undefined && "\"'`“‘".includes(open) && "\"'`”’".includes(close)
  );
}

function explainsAgentFlag(line: string, start: number, end: number): boolean {
  return isMention(line, start, end) || WARNING_BEFORE.test(line.slice(Math.max(0, start - 120), start));
}

const SHELLS = String.raw`(sh|bash|zsh|dash|ksh|fish|python3?|node|perl|ruby|php|iex|invoke-expression)`;

export const RULES: Rule[] = [
  {
    id: "script.pipe-to-shell",
    severity: "critical",
    message: "ดาวน์โหลดสคริปต์จาก internet แล้วรันทันทีโดยไม่มีใครได้ตรวจ",
    patterns: [
      // needs an actual address (URL, host/path or a variable): prose like
      // "never run `curl | sh` lines" is talking about the pattern, not doing it
      new RegExp(
        String.raw`\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod|fetch)\b[^|\n]{0,300}?(https?://|\$\{?\w|\b[\w-]+\.[a-z]{2,}/)[^|\n]{0,300}\|\s*(sudo\s+)?${SHELLS}\b`,
        "i",
      ),
      /\b(iex|invoke-expression)\b[^\n]{0,200}\b(downloadstring|net\.webclient|invoke-webrequest|iwr|irm)\b/i,
      /\b(bash|sh|zsh)\s+(-c\s+)?["']?\s*<\(\s*(curl|wget)\b/i,
    ],
  },
  {
    id: "script.encoded-exec",
    severity: "critical",
    message: "ถอดรหัสข้อมูลที่ซ่อนไว้แล้วรันเป็นคำสั่ง ทำให้ตรวจไม่ได้ว่ารันอะไร",
    patterns: [
      new RegExp(String.raw`base64\s+(-d|--decode|-D)\b[^|\n]{0,200}\|\s*(sudo\s+)?${SHELLS}\b`, "i"),
      /\beval\b[^\n]{0,200}\b(base64|atob|b64decode|frombase64string)\b/i,
      /\bexec\s*\(\s*(base64|codecs|zlib|marshal|bytes\.fromhex|__import__\(\s*["']base64)/i,
      /\bpowershell(\.exe)?\b[^\n]{0,100}\s-(e|en|enc|encodedcommand)\s+[A-Za-z0-9+/=]{20,}/i,
    ],
  },
  {
    id: "script.download-exec",
    severity: "high",
    message: "ดาวน์โหลดไฟล์มาแล้วสั่งรัน",
    patterns: [
      /\b(curl|wget)\b[^\n]{0,200}(\s-o\s*|\s-O\b|--output\b)[^\n]{0,200}(&&|;)\s*(chmod\s+(\+x|[0-7]*[1357])\b|\.\/|(sudo\s+)?(sh|bash)\s)/i,
    ],
  },
  {
    id: "script.credential-access",
    severity: "high",
    markdownSeverity: "medium",
    message: "แตะไฟล์หรือที่เก็บรหัสผ่าน / key / token ของผู้ใช้",
    patterns: [
      /(~|\$HOME|\$\{HOME\}|%USERPROFILE%|\$env:USERPROFILE)[/\\]\.(ssh|aws|gnupg|kube|docker|azure|config[/\\]gcloud)\b/i,
      /\b(id_rsa|id_ed25519|id_ecdsa)\b/,
      /(~|\$HOME)[/\\]\.(netrc|git-credentials|npmrc|pypirc|pgpass)\b/i,
      /\.aws[/\\]credentials\b/i,
      /\bsecurity\s+(find-generic-password|find-internet-password|dump-keychain)\b/,
      /\bgh\s+auth\s+token\b/,
      /(Login Data|Local State|cookies\.sqlite|key[34]\.db|logins\.json)\b/,
      /\b(cat|type|less|more|head|tail|cp|scp|base64|get-content|open)\b[^\n]{0,80}(^|[\s"'/\\])\.env(\.[\w-]+)?\b/i,
    ],
  },
  {
    id: "script.exfiltration",
    severity: "medium",
    // API docs are full of `curl -X POST https://api.service.com`; in prose it only matters
    // together with secret access (see credential-exfil below)
    markdownSeverity: "low",
    message: "ส่งข้อมูลออกไปยังเครื่องอื่นผ่าน internet",
    patterns: [
      /\b(curl|wget)\b[^\n]{0,300}(\s-d\b|\s--data(-binary|-raw|-urlencode)?\b|\s-F\b|\s--form\b|\s-T\b|\s--upload-file\b|\s-X\s*POST\b|\s--post-(data|file)\b)/i,
      /\brequests\.(post|put)\s*\(/,
      /\bfetch\s*\([^\n]{0,200}method\s*:\s*["'](POST|PUT)["']/i,
      /\binvoke-(webrequest|restmethod)\b[^\n]{0,200}-method\s+(post|put)\b/i,
      /\burllib\.request\.urlopen\([^\n]{0,200}data\s*=/,
    ],
  },
  {
    id: "script.exfil-endpoint",
    severity: "high",
    message: "ติดต่อบริการที่มักใช้รับข้อมูลที่ขโมยมา หรือเปิดช่องให้เครื่องอื่นควบคุม",
    patterns: [
      /\b(webhook\.site|requestbin|pipedream\.net|ngrok(-free)?\.(io|app)|burpcollaborator|interact\.sh|oast\.(fun|live|me|pro|site)|pastebin\.com\/api)/i,
      /\/dev\/(tcp|udp)\//,
      /\b(nc|ncat|netcat)\b[^\n]{0,60}\s-(e|c)\s/,
    ],
  },
  {
    id: "script.persistence",
    severity: "high",
    message: "ฝังตัวให้รันเองต่อไปเรื่อยๆ แม้ปิด skill ไปแล้ว",
    patterns: [
      /\bcrontab\b/,
      />>?\s*["']?(~|\$HOME)?[/\\]?[^\s"']{0,60}\.(bashrc|zshrc|bash_profile|zprofile|profile|zshenv)\b/,
      /\blaunchctl\s+(load|bootstrap)\b/,
      /LaunchAgents|LaunchDaemons/,
      /\bsystemctl\s+(--user\s+)?enable\b/,
      /\bschtasks\b[^\n]{0,100}\/create\b/i,
      /CurrentVersion\\Run(Once)?\b/i,
      /\bauthorized_keys\b/,
    ],
  },
  {
    id: "script.destructive",
    severity: "high",
    message: "คำสั่งที่ลบหรือทำลายข้อมูลวงกว้าง",
    patterns: [
      /\brm\s+-[a-z]*r[a-z]*\s+(--no-preserve-root\s+)?["']?(\/|~|\$HOME|\/\*|~\/\*)["']?(\s|$)/i,
      /\bmkfs(\.\w+)?\b/,
      /\bdd\b[^\n]{0,100}\bof=\/dev\/(sd|nvme|disk|hd)/,
      /\bremove-item\b[^\n]{0,100}-recurse[^\n]{0,100}(c:\\\s|\$env:userprofile|~[\s"'])/i,
    ],
  },
  {
    id: "script.disable-security",
    severity: "medium",
    markdownSeverity: "low",
    message: "ปิดระบบป้องกันหรือข้ามการตรวจสอบความปลอดภัย",
    patterns: [
      /\bset-mppreference\b[^\n]{0,100}-disable/i,
      /\bspctl\s+--master-disable\b/,
      /\bsetenforce\s+0\b/,
      /\bxattr\s+-[a-z]*d[a-z]*\s+com\.apple\.quarantine\b/,
      /--no-verify\b/,
      /\bgit\s+config\b[^\n]{0,60}core\.hookspath\b/i,
      /(-k|--insecure)\b[^\n]{0,100}\bhttps:|\bverify\s*=\s*False\b|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/,
    ],
  },
  {
    // Starting another coding agent with its permission prompts off: it can then run
    // commands and edit files without anyone approving each step.
    id: "script.agent-bypass-permissions",
    severity: "medium",
    softSeverity: "low",
    message:
      "สั่งให้ AI coding agent ตัวอื่นทำงานโดยปิดการขออนุญาต (permission / approval) จึงรันคำสั่งและแก้ไฟล์ได้เองโดยไม่ถามผู้ใช้",
    softMessage:
      "พูดถึง flag ที่ปิดการขออนุญาตของ AI coding agent น่าจะเป็นคำอธิบายหรือคำเตือน ไม่ใช่คำสั่งให้รัน แต่ควรดูบริบท",
    soften: explainsAgentFlag,
    // group 1 = the flag, at the end of the match (for --permission-mode, the flag and its value)
    patterns: [
      /(?<![\w-])(--dangerously-skip-permissions)(?![\w-])/,
      /(?<![\w-])(--permission-mode(?:\s*=\s*|\s+)["']?bypassPermissions)(?![\w-])/,
      /(?<![\w-])(--dangerously-bypass-approvals-and-sandbox)(?![\w-])/,
      // --full-auto / --yolo mean something else (or nothing) for other commands
      /(?<![\w-])codex(?:-cli)?(?![\w.-])[^\n|;&]{0,200}?[\s"'`“‘](--full-auto|--yolo)(?![\w-])/i,
      /(?<![\w-])gemini(?:-cli)?(?![\w.-])[^\n|;&]{0,200}?[\s"'`“‘](--yolo)(?![\w-])/i,
    ],
  },
  {
    id: "script.privilege",
    severity: "low",
    message: "ขอสิทธิ์ admin หรือเปิดสิทธิ์ไฟล์ให้ทุกคน",
    patterns: [/\bsudo\s+\S/, /\bchmod\s+(-R\s+)?777\b/, /-verb\s+runas\b/i],
  },
];

function findFirst(line: string, rule: Rule): { index: number; soft: false } | null {
  for (const p of rule.patterns) {
    const m = findIn(line, p);
    if (m) return { index: m.index, soft: false };
  }
  return null;
}

/** All matches of a softenable rule; prefers a hard match over a soft one. */
function findAgentMatch(line: string, rule: Rule): { index: number; soft: boolean } | null {
  let soft: { index: number; soft: true } | null = null;
  for (const p of rule.patterns) {
    const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
    for (const w of windows(line)) {
      for (const m of w.text.matchAll(re)) {
        // group 1 is always the tail of the match, so the flag starts at its last occurrence
        const flag = m[1] ?? m[0];
        const start = w.offset + m.index + m[0].lastIndexOf(flag);
        const end = start + flag.length;
        if (!rule.soften!(line, start, end)) return { index: start, soft: false };
        soft ??= { index: start, soft: true };
      }
    }
  }
  return soft;
}

export function scanScripts(path: string, content: string, kind: FileKind): Finding[] {
  const out: Finding[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((raw, i) => {
    if (kind === "script" && isScriptComment(raw)) return;
    const line = raw;

    for (const rule of RULES) {
      const hit = rule.soften ? findAgentMatch(line, rule) : findFirst(line, rule);
      if (!hit) continue;
      const soft = hit.soft;
      out.push({
        severity: soft
          ? (rule.softSeverity ?? rule.severity)
          : kind === "markdown" && rule.markdownSeverity
            ? rule.markdownSeverity
            : rule.severity,
        rule: rule.id,
        file: path,
        line: i + 1,
        message: soft && rule.softMessage ? rule.softMessage : rule.message,
        excerpt: excerpt(line, hit.index),
      });
    }
  });

  // Reading secrets AND sending data out in the same file is the classic theft pattern.
  const readsSecrets = out.some((f) => f.rule === "script.credential-access");
  const sendsOut = out.some((f) => f.rule === "script.exfiltration" || f.rule === "script.exfil-endpoint");
  if (readsSecrets && sendsOut) {
    out.push({
      severity: "critical",
      rule: "script.credential-exfil",
      file: path,
      line: null,
      message: "ไฟล์นี้ทั้งอ่านข้อมูลลับและส่งข้อมูลออก internet ซึ่งเป็นรูปแบบการขโมยข้อมูล",
    });
  }
  return out;
}
