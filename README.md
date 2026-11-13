# Skill Auditor

See what an AI agent skill on GitHub does before you install it. Enter `owner/repo`, paste a GitHub folder link, or paste the install command from a skill marketplace (e.g. `npx skills add owner/repo --skill name`) to check just that one skill; the site reads the skill's files (read only, nothing is ever run) and lists hidden text, instructions aimed at the AI, and risky script commands, each with its file and line.

**Live:** https://skill-auditor-phi.vercel.app · **Status:** learning project, no longer developed (Nov 2026). The site stays up on free tiers.

## What a report shows

- **What the skill is:** the `description` from each `SKILL.md`, with a one-line Thai summary written by Gemini (the original text is always one tap away)
- **Hidden text:** invisible Unicode tags (decoded), zero-width and bidi characters, hidden HTML/CSS, long encoded blobs
- **Instructions to the AI:** "ignore previous instructions", hide things from the user, skip confirmation
- **Script commands:** download-and-run, encoded execution, touching credentials, sending data out, reverse shells, persistence, wide deletes, disabling protections, sudo
- **What the skill uses:** programs it tells the agent to run, sites its files mention, credential-like and other environment variables, and places outside the project (`~/.ssh`, `/etc`, …), read from the text only and shown as plain facts, so a report is useful even when no rule matched
- **Coverage:** which files were read fully, partly, or skipped. The best result is "nothing matched the rules", never "safe"

## How well it works

Rules only, scanner 0.3.3, measured with `npm run eval` on 75 real skills from 7 popular repos plus hand-written cases:

| Threshold | Caught (cases rules should catch) | Caught (incl. known blind spots) | False alarms on real skills | Precision |
|---|---|---|---|---|
| medium+ | 25/26 | 26/36 | 1/49 | 90% |
| high+ | 20/26 | 20/36 | 0/49 | 95% |

- Adding an LLM judge (free Groq) raised recall incl. blind spots from 70% to 94% on the 60 of 120 cases the free quota allowed.
- A rules-only survey of 1,041 skills from 133 popular repos flagged 9% as high or critical, and the evidence sampled by hand was almost all harmless (e.g. official `curl | sh` installers). So the report describes what a skill does instead of giving a risk score.
- The harmful cases were written by the same person who wrote the rules, so the "caught" numbers are optimistic.

## Run it locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests, no network
npm run eval    # measure against fixtures/eval (fetches real skills on first run)
```

`.env.local` needs `DATABASE_URL` (Neon Postgres). Optional: `GITHUB_TOKEN` (higher GitHub API quota), `GEMINI_API_KEY` (Thai summaries).

**Stack:** Next.js 16, TypeScript, Tailwind, shadcn/ui, Drizzle + Neon Postgres, Vitest, Vercel.

> `fixtures/` contains files that look like malicious skills, for testing. They use only `example.com` / `.invalid` domains and nothing in them runs. Other scanners may flag this repo because of them.
