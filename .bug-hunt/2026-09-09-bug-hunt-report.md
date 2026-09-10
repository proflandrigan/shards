# Bug Hunt Report: PR #68 — UI read-only permission classifier (`cc-readonly.js`)

## Summary
- Scope reviewed: PR #68 (`fix/ui-permission-classifier`) — new `src/ui/cc-readonly.js` classifier, its wiring into `src/ui/relay.js` (PreToolUse fast path) and `src/ui/server.js` (`/pre-tool-use` handler), the 45-case test suite, and the referenced mirror `tools/gate-hook/auto-allowlist.js`. Full surrounding context read (`server.js` fast paths, `permission-pattern.js`, `install.js` BASE_ALLOW/BASE_DENY, live `.claude/settings.json`).
- Confirmed findings: 1 Critical, 2 High, 1 Medium.
- Overall assessment: The PR's intent — stop surfacing permission cards for Claude Code's built-in read-only commands — is sound, but the classifier's "prefix + regex veto" approach is both dangerously over-inclusive and needlessly under-inclusive. It auto-approves destructive commands (`find -delete`, `git branch -D`, `git diff --output=`) with `dangerouslyDisableSandbox: true` and no user consent, while simultaneously vetoing plain read-only invocations (`grep 'rm' file`) — the exact UX defect the PR set out to fix. All four findings were verified with executable repros in a sandbox, and fixes (tests included) are committed.

## Findings

### Critical — `find` prefix auto-approves `find -delete` / `find -exec … +`, silently deleting or writing files
- **Location:** `src/ui/cc-readonly.js:18` (`'find'` in `CC_READONLY_BASH_PREFIXES`); approving path at `isCcReadOnlyBash` (now lines 120-137).
- **Class:** Security — destructive command classified read-only (over-approval in a permission classifier).
- **Confidence:** Confirmed
- **Description:** Any `Bash` call starting with `find ` is auto-approved unless a veto marker trips. `find . -name '*.tmp' -delete` contains no `rm`, `mv`, `cp -`, `;`, `|`, `$(`, backtick, or redirect — so none of the pre-existing `DESTRUCTIVE_MARKERS` fire and the command is flagged read-only. Same for `find . -exec touch {} +` and `find . -exec rm {} +` (the `-exec … +` form needs no `;` terminator, so the compound veto never trips). On both fast paths (relay.js:271 and server.js:2301) this emits a permission `allow` with `dangerouslyDisableSandbox: true` (`buildBashAllowInput`) — an OS-sandbox-free, consent-free execution path for file deletion/creation.
- **Evidence / Reproduction:**
  - Classifier: `isCcReadOnlyBash('find . -name "*.tmp" -delete')` → `true`.
  - Sandbox run: created files, ran the command, `.tmp` files deleted, `keep.txt` survived:
    ```
    $ find . -name '*.tmp' -delete   # inside /tmp sandbox
    before: sub/junk.tmp sub/deeper.tmp keep.txt
    after:  keep.txt
    ```
  - `isCcReadOnlyBash('find . -name a -exec touch {} +')` → `true` (writes files).
- **Impact:** A model (or a contaminated prompt/plan) can delete or create arbitrary files with zero user consent and no sandbox, when the UI previously would have surfaced a permission card. This is a brand-new exposure on both fast paths — `find` is deliberately NOT in `install.js` BASE_ALLOW nor in the gate-hook auto-allowlist, so it previously always went to a card.
- **Remediation:** Veto the destructive `find` primitives in `DESTRUCTIVE_MARKERS` (implemented):
  ```js
  /\s-delete\b/,
  /\s-exec\b/,
  /\s-execdir\b/,
  /\s-ok\b/,
  ```
  Plain reads (`find . -name '*.py'`, `find . -print`) still auto-approve. Applied to `cc-readonly.js` and, symmetrically, `tools/gate-hook/auto-allowlist.js`. Re-verified: `find . -delete` → `false`, `find . -print` → `true`.

### High — `git branch`/`git tag`/`git remote` prefixes auto-approve ref/config mutation
- **Location:** `src/ui/cc-readonly.js:18-44` (bare `git branch`, `git tag`, `git remote` prefixes); also `tools/gate-hook/auto-allowlist.js:46` (`'git branch'`).
- **Class:** Security — state-mutating git commands classified read-only.
- **Confidence:** Confirmed
- **Description:** Bare prefixes match the destructive subforms: `git branch -D feature`, `git branch -m new`, `git branch feature` (creates a branch), `git tag -d v1.0`, `git tag v1.0` (creates a ref), `git remote add origin …`, `git remote remove origin`, `git remote set-url …` all auto-approve. No veto marker covers `-d/-D/-m/-M`, positional-arg creation, or add/remove/set-url.
- **Evidence / Reproduction:** In a sandbox git repo, all six were classifier-`true`, and execution showed real mutation: `git tag -d v1.0` → tag gone; `git branch -D feature` → branch deleted; `git remote add origin https://example.com/repo.git` → remote added; `git tag v1.0` → ref created. The gate-hook allowlist (used unconditionally by the relay fast-path) also returned `true` for `git branch -D feature`.
- **Impact:** Silent, consent-free mutation of repo refs and git config. Note: default `install.js` seeds `Bash(git branch:*)`/`git branch` etc. in BASE_ALLOW, so part of this exposure predates the PR for the *settings* path — but the classifier independently re-authorizes it and is the only gate when settings are pruned, and the relay fast-path inherits it from the gate-hook list regardless.
- **Remediation:** Replace the ambiguous bare prefixes with read-only subcommand forms only (implemented in both modules — shown for `cc-readonly.js`):
  ```js
  'git branch --list', 'git branch -a', 'git branch -r', 'git branch -v',
  'git branch -vv', 'git branch --remotes', 'git branch --merged',
  'git branch --no-merged', 'git branch --show-current', 'git branch --contains',
  'git tag --list', 'git tag -l',
  'git remote -v', 'git remote get-url', 'git remote show',
  ```
  Verified: `git branch -D`, `git tag -d`, `git remote add`, bare-create forms → `false`; `git branch --list`, `git status`, `git remote -v` → `true`.

### High — `git diff`/`git show`/`git log` auto-approve `--output=FILE` / `-o FILE`, writing patch files
- **Location:** `src/ui/cc-readonly.js:26-27` (`git diff`, `git show`, `git log` prefixes); `tools/gate-hook/auto-allowlist.js:44-45`.
- **Class:** Security — file write classified read-only.
- **Confidence:** Confirmed
- **Description:** `git diff --output=/tmp/x`, `git diff -o /tmp/x`, and `git diff -o/tmp/x` all start with a read-only prefix and trip no existing veto, but `--output=<file>`/`-o<file>` is a genuine diff-interface file write.
- **Evidence / Reproduction:** In a sandbox repo, `git diff --output=patch.diff HEAD` was classifier-`true` and the run produced a real `patch.diff` on disk (`patch.diff exists: YES`). The gate-hook allowlist alone also returned `true`.
- **Impact:** Arbitrary (path-controlled) file writes with sandbox disabled.
- **Remediation:** Add output-writing guards to `DESTRUCTIVE_MARKERS` (implemented):
  ```js
  /-output\b/,
  /\bgit\s+(?:diff|show|log)\b[^\n]*\s-o(?=\s|[\/=])/,
  ```
  `-o` is scoped to the git diff-family (so `ls -o`, unmatched elsewhere, is unaffected). Verified: `git diff --output=/tmp/x` / `-o`/`-o<f>` → `false`; `git diff --stat HEAD`, `git show HEAD:file` → `true`.

### Medium — Quoted literal text is falsely vetoed, so the bug the PR claims to fix still occurs for common read-only commands
- **Location:** `src/ui/cc-readonly.js` DESTRUCTIVE_MARKERS + COMPOUND_SEPARATORS scanning the raw string (original implementation).
- **Class:** Under-approval / behavioral inconsistency.
- **Confidence:** Confirmed
- **Description:** Veto scanners are unanchored regexes over the whole command and ignore shell quoting. `grep 'rm' file`, `grep '>' file`, `find . -name 'rm*'`, `echo "a|b"`, `echo "a;b"`, `echo "a > b"` are all plain read-only commands in CC's built-in set (and thus auto-approved by the CLI), but the classifier vetoes them and sends them to a permission card — precisely the card-surfacing the PR exists to eliminate. Result: CLI auto-approves, UI still cards.
- **Evidence / Reproduction:** Pre-fix harness: `isCcReadOnlyBash("grep -rn 'rm' .")` → `false`, `isCcReadOnlyBash('echo "a|b"')` → `false`, while `isCcReadOnlyBash('ls')` → `true`.
- **Impact:** Inconsistent UX (cards for commands CC auto-approves); specialists doing bulk grep/find/echo during verification get card spam — the stated target of the PR — for quoted invocations.
- **Remediation:** Mask literal quoted spans before the veto scans (implemented): single-quoted spans are literal to bash and always masked; double-quoted spans are masked only when free of `$`, backtick, or backslash (which can still execute expansion/substitution inside quotes). e.g. `maskQuotedRegions` in `src/ui/cc-readonly.js`. Safety verified: `echo "$(rm -rf /)"`, `` echo "`rm`" ``, `cat "$f" > /etc/passwd` all still denied.

## Notes & unverified leads
- **Pre-existing (same class) in `tools/gate-hook/auto-allowlist.js`:** The gate-hook list also lacks the quote-masking of `cc-readonly.js`, so its false-veto of quoted read-only lookups (e.g. `dbt show --inline "SELECT 'rm'"`) remains. Lower priority because auto-verify is scope-bounded and the SQL guard already special-cases quoted `;`. Not changed here to keep the diff focused; adding masking there would be a follow-up.
- **`isReadOnlyTool` / CC_READONLY_TOOLS branch is effectively dead in the PreToolUse flow:** the relay's PreToolUse hook matcher is `Bash`-only in `install.js`, so `Read`/`Glob`/`Grep`/`WebSearch` never reach the shards hook; they are already auto-approved by CC itself. Kept as-is (harmless, matches stated intent) — no behavioral change.
- **Pipelines deliberately vetoed:** `pwd | grep home` and `ls | wc -l` are denied by design (compound-separator veto, matching the PR's existing test `vetoes pipes`). Not a bug; noted because a reader might flag `ls | wc -l` as a false negative.

## Coverage & limitations
- Verified behavior by direct module execution (`isCcReadOnlyBash`, `isAutoApprovable`) and by executing the actual dangerous commands inside throwaway `/tmp/opencode/shards-bughunt` sandboxes (file deletion, git ref/config mutation). No production data touched.
- Did not execute the full shards UI server end-to-end; the relay/server paths are thin OR/orderings over the classifier, and both were read in full. The CC-level deny-before-hook precedence model is the repository's own documented assumption (install.js + relay.js comments) and was not empirically re-verified against a live Claude Code binary.
- Not covered: semantic parity of the mirror with the exact current CC built-in list (the evidence above shows the classifier's behavior stands on its own regardless of exact CC parity).