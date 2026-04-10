/**
 * terminal.js — Integrated terminal panel for Shards IDE (Electron only).
 *
 * Uses xterm.js in the renderer and node-pty in the main process,
 * connected via the shardsElectron IPC bridge from preload.js.
 *
 * Gracefully degrades: if window.shardsElectron is not available
 * (web UI mode), the terminal panel is hidden and no code runs.
 */

const terminalState = {
  tabs: [],        // [{ id, label, termId }]
  activeTab: null, // index into tabs
  visible: false,
  panelHeight: 250,
  instances: {}    // termId -> Terminal (xterm) instance
};

let xtermLoaded = false;
let fitAddonModule = null;

function isElectron() {
  return !!(window.shardsElectron && window.shardsElectron.terminal);
}

// ─── xterm.js loading ────────────────────────────────────────────────────────
// In Electron, xterm is bundled in vendor/. In dev, loaded from node_modules.

async function ensureXterm() {
  if (xtermLoaded) return;

  // xterm.js and fit addon should be available globally or via import
  // In Electron packaged mode, they're loaded via script tags in index.html
  if (typeof Terminal === 'undefined') {
    console.warn('xterm.js not loaded — terminal unavailable');
    return;
  }

  if (typeof FitAddon !== 'undefined') {
    fitAddonModule = FitAddon;
  }

  xtermLoaded = true;
}

// ─── Panel visibility ───────────────────────────────────────────────────────

function toggleTerminalPanel() {
  if (!isElectron()) return;

  terminalState.visible = !terminalState.visible;
  const panel = document.getElementById('terminal-panel');
  if (!panel) return;

  if (terminalState.visible) {
    panel.style.display = 'flex';
    panel.style.height = terminalState.panelHeight + 'px';
    // Create first terminal if none exist
    if (terminalState.tabs.length === 0) {
      createTerminalTab();
    } else {
      // Re-fit the active terminal
      const active = terminalState.tabs[terminalState.activeTab];
      if (active && terminalState.instances[active.termId]) {
        const inst = terminalState.instances[active.termId];
        if (inst.fitAddon) {
          setTimeout(() => inst.fitAddon.fit(), 50);
        }
      }
    }
  } else {
    panel.style.display = 'none';
  }
}

// ─── Terminal tabs ──────────────────────────────────────────────────────────

async function createTerminalTab() {
  if (!isElectron()) return;
  await ensureXterm();
  if (!xtermLoaded) return;

  const termId = await window.shardsElectron.terminal.create({
    cols: 80,
    rows: 24
  });

  const index = terminalState.tabs.length;
  const tab = { id: index, label: `Terminal ${index + 1}`, termId };
  terminalState.tabs.push(tab);
  terminalState.activeTab = index;

  // Create xterm instance
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    theme: {
      background: '#0d1117',
      foreground: '#e6edf3',
      cursor: '#58a6ff',
      selectionBackground: 'rgba(56, 139, 253, 0.3)',
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39d353',
      white: '#b1bac4'
    }
  });

  const inst = { terminal: term, fitAddon: null };

  if (fitAddonModule) {
    const fit = new fitAddonModule.FitAddon();
    term.loadAddon(fit);
    inst.fitAddon = fit;
  }

  terminalState.instances[termId] = inst;

  // Render
  renderTerminalTabs();
  activateTerminalTab(index);

  // Connect input: renderer -> main process
  term.onData((data) => {
    window.shardsElectron.terminal.write(termId, data);
  });
}

function activateTerminalTab(index) {
  if (index < 0 || index >= terminalState.tabs.length) return;
  terminalState.activeTab = index;
  const tab = terminalState.tabs[index];
  const container = document.getElementById('terminal-container');
  if (!container) return;

  // Hide all, show active
  container.querySelectorAll('.terminal-instance').forEach(el => {
    el.style.display = 'none';
  });

  let el = document.getElementById(`term-${tab.termId}`);
  if (!el) {
    el = document.createElement('div');
    el.id = `term-${tab.termId}`;
    el.className = 'terminal-instance';
    container.appendChild(el);

    const inst = terminalState.instances[tab.termId];
    if (inst) {
      inst.terminal.open(el);
      if (inst.fitAddon) {
        setTimeout(() => inst.fitAddon.fit(), 50);
      }
    }
  }

  el.style.display = 'block';

  // Fit on activation
  const inst = terminalState.instances[tab.termId];
  if (inst && inst.fitAddon) {
    setTimeout(() => {
      inst.fitAddon.fit();
      // Notify main process of new dimensions
      const dims = inst.fitAddon.proposeDimensions();
      if (dims) {
        window.shardsElectron.terminal.resize(tab.termId, dims.cols, dims.rows);
      }
    }, 50);
  }

  renderTerminalTabs();
}

function closeTerminalTab(index) {
  const tab = terminalState.tabs[index];
  if (!tab) return;

  // Destroy pty in main process
  window.shardsElectron.terminal.destroy(tab.termId);

  // Clean up xterm instance
  const inst = terminalState.instances[tab.termId];
  if (inst) {
    inst.terminal.dispose();
    delete terminalState.instances[tab.termId];
  }

  // Remove DOM
  const el = document.getElementById(`term-${tab.termId}`);
  if (el) el.remove();

  terminalState.tabs.splice(index, 1);

  if (terminalState.tabs.length === 0) {
    terminalState.activeTab = null;
    toggleTerminalPanel(); // hide
  } else {
    terminalState.activeTab = Math.min(index, terminalState.tabs.length - 1);
    activateTerminalTab(terminalState.activeTab);
  }
}

function renderTerminalTabs() {
  const bar = document.getElementById('terminal-tab-bar');
  if (!bar) return;

  bar.innerHTML = '';

  terminalState.tabs.forEach((tab, i) => {
    const btn = document.createElement('button');
    btn.className = 'terminal-tab' + (i === terminalState.activeTab ? ' active' : '');
    btn.textContent = tab.label;
    btn.onclick = () => activateTerminalTab(i);

    const close = document.createElement('span');
    close.className = 'terminal-tab-close';
    close.textContent = '\u00d7';
    close.onclick = (e) => { e.stopPropagation(); closeTerminalTab(i); };
    btn.appendChild(close);

    bar.appendChild(btn);
  });

  // "+" button
  const addBtn = document.createElement('button');
  addBtn.className = 'terminal-tab terminal-tab-add';
  addBtn.textContent = '+';
  addBtn.title = 'New terminal';
  addBtn.onclick = () => createTerminalTab();
  bar.appendChild(addBtn);
}

// ─── Resize handle ──────────────────────────────────────────────────────────

function initTerminalResize() {
  const handle = document.getElementById('terminal-resize-handle');
  const panel = document.getElementById('terminal-panel');
  if (!handle || !panel) return;

  let startY = 0;
  let startHeight = 0;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startHeight = panel.offsetHeight;

    const onMove = (e2) => {
      const delta = startY - e2.clientY;
      const newHeight = Math.max(100, Math.min(600, startHeight + delta));
      panel.style.height = newHeight + 'px';
      terminalState.panelHeight = newHeight;

      // Re-fit active terminal
      if (terminalState.activeTab !== null) {
        const tab = terminalState.tabs[terminalState.activeTab];
        const inst = tab && terminalState.instances[tab.termId];
        if (inst && inst.fitAddon) inst.fitAddon.fit();
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      // Send final dimensions to pty
      if (terminalState.activeTab !== null) {
        const tab = terminalState.tabs[terminalState.activeTab];
        const inst = tab && terminalState.instances[tab.termId];
        if (inst && inst.fitAddon) {
          const dims = inst.fitAddon.proposeDimensions();
          if (dims) {
            window.shardsElectron.terminal.resize(tab.termId, dims.cols, dims.rows);
          }
        }
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ─── IPC data routing ───────────────────────────────────────────────────────

function initTerminalIPC() {
  if (!isElectron()) return;

  window.shardsElectron.terminal.onData((termId, data) => {
    const inst = terminalState.instances[termId];
    if (inst) inst.terminal.write(data);
  });

  window.shardsElectron.terminal.onExit((termId, _code) => {
    // Find and close the tab
    const index = terminalState.tabs.findIndex(t => t.termId === termId);
    if (index >= 0) {
      const inst = terminalState.instances[termId];
      if (inst) {
        inst.terminal.dispose();
        delete terminalState.instances[termId];
      }
      const el = document.getElementById(`term-${termId}`);
      if (el) el.remove();

      terminalState.tabs.splice(index, 1);
      if (terminalState.tabs.length === 0) {
        terminalState.activeTab = null;
        toggleTerminalPanel();
      } else {
        terminalState.activeTab = Math.min(index, terminalState.tabs.length - 1);
        activateTerminalTab(terminalState.activeTab);
      }
    }
  });

  // Keyboard shortcut: Ctrl+` to toggle
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      toggleTerminalPanel();
    }
  });

  // Menu action
  window.shardsElectron.onMenuAction('toggle-terminal', toggleTerminalPanel);
}

// ─── Init ───────────────────────────────────────────────────────────────────

function initTerminal() {
  if (!isElectron()) {
    // Hide terminal panel in web UI mode
    const panel = document.getElementById('terminal-panel');
    if (panel) panel.style.display = 'none';
    return;
  }

  initTerminalIPC();
  initTerminalResize();
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTerminal);
} else {
  initTerminal();
}
