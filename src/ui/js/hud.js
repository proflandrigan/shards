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
    var usage = session.contextUsage;
    if (usage && typeof usage.inputTokens === 'number') {
      // Model context window. We key a small table off the session model, but
      // no model field exists in session state yet, so default to 200K (the
      // Claude Code default for current Claude models). Conservative and clear.
      var CONTEXT_WINDOW = 200000;
      var totalInput = usage.inputTokens + (usage.cacheReadTokens || 0) + (usage.cacheCreationTokens || 0);
      var pct = Math.min(100, Math.round((totalInput / CONTEXT_WINDOW) * 100));
      var ctxLabel = pct + '%';
      if (totalInput >= 1000000) {
        ctxLabel = (totalInput / 1000000).toFixed(1) + 'M tok';
      } else if (totalInput >= 1000) {
        ctxLabel = Math.round(totalInput / 1000) + 'k tok';
      }
      ctxEl.textContent = pct >= 100 ? pct + '%' : ctxLabel;
      var guidance = '';
      if (pct >= 80) {
        guidance = ' Context is high — run /compact, or ask Syn to delegate the next task to a subagent.';
      } else if (pct >= 50) {
        guidance = ' Watch this — consider /compact or a subagent for heavier tasks.';
      }
      ctxEl.title = 'Context: ~' + pct + '% of the model window used\n' +
        'Input: ' + usage.inputTokens + ' + cache-read ' + (usage.cacheReadTokens || 0) +
        ' + cache-create ' + (usage.cacheCreationTokens || 0) + ' tokens.' + guidance;
      // Color coding: green < 50%, yellow 50-80%, red > 80%
      ctxEl.className = 'hud-context-value' +
        (pct >= 80 ? ' hud-ctx-high' : pct >= 50 ? ' hud-ctx-mid' : ' hud-ctx-low');
    } else {
      ctxEl.textContent = '\u2014';
      ctxEl.title = 'Context usage unavailable — waiting for the first turn';
      ctxEl.className = 'hud-context-value';
    }
  } else if (ctxEl) {
    ctxEl.textContent = '\u2014';
    ctxEl.title = 'No active session';
    ctxEl.className = 'hud-context-value';
  }
}
