#!/usr/bin/env node
'use strict';
// Scans every .md under core/ for {{consult}}, {{switch}}, {{fanout}} and reports, per agent,
// which entries are consulted (with callers), and whether it is a switch / fanout target.
const fs = require('fs');
const path = require('path');
const { expandText } = require('./macros.js');
const { walk } = require('./core.js');

function inventory(coreDir) {
  const root = path.resolve(coreDir || path.join(__dirname, '..', 'core'));
  const agents = {};
  const get = (id) => (agents[id] = agents[id] || { consulted: {}, switch_target: false, fanout_target: false, fanout_callers: [], switch_callers: [] });
  for (const rel of walk(root)) {
    if (!rel.endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    expandText(text, ({ name, args, raw, line }) => {
      if (!args || !args.positional[0]) return raw;
      const id = args.positional[0];
      const caller = `${rel}:${line}`;
      if (name === 'consult') {
        const entry = args.named.entry;
        if (entry) {
          const e = get(id).consulted;
          (e[entry] = e[entry] || []).push(caller);
        }
      } else if (name === 'switch') {
        const a = get(id);
        a.switch_target = true;
        a.switch_callers.push(caller);
      } else if (name === 'fanout') {
        const a = get(id);
        a.fanout_target = true;
        a.fanout_callers.push(caller);
        const entry = args.named.entry || 'worker';
        (a.consulted[entry] = a.consulted[entry] || []).push(caller);
      }
      return raw;
    });
  }
  return agents;
}

function main() {
  const inv = inventory();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(inv, null, 2));
  } else {
    for (const id of Object.keys(inv).sort()) {
      const a = inv[id];
      const entries = Object.entries(a.consulted).map(([e, c]) => `${e}(${c.length})`).join(' ');
      console.log(`${id}: switch=${a.switch_target ? 'yes(' + a.switch_callers.length + ')' : 'no'} fanout=${a.fanout_target ? 'yes(' + a.fanout_callers.length + ')' : 'no'} consulted=[${entries}]`);
    }
  }
}

module.exports = { inventory, main };

if (require.main === module) main();
