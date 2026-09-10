# Bug Hunt Report: PR #68 — cc-readonly read-only classifier

## Summary
- Scope reviewed: the four code files and two test files changed by
  proflandrigan/shards
  [PR #68](https://github.com/proflandrigan/shards/pull/68)
  (`fix/ui-permission-classifier`):
  `src/ui/cc-readonly.js`, `src/ui/relay.js`, `src/ui/server.js`,
  `tools/gate-hook/auto-allowlist.js`, `test/cc-readonly.test.js`,
  `test/auto-allowlist.test.js`. Not covered: the two `.bug-hunt/*.md` report
  files in the PR and any behavior of the installer/UI unrelated to the
  classifier.
- Confirmed findings: 3 High (all write-capable commands auto-approved by the
  new read-only classifier).
- Overall assessment: The PR's architecture is sound (deny-first ordering in
  `server.js`, shared classifier between the relay fast path and the UI server,
  quote-masking before veto scans). The remaining defects are three gaps where
  a mutating command still matches a "read-only" classify result: `find
  -fprint0`, `git branch -v <name>` / `git branch -vv <name>` (which **create**
  a branch), and `git diff/show/log -o<attached-word>` output-file writes. All
  three auto-approve and therefore run with `dangerouslyDisableSandbox: true`
  on both the relay and server fast paths. All three were verified against the
  real `git` and `find` binaries and are now fixed with regression tests.

## Findings

### HIGH — `find -fprint0 FILE` writes a file but is auto-approved as read-only
- **Location:** `src/ui/cc-readonly.js:69` and `tools/gate-hook/auto-allowlist.js:103`
- **Class:** Read-only classifier over-approval / missing destructive marker
- **Confidence:** Confirmed
- **Description:** GNU `find`'s `-fprint0 FILE` action writes a
  null-delimited file listing (a path-controlled file write), the same class
  as the already-vetoed `-fprint`/`-fprintf`/`-fls`. The veto regex
  `/\s-fprint\b/` did not match `-fprint0` because the `\b` word boundary
  fails between `t` and `0`. `find . -fprint0 /tmp/out` therefore classified
  as read-only.
- **Evidence / Reproduction:**
  - `find -fprint0` is a real write:
    ```
    $ cd /tmp && echo a > f1.txt && echo b > f2.txt
    $ find . -fprint0 /tmp/out.nul && ls -la /tmp/out.nul
    -rw-r--r-- 1 user user 30 ... /tmp/out.nul   # file created
    ```
  - Classifier result before fix:
    ```
    isCcReadOnlyBash('find . -name "*.tmp" -fprint0 /tmp/out') === true
    isAutoApprovable('Bash', { command: 'find . -name "*.tmp" -fprint0 /tmp/out' }) === true
    ```
  - After fix (covered by new regression tests): both return `false`.
- **Impact:** A write happens with `dangerouslyDisableSandbox: true` on both
  fast paths (relay.js:271 and server.js:2300). Overwrites/creates files with
  the OS sandbox disabled.
- **Remediation:** Match the `0` variant too. `/\s-fprint(?:0)?\b/` matches
  both `-fprint` and `-fprint0`, still never touches `-fprintf` (its `f`
  prevents the boundary). Applied symmetrically in `cc-readonly.js` and
  `auto-allowlist.js`.

### HIGH — `git branch -v <name>` / `git branch -vv <name>` create a branch but are auto-approved as read-only
- **Location:** `src/ui/cc-readonly.js:76` (new marker), prefixes at
  `src/ui/cc-readonly.js:33-34` and `tools/gate-hook/auto-allowlist.js:53-54`
- **Class:** Read-only classifier over-approval / mutation via positional arg
- **Confidence:** Confirmed
- **Description:** The read-only prefix lists include `git branch -v` and
  `git branch -vv`. Those flags are *listing* verbosity flags, but git turns a
  following non-option positional into a **branch create**: `git branch -v
  feature` creates branch `feature`. The other list forms (`-a`, `-r`,
  `--remotes`, `--list`, `--merged`, `--no-merged`, `--contains`) all either
  reject a positional (fatal error, no mutation) or consume the token as a
  filter, so only `-v`/`-vv` are dangerous.
- **Evidence / Reproduction:**
  ```
  $ git init q && cd q && git commit --allow-empty -qm init
  $ git branch -v other ; git branch -vv verbose2
  $ git branch
  * master
    other      # <- created by `git branch -v other`
    verbose2   # <- created by `git branch -vv verbose2`
  ```
  Classifier before fix:
  ```
  isCcReadOnlyBash('git branch -v feature') === true   # approved a create
  isCcReadOnlyBash('git branch -vv feature') === true
  ```
  After fix: `false`; pure listings `git branch -v`, `git branch -vv
  --merged main` stay `true`.
- **Impact:** A repo mutation (branch/ref creation) runs with
  `dangerouslyDisableSandbox: true` and no card, contradicting the PR's stated
  contract that only subcommand forms that "cannot mutate refs/config" are
  listed.
- **Remediation:** Veto the create intent: add marker
  `/\bgit\s+branch\s+-v+\s+[^\s-]/` — a non-option token immediately after
  `-v`/`-vv` is a branch name (listing never takes a positional). Option-only
  follow-ons stay read-only. Applied in both classifiers.

### HIGH — `git diff/show/log -o<attached-word>` writes a patch file but is auto-approved
- **Location:** `src/ui/cc-readonly.js:81` and `tools/gate-hook/auto-allowlist.js:115`
- **Class:** Read-only classifier over-approval / bypassing an output-write veto
- **Confidence:** Confirmed
- **Description:** The `--output=FILE` / `--output FILE` / `-o FILE` / `-o=...`
  / `-o/<path>` write forms are vetoed, but the veto regex
  `/\bgit\s+(?:diff|show|log)\b[^\n]*\s-o(?=\s|[\/=])/` only fires when the
  char after `-o` is whitespace, `/`, or `=`. An attached bare-word value —
  `git diff -oHEAD` (output to a file literally named `HEAD`), `git log
  -oresult.log`, `git show -opatch` — failed the lookahead and classified as
  read-only.
- **Evidence / Reproduction:**
  ```
  isCcReadOnlyBash('git diff -oHEAD') === true
  isCcReadOnlyBash('git log -oresult.log') === true
  isCcReadOnlyBash('git show -opatch') === true
  ```
  The `--output=` form (same semantics) demonstrably writes:
  ```
  $ git diff --output=/tmp/patch1 ; wc -l /tmp/patch1   # 7 lines written
  ```
  After fix: all three above return `false`; the read-only uppercase
  `-O <orderfile>` (diff ordering) and `--output-indicator-*` styling flags
  still classify as read-only.
- **Impact:** Patch-file writes with the OS sandbox disabled. Exact crash
  surface depends on the git version accepting `-o` as the `--output` short
  form, but the classifier's stated intent (block `-o FILE` writes) is
  explicitly not met for the attached form.
- **Remediation:** Require an actual value argument after `-o` instead of a
  restricted character class: `\s-o(?=\s*\S)`. This covers `-o FILE`, `-oFILE`,
  `-o=FILE`, `-o/FILE`; `-o` at end of command (no value, errors benignly in
  git) no longer matches. The uppercase `-O` and `--output-indicator-*` forms
  are untouched.

## Notes & unverified leads
- **`cat x 2>&1` and `find . 2>/dev/null` surface a permission card** (over-veto
  / false negative). The `/>\s*[^|]/` redirect marker treats harmless fd
  duplication and `/dev/null` writes as destructive. This is the safe
  direction and matches Claude Code's own posture (any redirect is not
  auto-approved read-only), so it was deliberately left unfixed; relaxing it
  risks weakening the file-write veto.
- **`find` is absent from the gate-hook `README_ONLY_BASH_PREFIXES`.** The
  gate-hook classifier auto-approves `seek`/`grep`-style reads but not `find`
  reads (pre-existing, unrelated to PR #68). The `-fprint0` marker still
  guards nested/compounded `find` forms.
- **Relay fast path does not consult the shards-ui deny cache.** The relay
  classifier shortcut (relay.js:271) fires before the server round-trip. A
  deny added to `.claude/settings.json` while Claude Code is running that CC
  has not reloaded is bypassed on classified commands. This mirrors the
  pre-existing `isAutoApprovable` fast path and relies on CC evaluating deny
  before the hook, so it was not changed.

## Coverage & limitations
- Verified with the repo's own binaries (`git` 2.x, GNU `find`) in isolated
  `/tmp` sandboxes; no production data touched. Commands were classified
  through the real exported functions in both `cc-readonly.js` and
  `auto-allowlist.js`, plus the full vitest suite before and after the fix
  (`npm test`: 349 passing, +23 regression tests).
- Not exercised end-to-end through a live Claude Code PreToolUse hook; impact
  reasoning relies on relay.js:271-274 and server.js:2296-2304, which attach
  `dangerouslyDisableSandbox: true` to any Bash auto-approval.
- The `-o`-attached form's practical damage is git-version dependent; modern
  git rejects `-oHEAD` as an invalid option, but the classifier contract is
  violated regardless and older git variants accept attached short-option
  values.