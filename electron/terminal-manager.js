'use strict';

const os = require('os');
const { randomUUID } = require('crypto');

// node-pty is loaded lazily so the module doesn't crash
// when imported outside Electron (e.g., during syntax checks).
let pty;
function loadPty() {
  if (!pty) pty = require('node-pty');
  return pty;
}

class TerminalManager {
  constructor() {
    this._terminals = new Map(); // id -> { process, cwd }
  }

  /**
   * Create a new terminal.
   * @param {object} options
   * @param {string} options.cwd - working directory
   * @param {function} options.onData - callback(id, data) for output
   * @param {function} options.onExit - callback(id, code) on exit
   * @returns {string} terminal id
   */
  create(options = {}) {
    const nodePty = loadPty();
    const id = randomUUID();
    const shell = this._detectShell();
    const cwd = options.cwd || process.cwd();

    const proc = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' }
    });

    proc.onData((data) => {
      if (options.onData) options.onData(id, data);
    });

    proc.onExit(({ exitCode }) => {
      this._terminals.delete(id);
      if (options.onExit) options.onExit(id, exitCode);
    });

    this._terminals.set(id, { process: proc, cwd });
    return id;
  }

  write(id, data) {
    const entry = this._terminals.get(id);
    if (entry) entry.process.write(data);
  }

  resize(id, cols, rows) {
    const entry = this._terminals.get(id);
    if (entry) {
      try {
        entry.process.resize(cols, rows);
      } catch {
        // Resize can fail if process already exited
      }
    }
  }

  destroy(id) {
    const entry = this._terminals.get(id);
    if (entry) {
      try {
        entry.process.kill();
      } catch {
        // Already dead
      }
      this._terminals.delete(id);
    }
  }

  destroyAll() {
    for (const id of [...this._terminals.keys()]) {
      this.destroy(id);
    }
  }

  has(id) {
    return this._terminals.has(id);
  }

  count() {
    return this._terminals.size;
  }

  _detectShell() {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }
}

module.exports = { TerminalManager };
