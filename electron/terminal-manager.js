'use strict';

// Phase 3 stub — terminal management via node-pty.
// This file will be fully implemented in Phase 3.
// For now it exports the expected interface so main.js
// can reference it without errors.

class TerminalManager {
  constructor() {
    this._terminals = new Map();
  }

  create(_options) {
    // Phase 3: spawn node-pty process
    return null;
  }

  write(_id, _data) {
    // Phase 3
  }

  resize(_id, _cols, _rows) {
    // Phase 3
  }

  destroy(_id) {
    // Phase 3
  }

  destroyAll() {
    // Phase 3
  }
}

module.exports = { TerminalManager };
