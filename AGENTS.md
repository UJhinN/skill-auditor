<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Skill Auditor — agent instructions

**Start by reading [`docs/HANDOFF.md`](docs/HANDOFF.md)** (project state, every file's role, next tasks) and, for scanner work, [`docs/scanner-spec.md`](docs/scanner-spec.md). The owner writes in Thai; user-facing text in the app is Thai, code and comments are English.

Hard rules (details in HANDOFF section 6):

- Never execute, import or eval scanned content, and never open URLs found in it. Only `api.github.com` and `raw.githubusercontent.com` are contacted.
- Changing any scanner rule means bumping `SCANNER_VERSION` in `src/lib/scanner/index.ts`. That also invalidates cached LLM-judge eval results (costly on the free Groq quota) — tell the owner before doing it.
- No new rule without a fixture in `fixtures/eval/`; no threshold change without an `npm run eval` result. Record eval numbers in `README.md`.
- No literal invisible characters (zero-width, bidi, Unicode tags) in source or fixtures — write escape sequences. Run `npm run check:invisible` before committing.
- Database changes only through Drizzle migrations (`npm run db:generate -- --name x`, `npm run db:migrate`). Local and production share one database.
- Never commit `.env*`, never print secrets (`DATABASE_URL`, `GROQ_API_KEY`); check only their shape.
- Reports describe evidence, never accuse authors, and never say a skill is "safe" (best case: "no known issues found").
- Before pushing to `main` (it deploys to production immediately): `npm run lint && npm test && npm run build`.
