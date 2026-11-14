'use strict';
// Re-grounding extension point (E11.7). STUB: returns empty text for now.
// event in {'activate','load_phase','compact','version_change'}
const EVENTS = ['activate', 'load_phase', 'compact', 'version_change'];

async function regroundHook(event, ctx) { // eslint-disable-line no-unused-vars
  return { event, text: '' };
}

function shouldReground(lastSeenVersion, currentVersion) {
  return lastSeenVersion !== currentVersion;
}

module.exports = { regroundHook, shouldReground, EVENTS };
