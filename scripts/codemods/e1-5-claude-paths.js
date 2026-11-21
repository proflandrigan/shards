#!/usr/bin/env node
'use strict';
// E1.5 codemod: legacy `.claude/agents/specific_instructions/...` paths -> `{{protocol}}`, `{{phase}}`, relative links.
// Deterministic; maps legacy paths through core/INVENTORY.md. Usage: node scripts/codemods/e1-5-claude-paths.js [--write]
// Rules:
//   `Read|Follow `<path>`` to a protocol  -> {{protocol <stem>}}      (verb consumed; the macro renders its own "Read ... now")
//   `Read|Follow `<path>`` to phase-N.md  -> {{phase N [track=..] [agent=..]}}
//   any other occurrence                  -> markdown link to the new relative path (plain path inside code fences)
// Anything it cannot map is reported (exceptions list), not touched.
const fs = require('fs');
const path = require('path');
const { walk } = require('./lib-task-blocks');

const WRITE = process.argv.includes('--write');
const coreDir = path.resolve('core');

const map = new Map(); // legacy suffix (after src/agents/ or src/templates/) -> new path relative to core/
for (const l of fs.readFileSync(path.join(coreDir, 'INVENTORY.md'), 'utf8').split('\n')) {
  const m = /^\| \d+ \| `src\/(agents|templates)\/([^`]+)` \| `core\/([^`]+)`/.exec(l);
  if (m) map.set(`${m[1]}/${m[2]}`, m[3]);
}

const PATH_RE = /(?:~?\/?\.claude\/)?(?:agents\/)?specific_instructions\/([a-z_]+)\/([A-Za-z0-9_./-]*?[A-Za-z0-9]\.md)/g;
const TPL_RE = /\.claude\/templates\/([A-Za-z0-9_.-]+\.(?:md|json))/g;
const exceptions = [];
const stats = { protocol: 0, phase: 0, link: 0, plain: 0 };

function legacyToNew(snake, file) {
  return map.get(`agents/specific_instructions/${snake}/${file}`);
}

function rel(fromFile, toNew) {
  let r = path.relative(path.dirname(fromFile), path.join(coreDir, toNew)).split(path.sep).join('/');
  return r.startsWith('.') ? r : r;
}

function phaseMacro(newPath, fromFile) {
  const m = /^agents\/([^/]+)\/phases(?:_(quick|deep))?\/phase-(\d+(?:-\d+)*)\.md$/.exec(newPath);
  if (!m) return null;
  const [, agent, track, n] = m;
  const fm = /^agents\/([^/]+)\/(?:phases(?:_(quick|deep))?\/)?/.exec(path.relative(coreDir, fromFile).split(path.sep).join('/'));
  const sameAgent = fm && fm[1] === agent;
  const fileTrack = fm && fm[2];
  const parts = [`phase ${n}`];
  if (track && !(sameAgent && fileTrack === track)) parts.push(`track=${track}`);
  if (!sameAgent) parts.push(`agent=${agent}`);
  return `{{${parts.join(' ')}}}`;
}

for (const f of walk(coreDir)) {
  if (f.endsWith('INVENTORY.md')) continue;
  const rel0 = path.relative(coreDir, f);
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let inFence = false;
  let changed = false;
  const out = lines.map((line, i) => {
    if (/^\s*(`{3,})/.test(line)) { inFence = !inFence; return line; }
    let L = line;
    // 1. verb + `path`  (protocol / phase macros)
    L = L.replace(new RegExp('\\b([Rr]ead|[Ff]ollow)( and follow)? `' + PATH_RE.source + '`', 'g'), (all, verb, af, snake, file) => {
      const np = snake === 'shared' ? map.get(`agents/specific_instructions/shared/${file}`) : legacyToNew(snake, file);
      if (!np) { exceptions.push(`${rel0}:${i + 1} unmapped ${snake}/${file}`); return all; }
      if (inFence) return all;
      const pm = /^protocols\/(.+)\.md$/.exec(np);
      if (pm) { stats.protocol++; return `{{protocol ${pm[1]}}}`; }
      const ph = phaseMacro(np, f);
      if (ph) { stats.phase++; return `${verb}${af || ''} ${ph.replace(/^\{\{/, '{{')}`.replace(/^[Rr]ead|^[Ff]ollow/, '').trim(); }
      return all;
    });
    // 2. remaining paths -> link / plain path
    L = L.replace(new RegExp('(`?)' + PATH_RE.source + '(`?)', 'g'), (all, b1, snake, file, b2) => {
      const np = legacyToNew(snake, file);
      if (!np) { exceptions.push(`${rel0}:${i + 1} unmapped ${snake}/${file}`); return all; }
      const r = rel(f, np);
      if (inFence) { stats.plain++; return b1 && b2 ? `\`${r}\`` : r; }
      stats.link++;
      // link text avoids repeating coupled stems (knowledge_*, ui_mode) so the coupling counts only go down
      const text = np.replace(/^agents\/[^/]+\//, '').replace(/(knowledge_(?:retrieval|harvest|checkpoint)|ui_mode)/g, (x) => x.replace(/_/g, ' '));
      return `[\`${text}\`](${r})`;
    });
    L = L.replace(TPL_RE, (all, name) => {
      if (!fs.existsSync(path.join(coreDir, 'templates', name))) { exceptions.push(`${rel0}:${i + 1} missing template ${name}`); return all; }
      if (inFence) { stats.plain++; return rel(f, `templates/${name}`); }
      stats.link++;
      return `[\`templates/${name}\`](${rel(f, `templates/${name}`)})`;
    });
    if (L !== line) changed = true;
    return L;
  });
  if (changed && WRITE) fs.writeFileSync(f, out.join('\n'));
}
console.log(JSON.stringify(stats));
if (exceptions.length) console.log(`EXCEPTIONS (${exceptions.length}):\n${exceptions.join('\n')}`);
