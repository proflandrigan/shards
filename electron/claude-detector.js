'use strict';

const { execSync } = require('child_process');

class ClaudeDetector {
  constructor(store) {
    this.store = store;
  }

  detect() {
    // Check cache first
    const cached = this.store.get('claudePath');
    if (cached && this._validate(cached)) {
      return cached;
    }

    // Try to find claude in PATH
    try {
      const result = execSync('which claude', { encoding: 'utf8', timeout: 5000 }).trim();
      if (result && this._validate(result)) {
        this.store.set('claudePath', result);
        return result;
      }
    } catch {
      // Not found
    }

    this.store.delete('claudePath');
    return null;
  }

  _validate(claudePath) {
    try {
      const version = execSync(`"${claudePath}" --version`, { encoding: 'utf8', timeout: 5000 }).trim();
      return version.length > 0;
    } catch {
      return false;
    }
  }

  getVersion() {
    const claudePath = this.store.get('claudePath');
    if (!claudePath) return null;
    try {
      return execSync(`"${claudePath}" --version`, { encoding: 'utf8', timeout: 5000 }).trim();
    } catch {
      return null;
    }
  }
}

module.exports = { ClaudeDetector };
