'use strict';
// Leased-path hook backed by the lease store (runtime/leases, E12.1; E5.9 extends).
// Returns project-root-relative paths (files or directory prefixes) held by
// active, non-expired leases in the session; commitGate excludes them from a
// gate commit. Returns [] when no lease state exists.
// Callers invoke it via the module object so tests can stub it.
async function getLeasedPaths(session) {
  if (!session || !session.root || (!session.state && !session.sessionKey)) return [];
  const { listActive } = require('../leases');
  const out = new Set();
  for (const l of listActive(session)) for (const s of l.slices) for (const p of s.paths) out.add(p);
  return [...out];
}

module.exports = { getLeasedPaths };
