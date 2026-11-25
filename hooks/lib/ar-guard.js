'use strict';
// Autonomous-research (AR) scope + git guard (issue #91: bug 1 and the H2 guard). Called from enforce.js for every
// caller of a session that holds an active AR lease (runtime/leases openArLease). Returns {deny: reason} or null.
//
//  1. Git guard (Bash and Codex shell): denies destructive git anywhere in the command line (chains, $(..),
//     `git -C dir`, env/wrapper prefixes; long options also by unambiguous prefix): reset --hard and any ref-moving
//     reset, clean -f*, push --force/-f/--force-with-lease/+refspec, push --delete, fetch <src>:<dst>, tag -d/-f,
//     checkout -b/-B/--orphan/--detach, switch (any), any mutating git branch, commit --amend, update-ref,
//     symbolic-ref <ref> <target>, filter-branch/filter-repo/replace, reflog expire/delete, gc --prune, prune,
//     worktree add/remove/move/prune/repair (the runtime owns AR branch worktrees and runs git itself),
//     checkout <ref> -- (switch/detach), checkout/restore --pathspec-from-file/--patch, git config writes and
//     `-c alias.*`/hook/command-running config. Best effort: `$var` git, busybox git and pre-existing aliases are not seen.
//     Worktree paths (.shards/worktrees/<run>/<branch>/..., absolute or relative) are checked like any other
//     path: the lease holds each branch's mutable/immutable entries prefixed with its worktree, and .shards/worktrees/
//     is NOT covered by the .shards/ state allowance.
//     `git checkout` / `git restore` pathspecs must stay inside the AR write scope (restore mutable paths only).
//  2. Scope: a write target must be inside the mutable globs, the `allow` prefixes (the AR project dir) or
//     `.shards/`, and never inside (or above) an immutable path. A write whose target cannot be determined
//     (sh -c, eval, cd && ..., git apply/merge/stash, ...) is denied: overnight runs cannot answer an `ask`.
//  3. Third-party MCP write tools: their path arguments are checked like Write/Edit.
//  4. Reads of the sealed holdout state (.shards/state/research-sealed) are denied until ar_end.
//  Exec-only calls (python train.py, pytest, the eval command) and Shards notebook execution are not checked, so
//  the guard stops mistakes, not a determined agent: code in the mutable scope can still write anywhere.
const path = require('path');
const { bashWrites, writesOf, gitInvocations, gitCall, commandWords } = require('./writes');

// git subcommands whose writes are confined to .git (index, refs, objects) or whose pathspecs this guard checks
// itself; they are left out of the generic write analysis, which would report them as unknown-target writes.
const SCOPED_GIT = new Set(['commit', 'add', 'tag', 'checkout', 'restore', 'reset', 'notes', 'clean', 'worktree']); // clean: -f is denied above; without it git refuses or dry-runs
const EXEC_MCP = /(?:^|__)(notebook_exec|notebook_run_all)$/;
const MCP_WRITE = /write|edit|replace|insert|delete|remove|rename|move|create|append|patch|save|update/i;
const MCP_PATH_KEYS = ['file_path', 'path', 'relative_path', 'paths', 'filename', 'destination', 'source', 'notebook_path'];
const shortHas = (a, ch) => /^-[A-Za-z]+$/.test(a) && a.slice(1).includes(ch);
// git accepts any unambiguous prefix of a long option (`--ha` = `--hard`), so a destructive long option is matched
// by prefix (at least one letter after `--`); `=value` is ignored. Ambiguous prefixes git itself rejects are denied too.
const longIs = (a, ...names) => {
  if (!/^--[A-Za-z]/.test(a)) return false;
  const k = a.split('=')[0];
  return names.some((n) => n.startsWith(k));
};
const operands = (rest) => rest.filter((a) => !a.startsWith('-'));
const REV = /^(?:[0-9a-f]{7,40}|(?:HEAD|@|ORIG_HEAD|FETCH_HEAD)(?:[~^]\d*)+|.*(?:[~^]\d*|@\{[^}]*\})$)/;
// git branch: read-only forms only (list, filters, show-current); creating, moving, copying, forcing, deleting
// or re-tracking a branch is denied.
// `-d` / `--delete` without force is left alone: git refuses to delete an unmerged branch.
const BRANCH_MUTATE_LONG = ['--move', '--copy', '--force', '--set-upstream-to', '--unset-upstream', '--edit-description',
  '--track', '--no-track', '--create-reflog', '--recurse-submodules'];
const BRANCH_LIST_LONG = ['--list', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--show-current'];
function branchMutates(rest) {
  let list = false; const ops = [];
  if (rest.some((a) => longIs(a, '--delete') || shortHas(a, 'd'))) list = true; // operands are branches to delete
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--') { ops.push(...rest.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      if (BRANCH_MUTATE_LONG.some((n) => longIs(a, n))) return true;
      if (BRANCH_LIST_LONG.some((n) => longIs(a, n) && a.split('=')[0].length >= 4)) list = true;
      if (!a.includes('=') && (longIs(a, '--sort') || longIs(a, '--format'))) i++;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      if (/[DmMcCfut]/.test(a.slice(1))) return true;
      if (a.slice(1).includes('l')) list = true;
      continue;
    }
    ops.push(a);
  }
  return ops.length > 0 && !list; // `git branch foo [start]` creates a branch
}
// git reset may only unstage: no mode flag, and no commit operand (paths go after `--`, or `HEAD` alone).
function resetMoves(rest) {
  if (rest.some((a) => longIs(a, '--hard', '--soft', '--keep', '--merge'))) return true; // --mixed alone just unstages
  const dd = rest.indexOf('--');
  const before = operands(dd >= 0 ? rest.slice(0, dd) : rest);
  if (dd >= 0) return before.some((o) => o !== 'HEAD');
  return before.length > 1 || (before.length === 1 && before[0] !== 'HEAD');
}

// git config: read-only forms (--get*, --list, -l, a lone key, `get`/`list` subcommands) are allowed; anything else writes.
function configWrites(rest) {
  if (rest.some((a) => longIs(a, '--unset', '--unset-all', '--add', '--replace-all', '--rename-section', '--remove-section', '--edit') || shortHas(a, 'e'))) return true;
  if (rest.some((a) => longIs(a, '--get', '--get-all', '--get-regexp', '--get-urlmatch', '--get-color', '--get-colorbool', '--list', '--show-origin', '--show-scope') && a.length >= 5) || rest.some((a) => shortHas(a, 'l'))) return false;
  const ops = operands(rest);
  if (ops[0] === 'get' || ops[0] === 'list') return false;
  if (['set', 'unset', 'rename-section', 'remove-section', 'edit'].includes(ops[0])) return true;
  return ops.length !== 1;
}
// `git -c alias.x=... x` / `-c core.hooksPath=...` run arbitrary commands under a harmless-looking subcommand.
const RISKY_CONFIG = /^(alias\.|core\.(hookspath|sshcommand|fsmonitor|editor|pager|gitproxy)|include|sequence\.editor|diff\.external|(diff|merge|filter)\.[^=]*\.(command|driver|clean|smudge|process|textconv))/i;

// Reason string when a git invocation is destructive, else null.
function destructiveGit({ sub, rest, configs }) {
  const risky = (configs || []).find((c) => RISKY_CONFIG.test(c));
  if (risky) return `git -c ${risky.split('=')[0]} (config that runs commands)`;
  if ((sub === 'checkout' || sub === 'restore') && rest.some((a) => longIs(a, '--pathspec-from-file', '--pathspec-file-nul', '--patch') || shortHas(a, 'p'))) return `git ${sub} --pathspec-from-file/--patch (paths cannot be checked against the AR scope)`;
  switch (sub) {
    case 'reset':
      if (rest.some((a) => longIs(a, '--hard'))) return 'git reset --hard';
      return resetMoves(rest) ? 'git reset <commit> / --soft/--mixed/--keep/--merge (moving a ref; unstage with `git reset -- <paths>`)' : null;
    case 'clean': return rest.some((a) => longIs(a, '--force') || shortHas(a, 'f')) ? 'git clean -f' : null;
    case 'push':
      if (rest.some((a) => longIs(a, '--force', '--force-with-lease', '--force-if-includes') || shortHas(a, 'f'))) return 'git push --force';
      if (rest.some((a) => /(^|:)\+/.test(a) && !a.startsWith('-'))) return 'git push +<refspec> (forced update)';
      if (rest.some((a) => longIs(a, '--delete', '--mirror', '--prune') || shortHas(a, 'd') || /^:[^:]/.test(a))) return 'git push deleting remote refs';
      return null;
    case 'fetch': return rest.some((a) => !a.startsWith('-') && /:[^:]/.test(a)) ? 'git fetch <src>:<dst> (updating a local ref)' : null;
    case 'tag': return rest.some((a) => longIs(a, '--delete', '--force') || shortHas(a, 'd') || shortHas(a, 'f')) ? 'git tag -d/-f (deleting or moving a tag)' : null;
    case 'checkout': {
      if (rest.some((a) => /^-[A-Za-z]*[bB]/.test(a) || longIs(a, '--orphan', '--detach'))) return 'git checkout -b/--orphan/--detach (creating/switching branches)';
      const dd = rest.indexOf('--');
      // `git checkout <ref> --` (nothing after `--`) switches branches or detaches HEAD.
      if (dd >= 0 && dd === rest.length - 1 && operands(rest.slice(0, dd)).length) return 'git checkout <ref> -- (switching branches / detaching HEAD)';
      return null;
    }
    case 'config': return configWrites(rest) ? 'git config (writing config: aliases, hooks and similar settings can run arbitrary git)' : null;
    case 'switch': return 'git switch';
    case 'commit': return rest.some((a) => longIs(a, '--amend')) ? 'git commit --amend (rewriting history)' : null;
    case 'update-ref': case 'filter-branch': case 'filter-repo': case 'replace': return `git ${sub} (rewriting refs or history)`;
    case 'symbolic-ref': return operands(rest).length > 1 || rest.some((a) => longIs(a, '--delete') || shortHas(a, 'd')) ? 'git symbolic-ref (moving HEAD)' : null;
    case 'reflog': return rest.some((a) => a === 'expire' || a === 'delete') ? `git reflog ${rest.find((a) => a === 'expire' || a === 'delete')}` : null;
    case 'gc': return rest.some((a) => longIs(a, '--prune')) ? 'git gc --prune' : null;
    case 'prune': return 'git prune';
    // AR branch worktrees (.shards/worktrees/<run>/<branch>) are created and removed by the runtime only.
    case 'worktree': return rest.some((a) => ['add', 'remove', 'move', 'prune', 'repair'].includes(a)) ? `git worktree ${rest.find((a) => ['add', 'remove', 'move', 'prune', 'repair'].includes(a))} (AR branch worktrees are runtime-owned)` : null;
    case 'branch': return branchMutates(rest) ? 'git branch (creating, moving, forcing or deleting a branch)' : null;
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

  // The sealed holdout baseline must not be read before ar_end (reads are otherwise unchecked).
  const inputText = cmd !== null ? cmd : JSON.stringify(n.toolInput || {});
  if (/research-sealed/.test(inputText)) return { deny: `shards: the sealed holdout state (.shards/state/research-sealed) is off limits while ${tag} is active; ar_end reveals it.` };

  if (EXEC_MCP.test(tool)) return null;
  // Third-party MCP edit tools (filesystem, LSP refactoring, ...) are not known to writesOf: check their local path
  // arguments. A write-like tool without one (a remote docs or drive API) does not touch the working tree.
  if (/^mcp__/.test(tool) && !/^mcp__.*shards/.test(tool) && MCP_WRITE.test(tool.split('__').pop())) {
    const inp = n.toolInput || {};
    const paths = [];
    for (const k of MCP_PATH_KEYS) {
      const v = inp[k];
      if (typeof v === 'string' && v) paths.push(v);
      else if (Array.isArray(v)) paths.push(...v.filter((x) => typeof x === 'string'));
    }
    for (const p of paths) {
      const r = leases.checkArWrite(session, lease, path.resolve(cwd, p));
      if (!r.allowed) return { deny: `shards: write refused: ${r.reason}.` };
    }
    return null;
  }
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
