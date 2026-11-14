import { describe, expect, it } from "vitest";
import { inventory, looksLikeSecretName, MAX_ITEMS, usesOf } from "./inventory";

const md = (text: string, path = "SKILL.md") => usesOf([{ path, content: text }]);
const fence = (lang: string, body: string) => `\n\`\`\`${lang}\n${body}\n\`\`\`\n`;
const programsIn = (lang: string, body: string) => md(fence(lang, body)).programs;

describe("programs: fenced blocks", () => {
  it.each(["bash", "sh", "shell", "zsh", "console", "terminal", "powershell", "ps1"])(
    "reads blocks labelled %s",
    (lang) => {
      expect(programsIn(lang, "$ docker ps")).toEqual(["docker"]);
    },
  );

  it("does not read an unlabelled fence, where prose used to show up as programs", () => {
    const prose = ["we will focus on the plan", "no more debug", "and add keys", "to the store"].join("\n");
    expect(programsIn("", prose)).toEqual([]);
    expect(programsIn("text", "docker ps")).toEqual([]);
    expect(programsIn("python", "import os")).toEqual([]);
    expect(programsIn("json", '{"a": 1}')).toEqual([]);
  });

  it("strips a leading $ or > prompt", () => {
    expect(programsIn("bash", "$ git status\n> npm test")).toEqual(["git", "npm"]);
  });

  it("splits on && || | ; and $( and takes the first word of each part", () => {
    expect(programsIn("bash", "make build && docker push x || kubectl apply -f y | jq . ; ffmpeg -i a b")).toEqual(
      ["docker", "ffmpeg", "jq", "kubectl", "make"],
    );
    expect(programsIn("bash", 'x=$(terraform output -raw url)')).toEqual(["terraform"]);
    expect(programsIn("bash", "echo $(gh api user) done")).toEqual(["gh"]);
  });

  it("skips VAR=value assignments and sudo / nohup / env / time / exec", () => {
    expect(programsIn("bash", "FOO=1 BAR=2 pnpm install")).toEqual(["pnpm"]);
    expect(programsIn("bash", "sudo apt-get install jq")).toEqual(["apt-get"]);
    expect(programsIn("bash", "sudo -E env NODE_ENV=prod nohup time exec node server.js")).toEqual(["node"]);
  });

  it("looks into if / then / do branches", () => {
    expect(programsIn("bash", "if command -v gh >/dev/null; then gh auth status; fi")).toEqual(["gh"]);
  });

  it("drops shell builtins and basic utilities", () => {
    const body = "cd app\necho hi\nexport A=1\ncat x\nls -la\nmkdir -p d\nrm -rf d\ngrep a b\nsed s/a/b/ f\nsleep 1\ntest -f x\nexit 1";
    expect(programsIn("bash", body)).toEqual([]);
  });

  it("drops words that are not program names", () => {
    const body = ["e.g. foo", "etc. and so on", "Run the tests", "./build.sh", "a b", "UPPER x", "foo, bar", "package.json", "x"].join("\n");
    expect(programsIn("bash", body)).toEqual([]);
  });

  it("ignores comments, heredoc bodies, continuation lines and multi-line strings", () => {
    const body = [
      "# docker compose up",
      "cat <<'EOF' > notes.txt",
      "terraform apply",
      "EOF",
      "curl -s https://x.dev \\",
      "  --header 'a' \\",
      "  helm",
      'git commit -m "first line',
      "kubectl in the message",
      'end"',
      "make",
    ].join("\n");
    expect(programsIn("bash", body)).toEqual(["curl", "git", "make"]);
  });

  it("does not split on separators inside quotes", () => {
    expect(programsIn("bash", 'echo "a && docker run b"; echo \'x | helm\'')).toEqual([]);
  });

  it("ignores functions the script defines itself", () => {
    const body = "log_info() { echo hi; }\nfunction check { :; }\nlog_info start\ncheck\nnmap x";
    expect(programsIn("bash", body)).toEqual(["nmap"]);
  });

  it("in a console block, only prompt lines are commands when there are any", () => {
    expect(programsIn("console", "$ npm run build\nBuilt in 3s\nwarning something")).toEqual(["npm"]);
    expect(programsIn("console", "npm run build")).toEqual(["npm"]);
  });

  it("handles ~~~ fences, indented fences and info strings", () => {
    expect(md("~~~bash\ngit log\n~~~").programs).toEqual(["git"]);
    expect(md("1. Run:\n\n   ```bash title=x\n   npm i\n   ```").programs).toEqual(["npm"]);
    expect(md("```BASH\ngit log\n```").programs).toEqual(["git"]);
  });

  it("reads PowerShell case-insensitively", () => {
    expect(programsIn("powershell", "Invoke-WebRequest https://a.dev\nWrite-Host hi\nGet-Content x")).toEqual([
      "get-content",
      "invoke-webrequest",
    ]);
  });

  it("counts by mentions, most mentioned first", () => {
    expect(programsIn("bash", "npm i\ngit pull\nnpm test\nnpm run b\ngit push\ndocker ps")).toEqual(["npm", "git", "docker"]);
  });
});

describe("programs: whole script files and inline code", () => {
  it("reads .sh .bash .zsh .ps1 files, skipping the shebang and comments", () => {
    for (const path of ["a.sh", "b.bash", "c.zsh"]) {
      expect(usesOf([{ path, content: "#!/usr/bin/env bash\n# gh auth login\nset -e\nrsync -a x y\n" }]).programs).toEqual(["rsync"]);
    }
    expect(usesOf([{ path: "d.ps1", content: "Set-Location x\nInvoke-RestMethod https://a.dev" }]).programs).toEqual([
      "invoke-restmethod",
    ]);
  });

  it("does not read other kinds of script as shell", () => {
    expect(usesOf([{ path: "a.py", content: "import os\nos.system('docker ps')\n" }]).programs).toEqual([]);
    expect(usesOf([{ path: "a.js", content: "git status\n" }]).programs).toEqual([]);
  });

  it("reads inline code in SKILL.md that looks like a command", () => {
    const text = "Run `npm run build`, then `foo --bar` and `docker`. Use `git` for history.";
    expect(md(text).programs.sort()).toEqual(["docker", "foo", "git", "npm"]);
  });

  it("does not take file names, identifiers or prose in code spans as programs", () => {
    const text =
      "Edit `config.json` and `src/app.ts`, call `fs.readFile(x)`, set `name: foo`, see `e.g.`, use `my variable`, `a b`, `--flag`, `node_modules/`.";
    expect(md(text).programs).toEqual([]);
  });

  it("reads inline code only in SKILL.md, not in other markdown", () => {
    expect(md("Run `npm run build`.", "docs/guide.md").programs).toEqual([]);
    expect(md("Run `npm run build`.", "sub/SKILL.md").programs).toEqual(["npm"]);
  });

  it("does not read inline code inside a fenced block twice or as prose", () => {
    expect(md(fence("python", "x = `not a command` ")).programs).toEqual([]);
  });
});

describe("sites", () => {
  it("lists hostnames, lowercased, without www., most mentioned first", () => {
    const text = "See https://www.GitHub.com/a/b, http://docs.Example-Corp.io/x and https://github.com/c.";
    expect(md(text).sites).toEqual(["github.com", "docs.example-corp.io"]);
  });

  it("drops ports, user info, trailing punctuation and markdown closers", () => {
    const text = "[a](https://api.foo.dev:8443/x). <https://user:pw@bar.dev/y>, \"https://baz.dev\"; (https://qux.dev).";
    expect(md(text).sites.sort()).toEqual(["api.foo.dev", "bar.dev", "baz.dev", "qux.dev"]);
  });

  it.each([
    "https://example.com/x", "https://sub.example.org", "http://example.net",
    "http://localhost:3000", "https://api.localhost", "https://foo.invalid", "https://a.test/b",
    "https://my.example", "http://127.0.0.1:8080", "http://10.0.0.5/x", "https://${HOST}/x",
    "https://<your-host>/x", "https://a_b.dev", "https://nodot", "https://x.c",
  ])("leaves out placeholders and non-hostnames: %s", (url) => {
    expect(md(`Call ${url} now.`).sites).toEqual([]);
  });

  it("looks in every kind of file", () => {
    const got = usesOf([
      { path: "SKILL.md", content: "https://a.dev" },
      { path: "scripts/x.py", content: "requests.get('https://b.dev/api')" },
      { path: "refs/notes.txt", content: "https://c.dev" },
    ]);
    expect(got.sites.sort()).toEqual(["a.dev", "b.dev", "c.dev"]);
  });

  it("skips licence links, licence files, schema files and XML namespaces", () => {
    const got = usesOf([
      { path: "SKILL.md", content: "Licensed under http://www.apache.org/licenses/LICENSE-2.0 and https://opensource.org/license/mit" },
      { path: "LICENSE.txt", content: "see https://www.gnu.org/philosophy/x" },
      { path: "schemas/a.xsd", content: 'xmlns="http://schemas.openxmlformats.org/x"' },
      { path: "icon.svg.md", content: '<svg xmlns="http://www.w3.org/2000/svg">' },
      { path: "refs/spec.md", content: "read https://www.w3.org/TR/wcag22/" },
    ]);
    expect(got.sites).toEqual(["w3.org"]);
  });

  it("is plain text only: the values are bare hostnames", () => {
    for (const site of md('<a href="https://evil.dev/x">x</a> javascript:alert(1) https://ok.dev').sites) {
      expect(site).toMatch(/^[a-z0-9.-]+$/);
    }
  });
});

describe("secrets and environment variables", () => {
  it.each([
    ["shell $NAME", "curl -H \"Authorization: $API_TOKEN\" x"],
    ["shell ${NAME}", "echo ${API_TOKEN}"],
    ["shell ${NAME:-default}", "echo ${API_TOKEN:-none}"],
    ["process.env.NAME", "const t = process.env.API_TOKEN;"],
    ['process.env["NAME"]', 'const t = process.env["API_TOKEN"];'],
    ['os.environ["NAME"]', 'import os\nt = os.environ["API_TOKEN"]'],
    ['os.environ.get("NAME")', 'os.environ.get("API_TOKEN", "")'],
    ['os.getenv("NAME")', "os.getenv('API_TOKEN')"],
    ["export NAME=", "export API_TOKEN=abc"],
    ["PowerShell $env:NAME", "$env:api_token = 'x'"],
    ["Deno.env.get", 'Deno.env.get("API_TOKEN")'],
    ["bare name in prose", "Ask the user to provide API_TOKEN first."],
  ])("finds a secret written as %s", (_name, text) => {
    expect(md(text).secrets).toEqual(["API_TOKEN"]);
  });

  it("catches VERCEL_TOKEN written as a bare name (vercel-cli-with-tokens)", () => {
    const text = "---\nname: vercel-cli-with-tokens\n---\nThe user must set VERCEL_TOKEN before you run `vercel deploy`.";
    const got = md(text);
    expect(got.secrets).toEqual(["VERCEL_TOKEN"]);
    expect(got.instructionsOnly).toBe(false);
  });

  it("catches bare names ending in _TOKEN _KEY _SECRET _PASSWORD _API_KEY", () => {
    const text = "GH_TOKEN, STRIPE_SECRET, DB_PASSWORD, OPENAI_API_KEY and AWS_SECRET_ACCESS_KEY.";
    expect(md(text).secrets.sort()).toEqual(["AWS_SECRET_ACCESS_KEY", "DB_PASSWORD", "GH_TOKEN", "OPENAI_API_KEY", "STRIPE_SECRET"]);
  });

  it("treats a name as a secret when a part contains KEY TOKEN SECRET PASSWORD PASSWD CREDENTIAL or AUTH", () => {
    for (const n of ["API_KEY", "GITHUB_TOKEN", "CLIENT_SECRET", "DB_PASSWORD", "MYSQL_PASSWD", "AWS_CREDENTIALS", "NODE_AUTH_TOKEN", "OAUTH", "APIKEY", "KEY"]) {
      expect(looksLikeSecretName(n), n).toBe(true);
    }
    for (const n of ["PORT", "VERSION", "AUTHOR", "AUTHORS_FILE", "KEYBOARD", "DATABASE_URL", "TOKENIZER_NAME"]) {
      expect(looksLikeSecretName(n), n).toBe(false);
    }
  });

  it("files other variables under envVars, not secrets", () => {
    const got = md("Set $DATABASE_URL and ${PORT}, then export REGION=eu and read process.env.LOG_LEVEL.");
    expect(got.envVars.sort()).toEqual(["DATABASE_URL", "LOG_LEVEL", "PORT", "REGION"]);
    expect(got.secrets).toEqual([]);
  });

  it("leaves out HOME PATH PWD USER SHELL TMPDIR TERM LANG ARGUMENTS", () => {
    const got = md("$HOME $PATH $PWD $USER $SHELL $TMPDIR $TERM $LANG $ARGUMENTS ${HOME}/x");
    expect(got.envVars).toEqual([]);
  });

  it("ignores database and keyboard words that end in _KEY", () => {
    expect(md("PRIMARY_KEY FOREIGN_KEY SORT_KEY SHIFT_KEY ENTER_KEY").secrets).toEqual([]);
  });

  it("does not take JavaScript templates, lowercase words or numbers as variables", () => {
    const got = md("`${JSON.stringify(x)}` $1 $x ${name} price $5 and $A");
    expect(got.envVars).toEqual([]);
  });

  it("does not list a variable the script sets for itself, but keeps credential-like names", () => {
    const script = ["RED='\\033[0;31m'", "OUT=$(mktemp)", "ITEMS=(a b)", "local TOTAL=0", 'echo "$RED $OUT ${ITEMS[@]} $TOTAL"', "TOKEN=abc", 'echo "$TOKEN"', "PORT=3000 node app.js", 'echo "$PORT"'].join("\n");
    const got = usesOf([{ path: "run.sh", content: script }]);
    expect(got.envVars).toEqual(["PORT"]);
    expect(got.secrets).toEqual(["TOKEN"]);
  });

  it("counts mentions across files and sorts most mentioned first", () => {
    const got = usesOf([
      { path: "SKILL.md", content: "$B_VAR $A_VAR $B_VAR" },
      { path: "x.sh", content: "echo $B_VAR $C_VAR" },
    ]);
    expect(got.envVars).toEqual(["B_VAR", "A_VAR", "C_VAR"]);
  });
});

describe("paths outside the project", () => {
  it.each([
    ["~/.codex/config.toml", "~/.codex"],
    ["$HOME/.aws/credentials", "$HOME/.aws"],
    ["${HOME}/.config/gcloud/x", "$HOME/.config"],
    ["$env:USERPROFILE\\.ssh\\id_rsa", "$env:USERPROFILE/.ssh"],
    ["%USERPROFILE%\\.kube\\config", "%USERPROFILE%/.kube"],
    ["%APPDATA%", "%APPDATA%"],
    ["%APPDATA%\\Code\\User", "%APPDATA%/Code"],
    ["/etc/nginx/nginx.conf", "/etc/nginx"],
    ["/etc/hosts", "/etc/hosts"],
    ["/usr/local/bin/tool", "/usr/local"],
    ["/opt/app/bin", "/opt/app"],
    ["~/.ssh", "~/.ssh"],
  ])("keeps the first two segments of %s", (text, expected) => {
    expect(md(`Look at ${text} please`).paths).toEqual([expected]);
  });

  it("does not take project-relative paths, URLs or look-alikes", () => {
    const text = "src/etc/foo, ./etc/x, https://a.dev/etc/passwd, node_modules/.bin, /var1/x, /etcetera, a/opt/b, ~user/x, ~/ alone, $HOME alone";
    expect(md(text).paths).toEqual([]);
  });

  it("does not report /usr/bin/env from a shebang", () => {
    expect(usesOf([{ path: "a.sh", content: "#!/usr/bin/env bash\necho hi\n" }]).paths).toEqual([]);
  });

  it("strips trailing punctuation from a segment", () => {
    expect(md("Check ~/.ssh. Then ~/.aws, and ~/.kube/.").paths.sort()).toEqual(["~/.aws", "~/.kube", "~/.ssh"]);
  });
});

describe("instructions only", () => {
  it("is true for plain advice to the AI", () => {
    const got = md("---\nname: interview\ndescription: Ask good questions.\n---\n# Interview\n\nAsk one question at a time. Be kind.\n");
    expect(got).toEqual({ programs: [], sites: [], secrets: [], envVars: [], paths: [], instructionsOnly: true });
  });

  it("is false as soon as any group has something", () => {
    for (const text of ["`git status`", "https://a.dev", "set API_KEY", "$FOO_BAR", "~/.codex"]) {
      expect(md(text).instructionsOnly, text).toBe(false);
    }
  });
});

describe("caps and plain text", () => {
  it(`caps every list at ${MAX_ITEMS} entries`, () => {
    const many = Array.from({ length: 80 }, (_, i) => i);
    const text = [
      fence("bash", many.map((i) => `tool${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))} run`).join("\n")),
      many.map((i) => `https://h${i}.dev/x`).join(" "),
      many.map((i) => `SVC${i}_TOKEN`).join(" "),
      many.map((i) => `$VAR_${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`).join(" "),
      many.map((i) => `~/.dir${i}/x`).join(" "),
    ].join("\n");
    const got = md(text);
    for (const list of [got.programs, got.sites, got.secrets, got.envVars, got.paths]) {
      expect(list).toHaveLength(MAX_ITEMS);
    }
  });

  it("keeps values short and free of control or invisible characters", () => {
    const evil = `${"a".repeat(300)}.dev`;
    const text = `https://${evil}/x https://ok.dev/\u200B ${"X".repeat(200)}_TOKEN ~/${"d".repeat(300)}/x`;
    const got = md(text);
    for (const v of [...got.sites, ...got.secrets, ...got.paths, ...got.programs, ...got.envVars]) {
      expect(v.length).toBeLessThanOrEqual(100);
      expect(v).toMatch(/^[\x21-\x7e]+$/);
    }
    expect(got.sites).toEqual(["ok.dev"]);
  });

  it("copes with NUL bytes, empty files and very long lines", () => {
    expect(usesOf([{ path: "SKILL.md", content: "" }]).instructionsOnly).toBe(true);
    const nul = md("`git\u0000 status` https://a\u0000.dev");
    expect(nul.programs).toEqual(["git"]); // the NUL is dropped, not a reason to lose the rest
    expect(nul.sites).toEqual(["a.dev"]);
    const line = "word ".repeat(200_000) + "`npm test` https://late.dev VERCEL_TOKEN";
    const got = md(line);
    expect(got.programs).toEqual(["npm"]);
    expect(got.sites).toEqual(["late.dev"]);
    expect(got.secrets).toEqual(["VERCEL_TOKEN"]);
  });
});

describe("inventory() per skill", () => {
  it("returns one entry per SKILL.md, root first, then by path", () => {
    const got = inventory([
      { path: "b/SKILL.md", content: "" },
      { path: "SKILL.md", content: "" },
      { path: "a/SKILL.md", content: "" },
    ]);
    expect(got.map((g) => g.root)).toEqual(["", "a", "b"]);
  });

  it("counts a file for the deepest skill above it only", () => {
    const got = inventory([
      { path: "SKILL.md", content: "Use `git status`." },
      { path: "scripts/a.sh", content: "curl https://outer.dev" },
      { path: "inner/SKILL.md", content: "Needs INNER_TOKEN." },
      { path: "inner/run.sh", content: "docker ps\nhttps://inner.dev" },
      { path: "inner/deeper/SKILL.md", content: "Use `kubectl get pods`." },
      { path: "inner/deeper/x.sh", content: "helm ls" },
    ]);
    const byRoot = Object.fromEntries(got.map((g) => [g.root, g.uses]));
    expect(byRoot[""].programs.sort()).toEqual(["curl", "git"]);
    expect(byRoot[""].sites).toEqual(["outer.dev"]);
    expect(byRoot["inner"].programs).toEqual(["docker"]);
    expect(byRoot["inner"].secrets).toEqual(["INNER_TOKEN"]);
    expect(byRoot["inner"].sites).toEqual(["inner.dev"]);
    expect(byRoot["inner/deeper"].programs.sort()).toEqual(["helm", "kubectl"]);
  });

  it("does not let a sibling folder with a similar name leak in", () => {
    const got = inventory([
      { path: "skills/a/SKILL.md", content: "" },
      { path: "skills/a-extra/notes.md", content: "https://leak.dev" },
    ]);
    expect(got).toHaveLength(1);
    expect(got[0].uses.sites).toEqual([]);
  });

  it("leaves out files that belong to no skill", () => {
    const got = inventory([
      { path: "README.md", content: "https://readme.dev" },
      { path: "s/SKILL.md", content: "" },
    ]);
    expect(got).toHaveLength(1);
    expect(got[0].uses.instructionsOnly).toBe(true);
  });

  it("returns nothing when there is no SKILL.md", () => {
    expect(inventory([{ path: "a.sh", content: "git pull" }])).toEqual([]);
  });
});
