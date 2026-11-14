'use strict';
// Leased-path hook. E5.9 will replace this with the real lease registry.
// Returns project-root-relative paths (files or directory prefixes) that other
// sessions currently hold; commitGate excludes them from a gate commit.
// Callers invoke it via the module object so tests can stub it.
function getLeasedPaths(_session) { return []; }

module.exports = { getLeasedPaths };
