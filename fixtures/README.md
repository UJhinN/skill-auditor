# Scanner fixtures

Sample skill files for the scanner tests (`src/lib/scanner/scanner.test.ts`).

- `clean/` — an ordinary, harmless skill. The scanner should find nothing serious here.
- `malicious/` — a skill written the way an attacker would. Every URL points at
  `example.com` or a placeholder webhook ID, so nothing here can actually do harm.

Files end in `.fixture` so that nothing (editors, antivirus, GitHub, the Next.js build)
treats them as real scripts. The tests strip the suffix to get the path the scanner sees,
e.g. `malicious/setup.sh.fixture` is scanned as `scripts/setup.sh`.

Invisible-character cases (zero-width, bidi, Unicode tags) are built inside the tests
with `String.fromCodePoint`, because editors tend to mangle them in files.
