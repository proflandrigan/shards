'use strict';

class WorkspaceRegistry {
  constructor() {
    this._entries = new Map();
  }

  add(windowId, entry) {
    this._entries.set(windowId, entry);
  }

  get(windowId) {
    return this._entries.get(windowId);
  }

  remove(windowId) {
    this._entries.delete(windowId);
  }

  findByProject(projectDir) {
    for (const entry of this._entries.values()) {
      if (entry.projectDir === projectDir) return entry;
    }
    return null;
  }

  all() {
    return [...this._entries.values()];
  }

  size() {
    return this._entries.size;
  }
}

module.exports = { WorkspaceRegistry };
