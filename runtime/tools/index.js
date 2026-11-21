'use strict';
// Auto-loads every sibling *.js (except this file) that exports a tool definition
// (the result of defineTool, or an array of them). Adding a tool needs no registry edit.
const fs = require('fs');
const path = require('path');

function loadTools() {
  const out = [];
  for (const f of fs.readdirSync(__dirname).sort()) {
    if (!f.endsWith('.js') || f === 'index.js') continue;
    const mod = require(path.join(__dirname, f));
    const cands = Array.isArray(mod) ? mod : [mod && mod.tool ? mod.tool : mod];
    for (const t of cands) if (t && typeof t.name === 'string' && typeof t.handler === 'function' && typeof t.validate === 'function') out.push(t);
  }
  return out;
}

module.exports = { loadTools };
