'use strict';
// Size report: bytes and approx tokens (ceil(bytes/4)) per agent, protocols and templates.
const tokens = (bytes) => Math.ceil(bytes / 4);
const size = (bytes) => ({ bytes, tokens: tokens(bytes) });

// rendered: Map<outRelPath, string|Buffer> for content/; personas: Map<agentId, string>
function buildReport(target, rendered, personas) {
  const agents = {};
  const protocols = { files: 0, bytes: 0 };
  const templates = { files: 0, bytes: 0 };
  for (const [rel, data] of [...rendered.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const bytes = Buffer.byteLength(data);
    let m;
    if ((m = /^content\/agents\/([^/]+)\//.exec(rel))) {
      const a = (agents[m[1]] = agents[m[1]] || { files: 0, bytes: 0 });
      a.files++; a.bytes += bytes;
    } else if (rel.startsWith('content/protocols/')) { protocols.files++; protocols.bytes += bytes; }
    else if (rel.startsWith('content/templates/')) { templates.files++; templates.bytes += bytes; }
  }
  const out = { target, agents: {}, protocols: {}, templates: {}, totals: {} };
  let total = 0;
  for (const id of Object.keys(agents).sort()) {
    const persona = Buffer.byteLength(personas.get(id) || '');
    out.agents[id] = { files: agents[id].files, persona: size(persona), total: size(agents[id].bytes) };
    total += agents[id].bytes;
  }
  out.protocols = { files: protocols.files, ...size(protocols.bytes) };
  out.templates = { files: templates.files, ...size(templates.bytes) };
  total += protocols.bytes + templates.bytes;
  out.totals = size(total);
  return out;
}

function formatTable(r) {
  const rows = [['agent', 'persona tok', 'total tok', 'files']];
  for (const [id, a] of Object.entries(r.agents)) rows.push([id, String(a.persona.tokens), String(a.total.tokens), String(a.files)]);
  rows.push(['(protocols)', '-', String(r.protocols.tokens), String(r.protocols.files)]);
  rows.push(['(templates)', '-', String(r.templates.tokens), String(r.templates.files)]);
  rows.push(['TOTAL', '-', String(r.totals.tokens), '']);
  const w = rows[0].map((_, i) => Math.max(...rows.map((x) => x[i].length)));
  return rows.map((x) => x.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  ')).join('\n');
}

module.exports = { buildReport, formatTable, tokens };
