// ═══════════════════════════════════════════════════════════════
// Environment HUD — bottom status bar
// ═══════════════════════════════════════════════════════════════

function renderHud() {
  // ── Git section (left side) ──
  var branchEl = document.getElementById('hud-git-branch');
  var dirtyEl = document.getElementById('hud-git-dirty');
  var gitSepEl = document.getElementById('hud-git-sep');
  if (branchEl) {
    var showGit = !!gitCurrentBranch;
    branchEl.parentElement.style.display = showGit ? '' : 'none';
    if (gitSepEl) gitSepEl.style.display = showGit ? '' : 'none';
    if (showGit) {
      branchEl.textContent = gitCurrentBranch;
      branchEl.title = 'Current git branch: ' + gitCurrentBranch;
    }
  }
  if (dirtyEl) {
    var dirtyCount = gitChanges ? gitChanges.length : 0;
    if (dirtyCount > 0) {
      dirtyEl.textContent = dirtyCount + ' changed';
      dirtyEl.className = 'hud-dirty hud-dirty-active';
      dirtyEl.title = dirtyCount + ' file(s) with uncommitted changes';
    } else {
      dirtyEl.textContent = 'clean';
      dirtyEl.className = 'hud-dirty hud-dirty-clean';
      dirtyEl.title = 'Working tree is clean';
    }
  }

  // ── Pinned context count (center-left) ──
  var pinsEl = document.getElementById('hud-pins');
  if (pinsEl) {
    var pinCount = pinnedItems ? pinnedItems.length : 0;
    pinsEl.textContent = pinCount + ' pinned';
    pinsEl.title = pinCount + ' context item(s) pinned';
  }

  // ── Context usage indicator (right side, prominent) ──
  var session = getActiveSession();
  var ctxEl = document.getElementById('hud-context');
  if (ctxEl && session) {
    var msgCount = session.messages ? session.messages.length : 0;
    // Rough heuristic: estimate context window fill based on message count
    // Claude Code sessions typically auto-compress around 80-100 messages
    var maxMessages = 100;
    var pct = Math.min(100, Math.round((msgCount / maxMessages) * 100));
    ctxEl.textContent = pct + '%';
    ctxEl.title = 'Estimated context usage: ~' + pct + '% (' + msgCount + ' messages)';
    // Color coding: green < 50%, yellow 50-80%, red > 80%
    ctxEl.className = 'hud-context-value' +
      (pct >= 80 ? ' hud-ctx-high' : pct >= 50 ? ' hud-ctx-mid' : ' hud-ctx-low');
  } else if (ctxEl) {
    ctxEl.textContent = '\u2014';
    ctxEl.title = 'No active session';
    ctxEl.className = 'hud-context-value';
  }
}
