// What to scan, from whatever the user pasted: "owner/repo", "owner/repo/path/to/skill",
// a GitHub link (repo, folder or file), or an install command copied from a skill
// marketplace such as `npx skillfish add owner/repo skill-name` or
// `npx skills add owner/repo --skill name`. Pure, so the browser and the API share it.
//
// Only the owner/repo and a folder hint come out of here. Nothing is fetched from the
// pasted text: the hint is matched against the repo's own file list from GitHub.

export const REPO_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;

const SEGMENT = /^(?!\.\.?$)[A-Za-z0-9._@+-]{1,200}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

export type SkillHint =
  /** a folder path inside the repo */
  | { kind: "path"; value: string }
  /** "<ref>/<path>" from a /tree/ or /blob/ link; the ref may itself contain slashes */
  | { kind: "refpath"; value: string }
  /** a skill's folder name, from an install command */
  | { kind: "name"; value: string };

export interface Target {
  repo: string;
  hint?: SkillHint;
}

function cleanPath(p: string): string | null {
  const segs = p.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segs.length === 0) return "";
  if (!segs.every((s) => SEGMENT.test(s))) return null;
  // a link to SKILL.md (or any file) means its folder; folders are resolved later
  return segs.join("/");
}

function fromUrl(token: string): Target | null {
  const m = token.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)(\/[^\s#?]*)?(?:[#?]\S*)?$/i);
  if (!m) return null;
  const repo = `${m[1]}/${m[2].replace(/\.git$/i, "")}`;
  if (!REPO_PATTERN.test(repo)) return null;
  const rest = (m[3] ?? "").replace(/^\/+/, "");
  const sub = rest.match(/^(?:tree|blob)\/(.+)$/);
  if (!sub) return { repo };
  const value = cleanPath(sub[1]);
  if (value === null) return null;
  // "/tree/main" alone is the whole repo
  return value.includes("/") ? { repo, hint: { kind: "refpath", value } } : { repo };
}

function fromPlain(token: string): Target | null {
  const t = token.replace(/\.git$/i, "").replace(/\/+$/, "");
  // owner/repo@skill (some installers use this form)
  const at = t.match(/^([^/@\s]+\/[^/@\s]+)@([^/@\s]+)$/);
  if (at && REPO_PATTERN.test(at[1]) && NAME.test(at[2])) return { repo: at[1], hint: { kind: "name", value: at[2] } };
  const segs = t.split("/");
  if (segs.length < 2) return null;
  const repo = `${segs[0]}/${segs[1]}`;
  if (!REPO_PATTERN.test(repo)) return null;
  if (segs.length === 2) return { repo };
  const value = cleanPath(segs.slice(2).join("/"));
  if (value === null) return null;
  return value ? { repo, hint: { kind: "path", value } } : { repo };
}

/** Read a scan target from pasted text, or null if no GitHub repo can be found in it. */
export function parseTarget(input: string): Target | null {
  const text = input.trim();
  if (!text || text.length > 2000) return null;
  const tokens = text.split(/\s+/);

  if (tokens.length === 1) return fromUrl(tokens[0]) ?? fromPlain(tokens[0]);

  // A command: the first token that is a GitHub link or owner/repo is the source. npm
  // package names (`skills@latest`, `@scope/pkg`) are not owner/repo, so they are skipped.
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.startsWith("-") || tok.startsWith("@")) continue;
    const found = fromUrl(tok) ?? (tok.includes("/") ? fromPlain(tok) : null);
    if (!found) continue;
    if (found.hint) return found;
    // the skill name: after --skill / -s, else the next plain word after the repo
    const rest = tokens.slice(i + 1);
    const flag = rest.findIndex((t) => t === "--skill" || t === "-s");
    let name: string | undefined;
    if (flag >= 0) name = rest[flag + 1];
    else {
      const eq = rest.find((t) => t.startsWith("--skill="));
      name = eq ? eq.slice("--skill=".length) : rest.find((t) => !t.startsWith("-"));
    }
    return name && NAME.test(name) ? { repo: found.repo, hint: { kind: "name", value: name } } : found;
  }
  return null;
}

/** The text that scans the same thing again: "owner/repo" or "owner/repo/path". */
export function targetText(repo: string, path: string | null | undefined): string {
  return path ? `${repo}/${path}` : repo;
}

// ---------- matching the hint against the repo's file list ----------

const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/**
 * The folder to scan for a hint, given every file path in the repo. Returns the folder of
 * one skill, a folder holding several skills, or null if nothing in the repo matches.
 */
export function resolveSkillDir(paths: string[], hint: SkillHint): string | null {
  const skillDirs = [...new Set(paths.filter((p) => p === "SKILL.md" || p.endsWith("/SKILL.md")).map(dirname))];
  if (skillDirs.length === 0) return null;

  const match = (candidate: string): string | null => {
    const c = candidate.replace(/\/SKILL\.md$/i, "");
    if (c === "") return null; // the whole repo: no folder needed
    if (skillDirs.includes(c)) return c;
    // a file or subfolder inside a skill → that skill
    const owner = skillDirs.filter((d) => d !== "" && c.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0];
    if (owner) return owner;
    // a folder that holds several skills
    if (skillDirs.some((d) => d.startsWith(`${c}/`))) return c;
    return null;
  };

  if (hint.kind === "path") return match(hint.value);
  if (hint.kind === "refpath") {
    // drop leading segments (the branch, tag or commit) until the rest is a path in the repo
    const segs = hint.value.split("/");
    for (let k = 1; k < segs.length; k++) {
      const hit = match(segs.slice(k).join("/"));
      if (hit) return hit;
    }
    return null;
  }
  const want = hint.value.toLowerCase();
  const named = skillDirs
    .filter((d) => d.split("/").pop()!.toLowerCase() === want)
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  return named[0] ?? null;
}
