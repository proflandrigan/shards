'use strict';

// Re-export electron-store with Shards IDE defaults.
// Other modules import Store directly; this file exists
// as the central place to define the schema and defaults
// if we need them later.

const Store = require('electron-store');

const defaults = {
  windowWidth: 1400,
  windowHeight: 900,
  recentProjects: [],
  claudePath: null
};

function createSettingsStore() {
  return new Store({
    name: 'shards-ide',
    defaults
  });
}

module.exports = { createSettingsStore, defaults };
