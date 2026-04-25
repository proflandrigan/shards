'use strict';

// "Launcher" commands where the first argument is a subcommand that meaningfully
// narrows the permission's blast radius. Clicking Always Allow on `git status`
// should persist Bash(git status:*) — not Bash(git:*) — so the decision doesn't
// also authorize `git push` or `git reset --hard`.
const LAUNCHER_COMMANDS = new Set([
  'git', 'dbt', 'npm', 'pnpm', 'yarn',
  'pip', 'pip3', 'uv', 'poetry',
  'docker', 'kubectl', 'helm',
  'gh', 'aws', 'gcloud',
  'cargo', 'go', 'mvn', 'gradle',
  'make', 'just',
]);

// Build the Bash permission pattern persisted when the user clicks Always Allow
// (or Always Deny) on a permission card. Returns a glob like Bash(cmd:*) so
// future invocations with different arguments don't re-prompt.
//
// Heuristic:
//   - Single-token commands ("python3 foo.py")     → Bash(python3:*)
//   - Launcher + subcommand ("git status --short") → Bash(git status:*)
//   - Absolute/relative path commands are preserved as-is in the prefix so that
//     Bash(/usr/local/bin/dbt run:*) still disambiguates from a system dbt.
//   - Empty / whitespace-only input falls back to the literal command, matching
//     the pre-fix behavior so we don't silently broaden scope on garbage input.
function permissionPattern(command) {
  if (typeof command !== 'string') return `Bash(${command})`;
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return `Bash(${command})`;

  const head = tokens[0];
  const lastSlash = head.lastIndexOf('/');
  const bareHead = lastSlash >= 0 ? head.slice(lastSlash + 1) : head;

  if (LAUNCHER_COMMANDS.has(bareHead) && tokens.length > 1) {
    return `Bash(${head} ${tokens[1]}:*)`;
  }
  return `Bash(${head}:*)`;
}

module.exports = { permissionPattern, LAUNCHER_COMMANDS };
