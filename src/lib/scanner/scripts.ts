// Layer B — commands that are risky to run. Applied to scripts AND to markdown,
// because an agent will happily run a command it reads in SKILL.md.

import type { Finding, Severity } from "./types";
import { excerpt, type FileKind, isScriptComment, MAX_LINE } from "./util";

interface Rule {
  id: string;
  severity: Severity;
  /** Lower severity when the match is only prose/docs in a markdown file. */
  markdownSeverity?: Severity;
  message: string;
  patterns: RegExp[];
}

const SHELLS = String.raw`(sh|bash|zsh|dash|ksh|fish|python3?|node|perl|ruby|php|iex|invoke-expression)`;

export const RULES: Rule[] = [
  {
    id: "script.pipe-to-shell",
    severity: "critical",
    message: "ดาวน์โหลดสคริปต์จาก internet แล้วรันทันทีโดยไม่มีใครได้ตรวจ",
    patterns: [
      new RegExp(
        String.raw`\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod|fetch)\b[^|\n]{0,300}\|\s*(sudo\s+)?${SHELLS}\b`,
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
    id: "script.privilege",
    severity: "low",
    message: "ขอสิทธิ์ admin หรือเปิดสิทธิ์ไฟล์ให้ทุกคน",
    patterns: [/\bsudo\s+\S/, /\bchmod\s+(-R\s+)?777\b/, /-verb\s+runas\b/i],
  },
];

export function scanScripts(path: string, content: string, kind: FileKind): Finding[] {
  const out: Finding[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((raw, i) => {
    if (kind === "script" && isScriptComment(raw)) return;
    const line = raw.length > MAX_LINE ? raw.slice(0, MAX_LINE) : raw;

    for (const rule of RULES) {
      for (const p of rule.patterns) {
        const m = p.exec(line);
        if (!m) continue;
        out.push({
          severity: kind === "markdown" && rule.markdownSeverity ? rule.markdownSeverity : rule.severity,
          rule: rule.id,
          file: path,
          line: i + 1,
          message: rule.message,
          excerpt: excerpt(line, m.index),
        });
        break; // one finding per rule per line
      }
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
