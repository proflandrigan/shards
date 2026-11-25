'use strict';
// Autonomous-research (AR) scope + git guard (issue #91: bug 1 and the H2 guard). Called from enforce.js for every
// caller of a session that holds an active AR lease (runtime/leases openArLease). Returns {deny: reason} or null.
//
//  1. Git guard (Bash and Codex shell): denies destructive git anywhere in the command line (chains, $(..),
//     `git -C dir`, env/wrapper prefixes): reset --hard, clean -f*, push --force/-f/--force-with-lease/+refspec,
//     push --delete, tag -d/--delete/-f, checkout -b/-B/--orphan, switch (any), branch -D / -d --force,
//     worktree add/remove/move/prune/repair (the runtime owns AR branch worktrees and runs git itself).
//     Worktree paths (.shards/worktrees/<run>/<branch>/..., absolute or relative) are checked like any other
//     path: the lease holds each branch's mutable/immutable entries prefixed with its worktree, and .shards/worktrees/
//     is NOT covered by the .shards/ state allowance.
//     `git checkout` / `git restore` pathspecs must stay inside the AR write scope (restore mutable paths only).
//  2. Scope: a write target must be inside the mutable globs, the `allow` prefixes (the AR project dir) or
//     `.shards/`, and never inside (or above) an immutable path. A write whose target cannot be determined
//     (sh -c, eval, cd && ..., git apply/merge/stash, ...) is denied: overnight runs cannot answer an `ask`.
//  Exec-only calls (python train.py, pytest, the eval command) and Shards notebook execution are not checked.
const path = require('path');
const { bashWrites, writesOf, gitInvocations, gitCall, commandWords } = require('./writes');

// git subcommands whose writes are confined to .git (index, refs, objects) or whose pathspecs this guard checks
// itself; they are left out of the generic write analysis, which would report them as unknown-target writes.
const SCOPED_GIT = new Set(['commit', 'add', 'tag', 'checkout', 'restore', 'reset', 'notes', 'clean', 'worktree']); // clean: -f is denied above; without it git refuses or dry-runs
const EXEC_MCP = /(?:^|__)(notebook_exec|notebook_run_all)$/;
const shortHas = (a, ch) => /^-[A-Za-z]+$/.test(a) && a.slice(1).includes(ch);

// Reason string when a git invocation is destructive, else null.
function destructiveGit({ sub, rest }) {
  const has = (...xs) => rest.some((a) => xs.includes(a));
  switch (sub) {
    case 'reset': return has('--hard') ? 'git reset --hard' : null;
    case 'clean': return rest.some((a) => a === '--force' || shortHas(a, 'f')) ? 'git clean -f' : null;
    case 'push':
      if (rest.some((a) => a === '--force' || a === '--force-if-includes' || a === '--force-with-lease' || a.startsWith('--force-with-lease=') || shortHas(a, 'f'))) return 'git push --force';
      if (rest.some((a) => /^\+[^+]/.test(a))) return 'git push +<refspec> (forced update)';
      if (has('--delete', '--mirror', '--prune') || rest.some((a) => shortHas(a, 'd') || /^:[^:]/.test(a))) return 'git push deleting remote refs';
      return null;
    case 'tag': return rest.some((a) => a === '--delete' || a === '--force' || shortHas(a, 'd') || shortHas(a, 'f')) ? 'git tag -d/-f (deleting or moving a tag)' : null;
    case 'checkout': return rest.some((a) => a === '-b' || a === '-B' || a === '--orphan' || a.startsWith('--orphan=')) ? 'git checkout -b (creating/switching branches)' : null;
    case 'switch': return 'git switch';
    // AR branch worktrees (.shards/worktrees/<run>/<branch>) are created and removed by the runtime only.
    case 'worktree': return rest.some((a) => ['add', 'remove', 'move', 'prune', 'repair'].includes(a)) ? `git worktree ${rest.find((a) => ['add', 'remove', 'move', 'prune', 'repair'].includes(a))} (AR branch worktrees are runtime-owned)` : null;
    case 'branch':
      if (rest.some((a) => shortHas(a, 'D'))) return 'git branch -D';
      if (rest.some((a) => a === '--delete' || shortHas(a, 'd')) && rest.some((a) => a === '--force' || shortHas(a, 'f'))) return 'git branch --delete --force';
      return null;
    default: return null;
  }
}

// Pathspecs of git checkout/restore (everything after `--`; without `--`, every operand, so `git checkout main`
// and `git checkout <sha> file` are treated as paths and must use the `<tree-ish> -- <paths>` form).
function pathspecs({ sub, rest }) {
  const dd = rest.indexOf('--');
  if (dd >= 0) return rest.slice(dd + 1);
  const out = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (sub === 'restore' && (a === '-s' || a === '--source')) { i++; continue; }
    if (a.startsWith('-')) continue;
    out.push(a);
  }
  return out;
}

function arGuard(n, session, lease, leases) {
  const ar = lease.ar || {};
  const tag = `AR run ${ar.run_id} (lease ${lease.id})`;
  const tool = n.toolName || '';
  const cwd = n.cwd || session.root;
  const cmd = tool === 'Bash' ? String((n.toolInput || {}).command || '') : null;

  if (cmd !== null) {
    for (const g of gitInvocations(cmd)) {
      const bad = destructiveGit(g);
      if (bad) return { deny: `shards: ${bad} is blocked while ${tag} is active. AR keeps git history append-only: revert with \`git checkout <sha> -- <mutable paths>\`, never rewrite refs, delete tags or switch branches.` };
      if (g.sub === 'checkout' || g.sub === 'restore') {
        const specs = pathspecs(g);
        if (!specs.length) continue;
        if (g.afterCd) return { deny: `shards: git ${g.sub} after cd/pushd while ${tag} is active: its paths cannot be checked. Run it from the project root with explicit paths.` };
        for (const s of specs) {
          if (/[*?[]/.test(s) || s.startsWith(':')) return { deny: `shards: git ${g.sub} pathspec ${s} cannot be checked against the AR scope while ${tag} is active; name the mutable files explicitly.` };
          const abs = path.resolve(cwd, g.dir || '.', s);
          const r = leases.checkArWrite(session, lease, abs);
          if (!r.allowed) return { deny: `shards: git ${g.sub} ${s} refused: ${r.reason}. Use \`git ${g.sub === 'restore' ? 'restore --source <sha> --' : 'checkout <sha> --'} <mutable paths>\`.` };
        }
      }
    }
  }

  if (EXEC_MCP.test(tool)) return null;
  const w = cmd !== null
    ? bashWrites(cmd, cwd, 0, { skipSeg: (seg) => { const g = gitCall(commandWords(seg)); return !!(g && SCOPED_GIT.has(g.sub)); } })
    : writesOf(n);
  if (!w.write) return null;
  for (const p of w.paths) {
    const r = leases.checkArWrite(session, lease, p);
    if (!r.allowed) return { deny: `shards: write refused: ${r.reason}.` };
  }
  if (w.unknown) return { deny: `shards: a write target could not be determined while ${tag} is active (mutable: ${(ar.mutable || []).join(', ')}). Use explicit file paths (no sh -c/eval/cd chains, no git apply/merge/stash) so the scope can be checked.` };
  return null;
}

module.exports = { arGuard, destructiveGit, pathspecs };
