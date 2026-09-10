// Hardcoded read-only allowlist for auto-verify mode.
//
// Returns true ONLY for tool calls that are confirmed safe verification
// operations. Everything else falls through to the normal permission prompt.
//
// This list is intentionally NOT user-configurable. Users can extend the
// session-wide allowlist via .claude/settings.json permissions.allow[]
// (which Claude Code already honors before the hook fires). Auto-verify
// is for the *additional* operations agents do during bulk verification
// stretches that would otherwise spam prompts.
'use strict';

const sqlGuard = require('./sql-guard.js');

// Tools that are always read-only.
const READ_ONLY_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch',
]);

// Bash command prefixes that are read-only verification operations.
// Matched as: command.trim() === prefix || command.startsWith(prefix + ' ')
// Use the most specific prefix (e.g. "dbt show" not just "dbt") so that
// destructive subcommands like "dbt run" or "dbt build" are NOT matched.
const READ_ONLY_BASH_PREFIXES = [
  // dbt — read-only subcommands only
  'dbt show',
  'dbt ls',
  'dbt list',
  'dbt parse',
  'dbt compile',
  'dbt deps',
  'dbt debug',
  'dbt source freshness',

  // BigQuery CLI — metadata reads
  'bq show',
  'bq ls',
  'bq head',

  // git — already in the readonly preset, but listed here too as a
  // belt-and-braces guarantee for users who edited their settings.json.
  // Only read-only subcommand forms: bare `git branch`/`git tag`/`git remote`
  // also match -d/-D/-m/-M, add/remove/set-url, and positional-arg creation.
  'git status',
  'git log',
  'git diff',
  'git show',
  'git rev-parse',
  'git stash list',
  'git branch --list',
  'git branch -a',
  'git branch -r',
  'git branch -v',
  'git branch -vv',
  'git branch --remotes',
  'git branch --merged',
  'git branch --no-merged',
  'git branch --show-current',
  'git branch --contains',
  'git tag --list',
  'git tag -l',
  'git remote -v',
  'git remote show',
  'git remote get-url',

  // python/pip metadata
  'pip list',
  'pip show',
  'pip freeze',

  // node/npm metadata
  'npm ls',
  'npm list',
  'npm outdated',
  'npm view',

  // generic file inspection
  'ls', 'cat', 'head', 'tail', 'wc', 'file', 'stat',
];

// Bash patterns that indicate destructive intent. Even if a more permissive
// prefix matches above, these veto the auto-approval. Belt-and-braces.
const DESTRUCTIVE_MARKERS = [
  /\brm\b/, /\bmv\b/, /\bcp\s+-/, // basic destructive
  />\s*[^|]/,                       // shell redirect to file
  />>\s*/,                          // append redirect
  /\bsudo\b/,
  /\bcurl\b/, /\bwget\b/,           // network fetches that may exfiltrate
  /\|\s*sh\b/, /\|\s*bash\b/,       // pipe-to-shell
  /\$\([^)]/,                       // command substitution — bail (could hide anything)
  /`[^`]/,                          // backtick command substitution
  // find — -delete and -exec/-execdir/-ok/-okdir run arbitrary (often
  // destructive) work with no `rm`/`;` present to trip the other markers;
  // -fprint/-fprintf/-fls write output to a file (path-controlled write).
  // `-ok` must not match `-okdir` (its exec-per-file prompt sibling), so both
  // are listed; `-printf`/`-ls` (stdout-only forms) stay read-only.
  /\s-delete\b/,
  /\s-exec\b/,
  /\s-execdir\b/,
  /\s-ok\b/,
  /\s-okdir\b/,
  /\s-fprint\b/,
  /\s-fprintf\b/,
  /\s-fls\b/,
  // git diff/show/log — --output=FILE / --output FILE / -o FILE silently
  // writes a patch file. `--output-indicator-*` (a read-only diff styling
  // flag) must not match.
  /--output(?=\s|=)/,
  /\bgit\s+(?:diff|show|log)\b[^\n]*\s-o(?=\s|[\/=])/,
];

// Compound separator detection — a single allow shouldn't authorize
// `safe-cmd && rm -rf /`. If we see compound separators, bail.
// Covers `&&`, `||`, `;`, `|`, a lone backgrounding `&` (`cat x & rm ...`),
// and a literal newline (a command separator in bash when the model emits a
// multi-line tool call). `&&`/`||` are matched by their own alternatives so
// lone `&`/`|` (e.g. inside `$((..))` arithmetic) can't double-match.
const COMPOUND_SEPARATORS = /(\&\&|\|\||[;&\n]|\|(?!\|))/;

function isAutoApprovable(toolName, toolInput) {
  if (!toolName) return false;

  // Always-safe tools
  if (READ_ONLY_TOOLS.has(toolName)) return true;

  if (toolName !== 'Bash') return false;
  if (!toolInput || typeof toolInput.command !== 'string') return false;

  const cmd = toolInput.command.trim();
  if (!cmd) return false;

  // Reject compound commands outright. A user-facing rule should match each
  // subcommand independently; we don't try to split-and-recheck because that
  // gets risky. Agents doing verification should run one statement at a time.
  if (COMPOUND_SEPARATORS.test(cmd)) {
    // Special case: SQL guard already handles `;`-separated SELECT statements
    // inside a quoted argument. The compound check fires on bare shell `;`.
    // SQL invocations have the `;` *inside* a quoted SQL string, so the bare
    // shell-level check would match. We give SQL guard first crack:
    if (sqlGuard.isReadOnlyCliInvocation(cmd)) return true;
    return false;
  }

  // Destructive markers veto.
  for (const re of DESTRUCTIVE_MARKERS) {
    if (re.test(cmd)) {
      // Same SQL-guard exception: a SELECT may legitimately reference a column
      // called `rm` or contain `>`. But destructive markers in non-SQL Bash
      // commands are hard veto.
      if (sqlGuard.isReadOnlyCliInvocation(cmd)) return true;
      return false;
    }
  }

  // Prefix match against the read-only list.
  for (const prefix of READ_ONLY_BASH_PREFIXES) {
    if (cmd === prefix) return true;
    if (cmd.startsWith(prefix + ' ')) return true;
  }

  // bq query --dry_run is a metadata-only call.
  if (/^bq\s+query\b/.test(cmd) && /--dry_run\b/.test(cmd)) {
    // Dry-run still doesn't write. Allow.
    return true;
  }

  // SELECT-only warehouse-CLI SQL.
  if (sqlGuard.isReadOnlyCliInvocation(cmd)) return true;

  return false;
}

module.exports = { isAutoApprovable, READ_ONLY_BASH_PREFIXES, READ_ONLY_TOOLS };
