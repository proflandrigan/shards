'use strict';
// Activation checks: static (core/) and post-emit (written file list per target).
const { inventory } = require('./activation-inventory.js');

const has = (doc, kind) => Array.isArray(doc.activation) && doc.activation.includes(kind);

function switchable(core) { return [...core.agents.values()].filter((a) => has(a.doc, 'switch')).map((a) => a.id); }
function consultable(core) {
  return [...core.agents.values()].filter((a) => has(a.doc, 'consult')).map((a) => ({ id: a.id, entries: Object.keys(a.doc.consult_entries || {}) }));
}

// Static: every macro target resolves, and macro targets have the matching activation.
function checkActivation(core) {
  const errors = [];
  const inv = inventory(core.coreDir);
  for (const [id, u] of Object.entries(inv)) {
    const a = core.agents.get(id);
    if (!a) { errors.push(`activation: macro target '${id}' is not an agent`); continue; }
    if (u.switch_target && !has(a.doc, 'switch')) errors.push(`activation: '${id}' is a {{switch}} target but activation lacks 'switch'`);
    if (u.fanout_target && !has(a.doc, 'fanout_worker')) errors.push(`activation: '${id}' is a {{fanout}} target but activation lacks 'fanout_worker'`);
    for (const [entry, callers] of Object.entries(u.consulted)) {
      const entries = a.doc.consult_entries || {};
      if (!(entry in entries)) {
        errors.push(`activation: '${id}' entry '${entry}' is consulted (${callers[0]}) but not in consult_entries`);
      } else if (entry !== 'worker' && !has(a.doc, 'consult')) {
        errors.push(`activation: '${id}' is consulted (${callers[0]}) but activation lacks 'consult'`);
      }
    }
  }
  for (const a of core.agents.values()) {
    if (has(a.doc, 'consult') && !Object.keys(a.doc.consult_entries || {}).length) errors.push(`activation: '${a.id}' has 'consult' but no consult_entries`);
  }
  return errors;
}

// Emitted: target is 'claude' | 'codex'. writtenFiles: iterable of paths relative to the output root.
function checkEmitted(core, writtenFiles, target) {
  const errors = [];
  const files = new Set([...writtenFiles].map((f) => String(f).replace(/\\/g, '/').replace(/^\.\//, '')));
  const need = (p, why) => { if (!files.has(p)) errors.push(`emit(${target}): missing ${p} (${why})`); };
  const hasPrefix = (p) => [...files].some((f) => f.startsWith(p));
  const claude = target === 'claude';
  if (!claude && target !== 'codex') return [`emit: unknown target '${target}'`];
  for (const id of switchable(core)) {
    if (claude) need(`skills/${id}/SKILL.md`, `switchable agent '${id}'`);
    else if (!hasPrefix(`skills/${id}/`)) errors.push(`emit(codex): missing skills/${id}/ (switchable agent '${id}')`);
  }
  for (const { id, entries } of consultable(core)) {
    const base = claude ? 'agents' : '.codex/agents';
    const ext = claude ? 'md' : 'toml';
    need(`${base}/${id}.${ext}`, `consultable agent '${id}'`);
    for (const e of entries) need(`${base}/${id}-${e}.${ext}`, `consult entry '${e}' of '${id}'`);
  }
  return errors;
}

module.exports = { checkActivation, checkEmitted };
