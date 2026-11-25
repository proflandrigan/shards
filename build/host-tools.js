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

// Claude subagent tool allowlist for an agent.yaml document. `delegate` (Task) is kept only for builders that have
// their own workers (activation includes fanout_worker): as a workstream lead they spawn same-specialist workers
// (Syn -> lead -> worker, depth 2). Reviewers and orchestrator-only agents have no workers, so Task is dropped
// for them (consults do not nest). An explicit but fully-dropped list yields [] (no tools key); an absent list yields the default.
function claudeToolsOf(doc) {
  const caps = doc && Array.isArray(doc.capabilities) ? doc.capabilities : null;
  const list = caps || DEFAULT_CAPABILITIES;
  const hasWorkers = !!(doc && Array.isArray(doc.activation) && doc.activation.includes('fanout_worker'));
  const out = [];
  for (const c of list) {
    if (c === 'delegate' && caps && !hasWorkers) continue;
    for (const t of CLAUDE_TOOLS[c] || []) if (!out.includes(t)) out.push(t);
  }
  return out;
}

module.exports = { CAPABILITIES, DEFAULT_CAPABILITIES, HOST_TOOLS, claudeToolsOf };
