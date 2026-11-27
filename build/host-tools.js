'use strict';
// Per-host mapping from host-neutral agent capabilities (agent.yaml `capabilities`) to the host's tool names.
// core/ states what an agent needs; only build/ knows what the host calls it. Order is preserved: the
// capabilities list order is the emitted tool order.

// Capability vocabulary. Keep in sync with `capabilities` in core/schema/agent.schema.json.
const CAPABILITIES = ['read', 'write', 'edit', 'search', 'shell', 'notebook', 'delegate', 'web', 'skill'];

// Used when an agent declares no capabilities: read-only investigation.
const DEFAULT_CAPABILITIES = ['read', 'search', 'shell'];

const CLAUDE_TOOLS = {
  read: ['Read'],
  write: ['Write'],
  edit: ['Edit'],
  search: ['Glob', 'Grep'],
  shell: ['Bash'],
  notebook: ['NotebookEdit'],
  delegate: ['Task'],
  web: ['WebSearch', 'WebFetch'],
  skill: ['Skill'],
};

const HOST_TOOLS = { claude: CLAUDE_TOOLS };

// Claude subagent tool allowlist for an agent.yaml document. `delegate` (Task) is kept for builders that have their
// own workers (activation includes fanout_worker: a workstream lead spawns same-specialist workers, depth 2) and for
// reviewers with a review or service entry (a review lead spawns verifiers, depth 2). Other agents (the orchestrator,
// specialists without workers) have no workers, so Task is dropped for them. Consult entries and workers never get
// Task (the caller strips it). An explicit but fully-dropped list yields [] (no tools key); an absent list yields the default.
function claudeToolsOf(doc) {
  const caps = doc && Array.isArray(doc.capabilities) ? doc.capabilities : null;
  const list = caps || DEFAULT_CAPABILITIES;
  const hasWorkers = !!(doc && Array.isArray(doc.activation) && doc.activation.includes('fanout_worker'));
  const ce = (doc && doc.consult_entries) || {};
  const reviewLead = !!(doc && doc.role === 'reviewer' && (ce.review || ce.service));
  const out = [];
  for (const c of list) {
    if (c === 'delegate' && caps && !hasWorkers && !reviewLead) continue;
    for (const t of CLAUDE_TOOLS[c] || []) if (!out.includes(t)) out.push(t);
  }
  return out;
}

module.exports = { CAPABILITIES, DEFAULT_CAPABILITIES, HOST_TOOLS, claudeToolsOf };
