'use strict';
// Shared parser for legacy `Task(subagent_type="x", description="...", prompt="...")` fenced blocks.
// Used by e1-4-subagent-macros.js (the codemod) and for inventory dumps.
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Returns [{ start, end, indent, target, description, prompt }] (line indices, end inclusive).
function findBlocks(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)Task\($/.exec(lines[i]);
    if (!m) continue;
    const t = /^\s*subagent_type="([^"]+)",?\s*$/.exec(lines[i + 1] || '');
    if (!t) continue;
    let j = i + 2;
    while (j < lines.length && !(lines[j].startsWith(m[1] + ')') && lines[j].trim() === ')')) j++;
    if (j >= lines.length) continue;
    const body = lines.slice(i + 2, j);
    const bodyText = body.join('\n');
    const d = /^\s*description="((?:[^"\\]|\\.)*)",?\s*$/m.exec(bodyText);
    const pi = bodyText.indexOf('prompt="');
    let prompt = '';
    if (pi >= 0) {
      prompt = bodyText.slice(pi + 8).replace(/\s*$/, '');
      if (prompt.endsWith('"')) prompt = prompt.slice(0, -1);
    }
    blocks.push({ start: i, end: j, indent: m[1], target: t[1], description: d ? d[1] : '', prompt });
    i = j;
  }
  return blocks;
}

module.exports = { walk, findBlocks };
