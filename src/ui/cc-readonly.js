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
  // Read-only git forms (from READONLY_PRESET)
  'git status',
  'git log',
  'git diff',
  'git show',
  'git branch',
  'git rev-parse',
  'git remote',
  'git tag',
  'git stash list',
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
];

// Compound separator detection — a single allow shouldn't authorize
// `safe-cmd && rm -rf /`. If we see compound separators, bail.
const COMPOUND_SEPARATORS = /(\&\&|\|\||;|\|(?!\|))/;

function isReadOnlyTool(toolName) {
  if (!toolName) return false;
  return CC_READONLY_TOOLS.has(toolName);
}

function isCcReadOnlyBash(command) {
  if (typeof command !== 'string') return false;
  const cmd = command.trim();
  if (!cmd) return false;

  // Reject compound commands outright.
  if (COMPOUND_SEPARATORS.test(cmd)) return false;

  // Destructive markers veto.
  for (const re of DESTRUCTIVE_MARKERS) {
    if (re.test(cmd)) return false;
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
};
