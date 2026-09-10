'use strict';

// Replicates Claude Code's built-in read-only classifier. The UI's intercept
// path checks only .claude/settings.json allow rules, so CC's built-in
// read-only commands wrongly surface as permission cards. This module mirrors
// CC's built-in set so those commands auto-approve.

// Tools that CC treats as read-only built-ins in every permission mode.
const CC_READONLY_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch',
]);

// Bash command prefixes that CC treats as read-only built-ins.
// Matched as: command.trim() === prefix || command.startsWith(prefix + ' ')
const CC_READONLY_BASH_PREFIXES = [
  // Bare read-only commands (from the install.js built-ins comment)
  'ls', 'cat', 'echo', 'pwd', 'head', 'tail', 'grep', 'find', 'wc',
  'which', 'diff', 'stat', 'du', 'cd',
  // Read-only git forms (from READONLY_PRESET). Only subcommand forms that
  // cannot mutate refs/config are listed: bare `git branch`/`git tag`/
  // `git remote` also match `-d`, `-D`, `-m`, `-M`, `add`, `remove`,
  // `set-url`, and positional-arg creation, so they must NOT be treated as
  // read-only.
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
  'git remote get-url',
  'git remote show',
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
  // find — -delete and -exec/-execdir/-ok run arbitrary (often destructive)
  // work with no `rm`/`;` present to trip the other markers
  /\s-delete\b/,
  /\s-exec\b/,
  /\s-execdir\b/,
  /\s-ok\b/,
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

function isReadOnlyTool(toolName) {
  if (!toolName) return false;
  return CC_READONLY_TOOLS.has(toolName);
}

// Mask literal quoted spans so the veto scanners don't fire on them (used by
// isCcReadOnlyBash). Single quotes are fully literal to bash — mask through
// the closing quote. Double quotes are masked only when the span contains no
// `$`, backtick, or backslash, since those can still trigger expansion or
// command substitution inside the quotes.
function maskQuotedRegions(cmd) {
  let out = '';
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === "'") {
      const end = cmd.indexOf("'", i + 1);
      const stop = end === -1 ? cmd.length : end + 1;
      out += ' '.repeat(stop - i);
      i = stop - 1;
    } else if (ch === '"') {
      const end = cmd.indexOf('"', i + 1);
      if (end === -1) {
        out += ch;
        continue;
      }
      const span = cmd.slice(i + 1, end);
      if (!/[$`\\]/.test(span)) {
        out += ' '.repeat(end - i + 1);
        i = end;
      } else {
        out += ch;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

function isCcReadOnlyBash(command) {
  if (typeof command !== 'string') return false;
  const cmd = command.trim();
  if (!cmd) return false;

  // Veto scans run over the whole command string, so skip literal spans:
  // `grep 'rm' file` and `echo "a|b"` are read-only and must not be vetoed by
  // word matches inside quoted text. Everything inside single quotes is
  // literal to bash (mask outright). Double quotes only mask when the span
  // can't execute anything — a `$`, backtick, or backslash inside double
  // quotes can still run expansion/command substitution, so those spans stay
  // visible to the veto scanners.
  const masked = maskQuotedRegions(cmd);

  // Reject compound commands outright.
  if (COMPOUND_SEPARATORS.test(masked)) return false;

  // Destructive markers veto.
  for (const re of DESTRUCTIVE_MARKERS) {
    if (re.test(masked)) return false;
  }

  // Prefix match against the read-only list.
  for (const prefix of CC_READONLY_BASH_PREFIXES) {
    if (cmd === prefix) return true;
    if (cmd.startsWith(prefix + ' ')) return true;
  }

  return false;
}

function isCcReadOnlyAutoApprovable(toolName, toolInput) {
  if (!toolName) return false;

  // Always-safe tools
  if (isReadOnlyTool(toolName)) return true;

  if (toolName !== 'Bash') return false;
  if (!toolInput || typeof toolInput.command !== 'string') return false;

  return isCcReadOnlyBash(toolInput.command);
}

module.exports = {
  CC_READONLY_TOOLS,
  CC_READONLY_BASH_PREFIXES,
  isReadOnlyTool,
  isCcReadOnlyBash,
  isCcReadOnlyAutoApprovable,
  maskQuotedRegions,
};
