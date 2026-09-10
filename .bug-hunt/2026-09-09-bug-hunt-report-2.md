# Bug Hunt Report (pass 3): PR #68 — UI read-only permission classifier (`cc-readonly.js`)

## Summary
- Scope reviewed: third-pass review of the post-fix branch for PR #68 (`fix/ui-permission-classifier`), after the first two passes documented in `.bug-hunt/2026-09-09-bug-hunt-report.md`. Focus: the `find` veto block added by passing commit `9c20b8c` in `src/ui/cc-readonly.js` and its mirror `tools/gate-hook/auto-allowlist.js`.
- Confirmed findings: 2 High (over-approvals in the read-only classifier).
- Overall assessment: The remediation of the original `find` Critical (`-delete`/`-exec`/`-execdir`/`-ok`) is incomplete. GNU find exposes additional action primitives not covered by the four veto markers, and the `-ok` marker itself has a word-boundary bug that lets its prompt-per-file sibling `-okdir` through. Both gaps were verified by executing the classifiers and the actual commands in a sandbox; fixes (markers + regression tests) are committed below.

## Findings

### High — `find` write-to-file actions `-fprintf` / `-fprint` / `-fls` classify as read-only, auto-approving arbitrary file writes
- **Location:** `src/ui/cc-readonly.js:60-67` (find block of `DESTRUCTIVE_MARKERS`); approving path `isCcReadOnlyBash`; reaches both fast paths `src/ui/relay.js:271` and `src/ui/server.js:2301` with `dangerouslyDisableSandbox: true` (`buildBashAllowInput`, `relay.js:253-258`).
- **Class:** Security — file write classified read-only (over-approval in a permission classifier).
- **Confidence:** Confirmed
- **Description:** The find veto block added in this PR covers `-delete`, `-exec`, `-execdir`, and `-ok` — the deletion/execution primitives — but GNU find's `-fprint FILE`, `-fprintf FILE FMT`, and `-fls FILE` write arbitrary output to a file. None contain `rm`/`mv`/`;`/`|`/redirect tokens, so no other marker fires and, because `find` is a CC built-in read-only prefix in `CC_READONLY_BASH_PREFIXES`, the whole command auto-approves. This is the same class as the previously-fixed `git diff --output=FILE` High, but via `find`.
- **Evidence / Reproduction:**
  - Classifier (pre-fix): `isCcReadOnlyBash('find . -fprintf /tmp/out "%p\n"')` → `true`; `isCcReadOnlyBash('find . -name "*.tmp" -fprint /tmp/out')` → `true`; `isCcReadOnlyBash('find . -fls /tmp/out')` → `true`.
  - Sandbox execution (GNU findutils 4.9.0, inside `/tmp/opencode/shards-bughunt2`):
    ```
    $ find . -fprintf o2/out.txt '%p\n'
    $ test -f o2/out.txt && echo "out.txt exists: YES"
    out.txt exists: YES
    ```
    The file was written with exit 0.
  - Post-fix re-check: all three → `false`; stdout-only forms `find . -printf "%p\n"` and `find . -ls` → `true` (still read-only).
- **Impact:** Silent, consent-free, sandbox-free arbitrary (attacker-controllable path) file writes whenever `find` executes — the UI's permission card that previously guarded these calls is bypassed.
- **Remediation:** Add the write-to-file actions to `DESTRUCTIVE_MARKERS` in `src/ui/cc-readonly.js` (and the mirror `tools/gate-hook/auto-allowlist.js`):
  ```js
  /\s-fprint\b/,
  /\s-fprintf\b/,
  /\s-fls\b/,
  ```
  `-printf` / `-ls` (stdout-only) are untouched and verified still read-only.

### High — `find -okdir` bypasses the `-ok` veto via the `\b` word boundary
- **Location:** `src/ui/cc-readonly.js:63` (`/\s-ok\b/`); mirror at `tools/gate-hook/auto-allowlist.js:96`.
- **Class:** Security — regex word-boundary miss; execution-capable find action classified read-only.
- **Confidence:** Confirmed
- **Description:** `/\s-ok\b/` matches the `-ok` action only when followed by a non-word boundary. GNU find's `-okdir` (prompt-before-execute per directory, `-execdir`-style) begins with `-ok` but the next character `d` is a word char, so `\b` fails and the veto never fires. `-ok` was vetoed in this PR precisely because it executes arbitrary commands when confirmed; `-okdir` is the exactly parallel prompt-gated executor (`-execdir` semantics with a per-item confirmation prompt) and is not covered.
- **Evidence / Reproduction:**
  - Classifier (pre-fix): `isCcReadOnlyBash('find . -okdir touch {} +')` → `true`; `isCcReadOnlyBash('find . -okdir chmod 777 file {} +')` → `true`.
  - Sandbox execution (GNU findutils 4.9.0): with an affirmative answer the action runs:
    ```
    $ echo y | find . -name t1 -okdir echo "EXECUTED {}" \;
    < echo ... ./t1 > ? EXECUTED ./t1
    ```
    (With stdin closed/EOL, find treats the answer as "no" and does not execute — so this is prompt-gated, not silent; it is nevertheless a non-read-only construct the classifier must never label read-only, exactly as `-ok` already is.)
  - Post-fix re-check: `-okdir` forms → `false`; quoted name lookups `find . -name '*-okdir*'` → `true` (masking still wins).
- **Impact:** The classifier can auto-approve a construct that executes user-confirmed arbitrary commands against matched files with the OS sandbox disabled. Prompt-gating bounds real-world silent exploitation, but any affirmative response — including a tty the model or a downstream tool is driving — leads to execution under an auto-approve.
- **Remediation:** List both action primitives explicitly (the boundary is intentional, not incidental):
  ```js
  /\s-ok\b/,
  /\s-okdir\b/,
  ```

## Notes & unverified leads
- **`diff -o FILE` (GNU diff) — REFUTED, not a bug here.** `diff` is a CC read-only prefix, and GNU diff accepts `--output=FILE` (vetoed by `--output(?=\s|=)`) but rejects `-o`/`-oFILE` (`diff: invalid option -- 'o'`, exit 2, no file written) on the tested diffutils build. If a future GNU diff adds `-o`, the git-scoped `\s-o` regex would not catch it; no confirmed exposure today.
- **Gate-hook asymmetry (quoted `&`/newline false-vetoes) — pre-existing and documented.** `tools/gate-hook/auto-allowlist.js` lacks `maskQuotedRegions`, so `git log --grep='a&b'` and similar quoted read-only verify commands false-veto after the `&`/`\n` compound-separator extension (commit `9b3c196`). Safe direction (deny, not allow), scope-bounded to auto-verify, and previously acknowledged as a deliberate carve-out in the first-pass report line 118. Not changed here.
- **`find -okdir` also applies to the first-pass report's `-ok` rationale** — the first-pass report correctly vetoed `-ok`; this pass closes the sibling. No other find action gap found after re-sweeping `find`'s action set (`-delete`, `-exec`, `-execdir`, `-ok`, `-okdir`, `-fprint`, `-fprintf`, `-fls`; stdout forms `-print`/`-printf`/`-ls`/`-print0` correctly remain read-only).

## Coverage & limitations
- Verified by direct module execution (`isCcReadOnlyBash`, `isAutoApprovable`) with a 60-case battery, and by executing the actual dangerous constructs inside `/tmp/opencode/shards-bughunt*` sandboxes. No production data touched.
- The full suite (vitest, 326 tests) passes after the fix; all `node -c` syntax checks pass for the four touched runtime files.
- Not re-verified: live Claude Code CLI deny-before-hook precedence (unchanged assumption from prior passes). Mirror `auto-allowlist.js` syntax/behavior verified via its own test file (`test/auto-allowlist.test.js`); note it has no `find` prefix today, so the added markers there are belt-and-braces parity for relay fast-path reuse and future prefix additions.