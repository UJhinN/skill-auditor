# Scanner fixtures

> **Heads-up for other scanners and reviewers:** this folder intentionally contains text that
> looks like malicious AI agent skills (hidden Unicode, `curl | bash`, credential theft, reverse
> shells). It exists to test Skill Auditor. Every URL points at `example.com`, a `.invalid` host
> or a documentation IP (203.0.113.0/24); keys are AWS's published example keys; nothing here is
> runnable malware.

## `clean/` and `malicious/`

Two small skills used by the unit tests (`src/lib/scanner/scanner.test.ts`). Files end in
`.fixture` so editors, antivirus, GitHub and the Next.js build don't treat them as real scripts;
the tests strip the suffix to get the path the scanner sees.

## `eval/` — used by `npm run eval`

| File | What it holds | Pass condition |
|---|---|---|
| `benign.json` | Real public skills, pinned to a commit, fetched at eval time (not copied here) | `general`: not flagged · `security`: reported separately |
| `risky.json` | Hand-written harmful skills, at least one per rule | expected rules found, risk ≥ `minRisk` |
| `adversarial.json` | Skills that attack the scanner (fake tags, long lines, padding) | as above |
| `tricky.json` | Harmless skills that look a bit like attacks | risk ≤ `maxRisk` |
| `gaps.json` | Known blind spots, each naming the spec rule (or LLM) that would catch it | tracked, not required to pass |

Each case lists its files as arrays of lines. `{"repeat": s, "times": n}` expands to `s` repeated
`n` times (used for padding). Invisible characters are written as JSON `\u` escapes so they stay
visible in review. `"fetch": true` applies the same size limits as the GitHub fetcher.

Rule of thumb: no new rule without a fixture here, and no threshold change without an eval run.
