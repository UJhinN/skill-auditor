// What a skill uses, as plain facts: programs it tells the agent to run, sites its files
// mention, credential-like environment variables, other environment variables, and places
// outside the project it refers to. No judgement here; the report shows it next to the
// rule results so that every report has something to read even when no rule matched.
//
// Pure text processing: nothing from a scanned file is executed, imported or fetched.
// Every value that comes out is built from a narrow character class (ASCII letters,
// digits and a few punctuation marks), so it is safe to show as plain text.

import type { SkillFile } from "./scanner";

export interface SkillUses {
  /** programs the skill tells the agent to run, most mentioned first */
  programs: string[];
  /** hostnames found in http(s) URLs. Mentions, not proof of contact: many are documentation links */
  sites: string[];
  /** environment variables whose names look like credentials */
  secrets: string[];
  /** other environment variables */
  envVars: string[];
  /** locations outside the project (home folder, /etc, …), first two path segments */
  paths: string[];
  /** nothing above was found: the skill is instructions for the AI and no commands */
  instructionsOnly: boolean;
}

/** Each list is cut to this many entries. */
export const MAX_ITEMS = 30;
const MAX_VALUE = 100;

// ---------- small helpers ----------

class Counter {
  private counts = new Map<string, number>();
  add(value: string) {
    if (value.length === 0 || value.length > MAX_VALUE) return;
    this.counts.set(value, (this.counts.get(value) ?? 0) + 1);
  }
  /** most mentioned first, ties alphabetical */
  top(n = MAX_ITEMS): string[] {
    return [...this.counts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, n)
      .map(([v]) => v);
  }
}

function extension(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

const isSkillMdFile = (path: string) => path === "SKILL.md" || path.endsWith("/SKILL.md");
const isMarkdown = (path: string) => ["md", "mdx", "markdown", "txt"].includes(extension(path));
const isShellFile = (path: string) => ["sh", "bash", "zsh"].includes(extension(path));
const isPowerShellFile = (path: string) => extension(path) === "ps1";

// ---------- programs ----------

/** Shell builtins, keywords and basic utilities: they say nothing about what a skill relies on. */
const NOT_PROGRAMS = new Set(
  (
    "cd echo export if then else fi for do done while case set unset source true false return local read printf exit " +
    "test cat ls cp mv mkdir rm touch pwd head tail grep sed awk sort uniq wc cut tr xargs tee find chmod ln " +
    "basename dirname date sleep which type alias eval wait trap " +
    // same kind, not in the brief's list: more builtins and shell plumbing
    "command declare typeset readonly shift getopts umask ulimit hash let jobs bg fg builtin pushd popd dirs " +
    "history help times elif until esac function select in continue break kill " +
    // PowerShell equivalents of echo / cd / control flow
    "write-host write-output write-error write-warning write-verbose set-location get-location " +
    "foreach-object where-object select-object out-null out-file set-variable get-variable start-sleep " +
    "param foreach"
  ).split(/\s+/),
);

/** Words that wrap another command: the program is the word after them. */
const WRAPPERS = new Set(["sudo", "nohup", "env", "time", "exec", "if", "then", "else", "elif", "do", "while", "until", "!", "nice"]);

/** Programs common enough that a lone `name` in a code span is a fair guess for a command. */
const KNOWN_PROGRAMS = new Set(
  (
    "git gh npm npx pnpm yarn bun bunx deno node python python3 pip pip3 pipx uv uvx poetry conda " +
    "docker docker-compose podman kubectl helm terraform ansible make cmake cargo rustc rustup go gradle mvn " +
    "java javac dotnet ruby gem bundle rake php composer curl wget aws gcloud gsutil az vercel netlify wrangler " +
    "firebase supabase heroku fly flyctl railway brew apt apt-get dnf yum pacman apk choco winget scoop " +
    "ffmpeg magick convert jq yq rg fd fzf tar zip unzip gzip ssh scp rsync psql mysql sqlite3 redis-cli mongosh " +
    "openssl gpg claude codex gemini tsc eslint prettier pytest jest vitest playwright cypress next vite tsx " +
    "ts-node pandoc soffice libreoffice tesseract ollama pre-commit"
  ).split(/\s+/),
);

const PROGRAM_NAME = /^[a-z][a-z0-9._-]{1,30}$/;
/** `foo.json`, `run.sh`: a file name, not a program */
const FILE_LIKE = /\.(md|mdx|json|jsonc|ya?ml|toml|txt|lock|csv|html?|css|xml|env|png|jpe?g|gif|svg|pdf|py|js|mjs|cjs|ts|tsx|jsx|sh|ps1|rb|php|go|rs|java|c|h|cpp)$/;

const SHELL_LANGS = new Set([
  "bash", "sh", "shell", "zsh", "console", "terminal", "powershell", "ps1",
  "pwsh", "shellsession", "shell-session", "shellscript",
]);
const POWERSHELL_LANGS = new Set(["powershell", "ps1", "pwsh"]);
/** Blocks that mix commands and their output: only lines with a prompt are commands. */
const SESSION_LANGS = new Set(["console", "terminal", "shellsession", "shell-session"]);

interface Segment {
  word: string;
  args: string[];
}

/**
 * Walk one line of shell and cut it into simple commands. Quoted text is blanked out so
 * `echo "a; b"` is one command, and a comment ends the line. `state` carries an unclosed
 * quote over to the next line so the rest of a multi-line string is not read as commands.
 */
function blankQuotes(line: string, state: { quote: string | null }, powershell: boolean): string {
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (state.quote) {
      if (ch === "\\" && state.quote === '"' && !powershell) {
        out += "xx";
        i++;
      } else if (ch === state.quote) {
        out += ch;
        state.quote = null;
      } else {
        out += "x";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      state.quote = ch;
      out += ch;
    } else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      break; // a comment
    } else {
      out += ch;
    }
  }
  return out;
}

function segmentsOf(code: string, powershell: boolean): Segment[] {
  const separators = powershell ? /&&|\|\||[|;()]|\$\(/ : /\$\(|&&|\|\||(?<![>&|])&(?![&>])|[|;`()]/;
  const out: Segment[] = [];
  for (const part of code.split(separators)) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
        i++; // VAR=value before the command
      } else if (t === "{" || t === "}") {
        i++; // brace group: { cmd; }
      } else if (WRAPPERS.has(t.toLowerCase())) {
        i++;
        while (i < tokens.length && tokens[i].startsWith("-")) i++; // sudo -E, env -i
      } else {
        break;
      }
    }
    if (i >= tokens.length) continue;
    out.push({ word: tokens[i], args: tokens.slice(i + 1) });
  }
  return out;
}

function programName(word: string, powershell: boolean): string | null {
  const w = powershell ? word.toLowerCase() : word;
  if (!PROGRAM_NAME.test(w)) return null;
  // `e.g.`, `etc.`, `foo-`: a word ending in punctuation is prose
  if (!/[a-z0-9]$/.test(w) || w.includes("..")) return null;
  if (NOT_PROGRAMS.has(w) || FILE_LIKE.test(w)) return null;
  return w;
}

function countCommands(
  lines: string[],
  powershell: boolean,
  counter: Counter,
  opts: { promptsOnly?: boolean } = {},
) {
  const state = { quote: null as string | null };
  let heredoc: string | null = null;
  let continued = false;
  // functions the script defines itself are not programs
  const defined = new Set<string>();
  for (const l of lines) {
    const m = /^\s*(?:function\s+)?([A-Za-z_][\w.-]*)\s*\(\s*\)|^\s*function\s+([A-Za-z_][\w.-]*)/i.exec(l);
    if (m) defined.add((m[1] ?? m[2]).toLowerCase());
  }

  for (const raw of lines) {
    if (heredoc !== null) {
      if (raw.trim() === heredoc) heredoc = null;
      continue;
    }
    const wasContinued = continued;
    const insideQuote = state.quote !== null;
    let line = raw.replace(/\s+$/, "");
    continued = powershell ? line.endsWith("`") : line.endsWith("\\");

    const prompt = /^\s*[$>]\s+/.test(line);
    if (opts.promptsOnly && !prompt) continue;
    line = line.replace(/^\s*[$>]\s+/, "");
    if (/^\s*#/.test(line) && !insideQuote) continue;

    // a `case` label such as `start)` is not a command
    const code = blankQuotes(line, state, powershell).replace(/^\s*[\w*|.-]+\)\s*/, "");
    if (wasContinued || insideQuote) continue; // arguments of the previous line, or a multi-line string

    const here = /<<-?\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/.exec(line); // the raw line: quotes are blanked in `code`
    if (here) heredoc = here[1];

    for (const seg of segmentsOf(code, powershell)) {
      const name = programName(seg.word, powershell);
      if (name && !defined.has(name)) counter.add(name);
    }
  }
}

/** Fenced code blocks of a markdown file whose label says shell, as { lines, lang }. */
function shellBlocks(content: string): { lines: string[]; lang: string }[] {
  const blocks: { lines: string[]; lang: string }[] = [];
  let open: { char: string; len: number; lang: string; lines: string[] } | null = null;
  for (const line of content.split(/\r?\n/)) {
    if (!open) {
      const m = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
      if (m) {
        const lang = m[2].toLowerCase().replace(/[{:,].*$/, "");
        open = { char: m[1][0], len: m[1].length, lang, lines: [] };
      }
      continue;
    }
    const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
    if (close && close[1][0] === open.char && close[1].length >= open.len) {
      if (SHELL_LANGS.has(open.lang)) blocks.push({ lines: open.lines, lang: open.lang });
      open = null;
    } else {
      open.lines.push(line);
    }
  }
  if (open && SHELL_LANGS.has(open.lang)) blocks.push({ lines: open.lines, lang: open.lang }); // unclosed fence
  return blocks;
}

/** Lines of a markdown file that are outside every fenced block (any label). */
function proseLines(content: string): string[] {
  const out: string[] = [];
  let open: { char: string; len: number } | null = null;
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (!open) {
      if (m) open = { char: m[1][0], len: m[1].length };
      else out.push(line);
    } else if (m && m[1][0] === open.char && m[1].length >= open.len && m[2].trim() === "") {
      open = null;
    }
  }
  return out;
}

const INLINE_CODE = /(?<!`)`([^`\n]{1,200})`(?!`)/g;

/** `npm run build`, `git status`, `foo --flag`: a code span that reads like a command. */
function countInlineCommands(line: string, counter: Counter) {
  for (const m of line.matchAll(INLINE_CODE)) {
    const span = m[1].trim().replace(/^[$>]\s+/, "");
    const code = blankQuotes(span, { quote: null }, false);
    for (const seg of segmentsOf(code, false)) {
      const name = programName(seg.word, false);
      if (!name) continue;
      const first = seg.args[0];
      const hasArgs = first !== undefined && (first.startsWith("-") || /^(\.{0,2}\/|~\/|https?:)/.test(first) || first.includes("/"));
      if (KNOWN_PROGRAMS.has(name) || hasArgs) counter.add(name);
    }
  }
}

// ---------- sites ----------

const URL_HOST = /\bhttps?:\/\/([^\s/?#"'<>`)\]}\\|,;*]+)(\/[^\s"'<>`)\]}\\|,;*]{0,40})?/gi;
/** XML namespace identifiers and licence links look like URLs but say nothing about the skill. */
const NAMESPACE_URL: [RegExp, RegExp][] = [
  [/^w3\.org$/, /^\/(?:19|20)\d\d\//],
  [/^purl\.org$/, /^\/dc\//],
  [/./, /^\/licen[sc]es?\//i], // a licence link in a file header, e.g. apache.org/licenses/LICENSE-2.0
];
/** Licence texts and schema files are full of URLs that say nothing about what the skill does. */
const LICENCE_FILE = /^(?:licen[sc]e|copying|notice|patents)(?:\.\w+)?$/i;
const SCHEMA_EXT = new Set(["xsd", "xml", "rels", "wsdl", "xslt", "dtd"]);
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const TLD = /^(?:[a-z]{2,}|xn--[a-z0-9]+)$/;

function isPlaceholderHost(host: string): boolean {
  const under = (suffix: string) => host === suffix || host.endsWith(`.${suffix}`);
  return (
    under("example.com") || under("example.org") || under("example.net") ||
    under("localhost") || under("invalid") || under("test") || under("example")
  );
}

function hostOf(rawHost: string): string | null {
  const host = rawHost
    .replace(/^.*@/, "")
    .replace(/:\d*$/, "")
    .toLowerCase()
    .replace(/\.+$/, "")
    .replace(/^www\./, "");
  if (host.length > MAX_VALUE || !HOSTNAME.test(host)) return null;
  if (!TLD.test(host.slice(host.lastIndexOf(".") + 1))) return null;
  return isPlaceholderHost(host) ? null : host;
}

// ---------- environment variables ----------

const NAME = String.raw`[A-Z][A-Z0-9_]{1,63}`;
const QUOTED_NAME = String.raw`\(\s*["'](${NAME})["']`;
/** $NAME and ${NAME}: in a script these may also be plain shell variables (see assignedHere). */
const DOLLAR_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\$(${NAME})(?![A-Za-z0-9_])`, "g"),
  // not ${JSON.stringify(x)}: a JavaScript template, not a shell expansion
  new RegExp(String.raw`\$\{(${NAME})(?=[}:\-+=?#%/\[@^,])`, "g"),
];
const ENV_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bprocess\.env\.(${NAME})(?![A-Za-z0-9_])`, "g"),
  new RegExp(String.raw`\bprocess\.env\[\s*["'](${NAME})["']`, "g"),
  new RegExp(String.raw`\b(?:os\.environ|ENV)\[\s*["'](${NAME})["']`, "g"),
  new RegExp(String.raw`\b(?:os\.environ\.get|os\.getenv|getenv|Deno\.env\.get|ENV\.fetch|System\.getenv)${QUOTED_NAME}`, "g"),
  new RegExp(String.raw`\bexport\s+(${NAME})=`, "g"),
];
/** NAME=value on a line of its own (no command after it): a variable the script sets for itself. */
const PLAIN_ASSIGNMENT =
  /^[ \t]*(?:(?:local|declare(?:[ \t]+-[a-zA-Z]+)*|readonly|typeset)[ \t]+)?([A-Z][A-Z0-9_]{1,63})=(?:\(.*|\$\(.*|"[^"\n]*"|'[^'\n]*'|\S*)[ \t]*$/gm;
const POWERSHELL_ENV = /\$env:([A-Za-z_][A-Za-z0-9_]{1,63})(?![A-Za-z0-9_])/gi;

/** A bare NAME_TOKEN / NAME_KEY / NAME_SECRET / NAME_PASSWORD anywhere in the text. */
const BARE_SECRET = /(?<![A-Za-z0-9_])[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:TOKEN|KEY|SECRET|PASSWORD)(?![A-Za-z0-9_])/g;

/** Uppercase words that end in _KEY but are database or keyboard terms, not credentials. */
const NOT_SECRETS = new Set(
  (
    "PRIMARY_KEY FOREIGN_KEY SORT_KEY PARTITION_KEY HASH_KEY RANGE_KEY UNIQUE_KEY COMPOSITE_KEY SURROGATE_KEY " +
    "SHIFT_KEY CTRL_KEY ALT_KEY ENTER_KEY ESCAPE_KEY ESC_KEY META_KEY SPACE_KEY ARROW_KEY"
  ).split(" "),
);

/** Ordinary environment, shell internals and awk fields: not worth listing. */
const COMMON_ENV = new Set(
  (
    "HOME PATH PWD USER SHELL TMPDIR TERM LANG ARGUMENTS " +
    "OLDPWD IFS UID EUID PPID RANDOM LINENO BASH_SOURCE OSTYPE HOSTNAME LOGNAME NF NR FNR FS OFS RS ORS ENV"
  ).split(" "),
);

const SECRET_WORD = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|AUTH|AUTHORIZATION)S?$/;

/** Does a variable name look like it holds a credential? Checked per `_`-separated part. */
export function looksLikeSecretName(name: string): boolean {
  return name.split("_").some((part) => SECRET_WORD.test(part));
}

// ---------- paths outside the project ----------

const SEGMENT = String.raw`([\w.@+-]+)`;
/** ~/x, $HOME/x, ${HOME}/x, $env:USERPROFILE/x */
const HOME_PATH = new RegExp(
  String.raw`(?<![\w.\/\\~$%{}-])(~|\$HOME|\$\{HOME\}|\$env:USERPROFILE)[\/\\]${SEGMENT}`,
  "gi",
);
const WINDOWS_PATH = new RegExp(String.raw`%(USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|HOMEPATH)%(?:[\/\\]${SEGMENT})?`, "gi");
const SYSTEM_PATH = new RegExp(
  String.raw`(?<![\w.:\/\\~$%{}@-])\/(?:(etc|opt|var|root|Library)(?![\w.@+-])(?:\/${SEGMENT})?|(usr\/local)(?![\w@+-]))`,
  "g",
);

function cleanSegment(seg: string | undefined): string | null {
  if (!seg) return null;
  const s = seg.replace(/[.\-+@]+$/, "");
  return /[A-Za-z0-9]/.test(s) && s !== "." && s !== ".." ? s : null;
}

// ---------- per-skill inventory ----------

/** The inventory of one skill from its own files (the caller has already left out nested skills). */
export function usesOf(files: SkillFile[]): SkillUses {
  const programs = new Counter();
  const sites = new Counter();
  const secrets = new Counter();
  const envVars = new Counter();
  const paths = new Counter();

  for (const file of files) {
    const content = file.content.replaceAll("\u0000", "");
    // a shebang names the interpreter, not something the skill chose to rely on
    const text = content.startsWith("#!") ? content.slice(content.indexOf("\n") + 1 || content.length) : content;

    // programs
    if (isMarkdown(file.path)) {
      for (const block of shellBlocks(text)) {
        const ps = POWERSHELL_LANGS.has(block.lang);
        const hasPrompt = block.lines.some((l) => /^\s*[$>]\s+/.test(l));
        countCommands(block.lines, ps, programs, { promptsOnly: SESSION_LANGS.has(block.lang) && hasPrompt });
      }
      if (isSkillMdFile(file.path)) for (const line of proseLines(text)) countInlineCommands(line, programs);
    } else if (isShellFile(file.path) || isPowerShellFile(file.path)) {
      countCommands(text.split(/\r?\n/), isPowerShellFile(file.path), programs);
    }

    // sites
    const base = file.path.split("/").pop() ?? file.path;
    if (!LICENCE_FILE.test(base) && !SCHEMA_EXT.has(extension(file.path))) {
      for (const m of text.matchAll(URL_HOST)) {
        const host = hostOf(m[1]);
        if (!host || NAMESPACE_URL.some(([h, p]) => h.test(host) && p.test(m[2] ?? ""))) continue;
        sites.add(host);
      }
    }

    // environment variables
    const seen = (name: string) => {
      if (COMMON_ENV.has(name)) return;
      if (looksLikeSecretName(name)) secrets.add(name);
      else envVars.add(name);
    };
    const assignedHere = new Set([...text.matchAll(PLAIN_ASSIGNMENT)].map((m) => m[1]));
    for (const re of DOLLAR_PATTERNS) {
      for (const m of text.matchAll(re)) {
        if (assignedHere.has(m[1]) && !looksLikeSecretName(m[1])) continue; // the script's own variable
        seen(m[1]);
      }
    }
    for (const re of ENV_PATTERNS) for (const m of text.matchAll(re)) seen(m[1]);
    for (const m of text.matchAll(POWERSHELL_ENV)) seen(m[1].toUpperCase());
    for (const m of text.matchAll(BARE_SECRET)) if (!NOT_SECRETS.has(m[0])) secrets.add(m[0]);

    // paths
    for (const m of text.matchAll(HOME_PATH)) {
      const seg = cleanSegment(m[2]);
      if (seg) paths.add(`${/^~$/.test(m[1]) ? "~" : /home/i.test(m[1]) ? "$HOME" : "$env:USERPROFILE"}/${seg}`);
    }
    for (const m of text.matchAll(WINDOWS_PATH)) {
      const seg = cleanSegment(m[2]);
      paths.add(`%${m[1].toUpperCase()}%${seg ? `/${seg}` : ""}`);
    }
    for (const m of text.matchAll(SYSTEM_PATH)) {
      if (m[3]) {
        paths.add("/usr/local");
      } else {
        const seg = cleanSegment(m[2]);
        paths.add(`/${m[1]}${seg ? `/${seg}` : ""}`);
      }
    }
  }

  const uses = {
    programs: programs.top(),
    sites: sites.top(),
    secrets: secrets.top(),
    envVars: envVars.top(),
    paths: paths.top(),
  };
  return { ...uses, instructionsOnly: Object.values(uses).every((l) => l.length === 0) };
}

/**
 * The inventory of every skill among `files`, one entry per SKILL.md, root first then by path.
 * A file counts for the deepest skill folder above it, so a nested skill's files are not
 * also counted for the skill that contains it. Files outside every skill folder are left out.
 */
export function inventory(files: SkillFile[]): { root: string; uses: SkillUses }[] {
  const roots = files
    .filter((f) => isSkillMdFile(f.path))
    .map((f) => (f.path === "SKILL.md" ? "" : f.path.slice(0, -"/SKILL.md".length)))
    .sort((a, b) => b.length - a.length); // deepest first
  const groups = new Map<string, SkillFile[]>(roots.map((r) => [r, []]));
  for (const f of files) {
    const owner = roots.find((r) => r === "" || f.path.startsWith(`${r}/`));
    if (owner !== undefined) groups.get(owner)!.push(f);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([root, group]) => ({ root, uses: usesOf(group) }));
}
