#!/usr/bin/env node
'use strict';
// E1.7 / D7 lint: no literal model id anywhere an agent definition is declared.
// Scans (1) YAML frontmatter of core/agents/*/AGENT.md, (2) core/agents/*/agent.yaml, (3) generated adapters:
// frontmatter of agents/*.md + skills/*/SKILL.md, and whole .toml/.json manifests (not the rendered content/ prose,
// where model names may appear as examples). A `model` / `model_id` key is also a finding (tier hints go in
// `model_tier` and take effect only when mapped in shards.config.yaml).
// Usage: node scripts/lint-models.js [--core core] [--adapters adapters]   (exit 1 on findings)
const fs = require('fs');
const path = require('path');

const ID_RES = [
  /\b(?:opus|sonnet|haiku)\b[-\w.]*/i,
  /\bclaude-(?!code\b)[\w.-]+/i, // claude-code is a host name, not a model
  /\bgpt-[\w.-]+/i,
  /\bgemini-[\w.-]+/i,
  /\b[a-z][a-z0-9-]*-20\d{6}\b/i, // dated ids, e.g. foo-20250101
];
const KEY_RES = [/^\s*model\s*[:=]/i, /^\s*model_id\s*[:=]/i, /"model(?:_id)?"\s*:/];

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return m ? { body: m[1], offset: 1 } : null;
}

function scanText(text, file, startLine, out) {
  text.split('\n').forEach((line, i) => {
    const bare = line.replace(/#.*$/, (c) => (/^\s*#/.test(line) ? '' : c)); // skip pure comment lines
    if (!bare.trim()) return;
    for (const re of KEY_RES) if (re.test(bare)) out.push({ file, line: startLine + i, what: `model key: ${bare.trim().slice(0, 60)}` });
    for (const re of ID_RES) { const m = re.exec(bare); if (m) out.push({ file, line: startLine + i, what: `model id '${m[0]}'` }); }
  });
}

function lintCore(coreDir) {
  const out = [];
  const agents = path.join(coreDir, 'agents');
  if (!fs.existsSync(agents)) return out;
  for (const d of fs.readdirSync(agents)) {
    const md = path.join(agents, d, 'AGENT.md');
    if (fs.existsSync(md)) {
      const fm = frontmatter(fs.readFileSync(md, 'utf8'));
      if (fm) scanText(fm.body, md, 2, out);
    }
    const y = path.join(agents, d, 'agent.yaml');
    if (fs.existsSync(y)) scanText(fs.readFileSync(y, 'utf8'), y, 1, out);
  }
  return out;
}

function walk(dir, skip, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!skip.has(e.name)) walk(p, skip, acc); } else acc.push(p);
  }
  return acc;
}

function lintAdapters(adapterDir) {
  const out = [];
  if (!fs.existsSync(adapterDir)) return out;
  for (const f of walk(adapterDir, new Set(['content', 'node_modules']))) {
    const base = path.basename(f);
    if (base === 'size-report.json') continue;
    const text = fs.readFileSync(f, 'utf8');
    if (/\.(toml|json|ya?ml)$/.test(f)) scanText(text, f, 1, out);
    else if (f.endsWith('.md')) { const fm = frontmatter(text); if (fm) scanText(fm.body, f, 2, out); }
  }
  return out;
}

function lint({ core, adapters }) {
  const out = [];
  if (core) out.push(...lintCore(core));
  if (adapters) {
    if (fs.existsSync(adapters) && fs.readdirSync(adapters).some((n) => fs.existsSync(path.join(adapters, n, 'size-report.json')))) {
      for (const t of fs.readdirSync(adapters)) out.push(...lintAdapters(path.join(adapters, t)));
    } else out.push(...lintAdapters(adapters));
  }
  return out;
}

module.exports = { lint, lintCore, lintAdapters };

if (require.main === module) {
  const a = process.argv.slice(2);
  const opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const found = lint({ core: opt('--core', 'core'), adapters: opt('--adapters', 'adapters') });
  for (const f of found) console.error(`${path.relative(process.cwd(), f.file)}:${f.line}: ${f.what}`);
  if (found.length) { console.error(`lint-models: ${found.length} finding(s); agents must use the session's model (D7)`); process.exit(1); }
  console.log('lint-models: ok (no literal model ids or model keys)');
}
