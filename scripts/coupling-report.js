#!/usr/bin/env node
'use strict';
/*
 * coupling-report: measures how tightly the agent suite is coupled to Claude
 * Code, the Shards UI, and text-marker protocols. Fixed pattern and scope per
 * metric; no dependencies; deterministic output (sorted keys/arrays, no
 * timestamps, repo-relative paths).
 *
 * Usage: node scripts/coupling-report.js [--roots src,core] [--json] [--out file]
 * Missing roots are skipped. Scanned: .md .json .js .html .css .yaml .yml .py
 * (node_modules and .git skipped).
 *
 * METRIC DEFINITIONS (all scoped to every scanned file unless stated):
 *   ui_refs            occurrences of /ui\.port|ui-push|ui_mode/ (+ files)
 *   claude_dir_refs    occurrences of /\.claude\//
 *   subagent_type      occurrences of "subagent_type"
 *   compact            occurrences of "/compact"
 *   gate_fences        occurrences of "::GATE::"; by_kind parses kind=<x> on the
 *                      same line (no kind => "unspecified")
 *   auto_verify        opens = "::AUTO-VERIFY::", closes = "::ENDAUTO::"
 *   ledger_refs        occurrences of /Knowledge Ledger|\.shards\/knowledge|
 *                      knowledge[_-](retrieval|harvest|checkpoint)/ (+ files)
 *   model_pins         files directly under an agents/ dir (*.md) whose YAML
 *                      frontmatter has a `model:` line
 *   missing_templates  names referenced as templates/<name>.(md|json) from files
 *                      under a commands/ or agents/ path, absent from any
 *                      <root>/templates/ dir
 *   ui_mode_files      files named *ui_mode*.md
 *   via_task_prose     occurrences of /\bvia (the )?Task( tool)?\b/i (+ files): host-specific
 *                      "via Task" prose. Macro docs never use that phrase (they say
 *                      "consult"/"delegate"), so there are no legitimate matches to exclude.
 *   write_whole_build  occurrences, in .md files under any phases-prefixed directory
 *                      (rel path /(^|\/)phases[^/]*\/[^/]+\.md$/), of
 *                      /\bwrite\s+(?:out\s+)?(?:the\s+|a\s+|an\s+)?(?:whole|entire|full|complete)\s+(?:[A-Za-z-]+\s+){0,3}?(?:notebook|pipeline|script|model|build|project|service|dashboard|application|app|codebase|suite)\b|\b(?:in\s+(?:one|a\s+single)\s+(?:go|pass|shot|step))\b[^.\n]{0,60}\bwrite\b/gi
 *                      (+ files). Flags instructions to write a whole artifact in
 *                      one pass, which delegated builds replace with per-task
 *                      components.
 *
 * COUNT VS AUDIT (audit at 8e24069; see docs/history/shards-agent-suite-plan.md). The
 * "actual" column is the run on `--roots src` at the time of writing; the plan
 * says E0.2 sets the exact figures, so differences below are definitional:
 * Default scope (--roots src) is the WHOLE src tree including src/docs, src/ui
 * and src/templates, so it reads higher than the audit. The audit figures were
 * taken from src/agents + src/commands only; `--roots src/agents,src/commands`
 * reproduces them exactly for: .claude/ 468, subagent_type 236, /compact 46,
 * ::GATE:: 317, auto-verify 10 opens / 12 closes, model pins 15, missing
 * templates 4, ui_mode files 9. Default (src) run vs audit:
 *   claude_dir_refs 502 vs 468   (docs/ui/templates add 34)
 *   subagent_type   241 vs 236
 *   compact          51 vs 46
 *   gate_fences     333 vs 317   (docs/ui/templates mention fences; the
 *                                 by_kind split differs, and prose mentions
 *                                 without kind= land in "unspecified")
 *   auto_verify     12/16 vs 10/12 (docs mention markers)
 *   ui_refs files    49 vs ~34-39 (49 whole src; 40 excluding src/docs;
 *                                 34 excluding docs and src/ui)
 *   ledger_refs files 87 vs 89   (fixed definition is narrower/different than
 *                                 the audit's unspecified grep; not fudged)
 *   by_kind (src/agents+src/commands scope): audit counted every `kind=<x>`
 *   token anywhere (phase 198, final 69, checkpoint 26, execute 17, confirm 3).
 *   This script counts kinds only on lines that contain ::GATE::, so it gives
 *   phase 195, final 68, checkpoint 13, execute 16, confirm 3 plus
 *   unspecified 22 (prose/rule lines mentioning ::GATE::). Total (317) matches;
 *   the audit's kind totals included kind= mentions in prose and examples.
 */
const fs = require('fs');
const path = require('path');

const EXTS = new Set(['.md', '.json', '.js', '.html', '.css', '.yaml', '.yml', '.py']);
const SKIP = new Set(['node_modules', '.git']);

const WHOLE_BUILD_RE = /\bwrite\s+(?:out\s+)?(?:the\s+|a\s+|an\s+)?(?:whole|entire|full|complete)\s+(?:[A-Za-z-]+\s+){0,3}?(?:notebook|pipeline|script|model|build|project|service|dashboard|application|app|codebase|suite)\b|\b(?:in\s+(?:one|a\s+single)\s+(?:go|pass|shot|step))\b[^.\n]{0,60}\bwrite\b/gi;

const DEFS = {
  ui_refs: 'occurrences of /ui\\.port|ui-push|ui_mode/ in all scanned files',
  claude_dir_refs: 'occurrences of /\\.claude\\// in all scanned files',
  subagent_type: 'occurrences of "subagent_type" in all scanned files',
  compact: 'occurrences of "/compact" in all scanned files',
  gate_fences: 'occurrences of "::GATE::"; by_kind from kind=<x> on the same line, else "unspecified"',
  auto_verify: 'opens = "::AUTO-VERIFY::", closes = "::ENDAUTO::" occurrences',
  ledger_refs: 'occurrences of /Knowledge Ledger|\\.shards\\/knowledge|knowledge[_-](retrieval|harvest|checkpoint)/',
  model_pins: '*.md directly under an agents/ dir with YAML frontmatter containing a model: line',
  missing_templates: 'templates/<name>.(md|json) referenced from commands/ or agents/ paths but absent from <root>/templates/',
  ui_mode_files: 'files named *ui_mode*.md',
  write_whole_build: 'occurrences of "write the whole/entire/full/complete <artifact>" or "in one go/pass ... write" in *.md files under phases*/ directories (instructions to write a whole build in one pass; delegated builds use per-task components)',
  host_tool_names: 'occurrences, outside frontmatter tools: lines, of the Claude Code tool names NotebookEdit and Task used as a host tool (calls Task, branch Tasks, Task prompt, Task output, Task content blocks, Task-invoked ...)',
  host_goal_caveat: 'occurrences of Claude Code /goal version caveats (v2.1.x, disableAllHooks) in all scanned files',
  via_task_prose: 'occurrences of /\\bvia (the )?Task( tool)?\\b/i (host-specific "via Task" prose) in all scanned files',
};

function walk(dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && EXTS.has(path.extname(e.name)) && e.name !== 'INVENTORY.md') out.push(p); // INVENTORY.md lists legacy file names by design
  }
}

const HOST_TOOL_RE = /\bNotebookEdit\b|\b(?:calls?|invokes?|spawn(?:s|ed)?|branch|reviewer|parallel|specialist|revision|each|all|one) Tasks?\b(?! (?:count|evidence|cards?|acceptance|type|list)\b)|\bTask(?:[- ](?:prompts?|output|content blocks?|calls?|invoked))\b/g;
const GOAL_CAVEAT_RE = /v2\.1\.\d+|disableAllHooks/g;

function stripToolsLines(text) { return text.replace(/^tools:.*$/gm, ''); }

function count(re, text) { const m = text.match(re); return m ? m.length : 0; }

function computeReport(opts) {
  const root = path.resolve((opts && opts.root) || process.cwd());
  const roots = (opts && opts.roots) || ['src', 'core'];
  const files = [];
  const templateNames = new Set();
  for (const t of ['src/templates', 'core/templates']) {
    const td = path.join(root, t);
    if (fs.existsSync(td)) for (const f of fs.readdirSync(td)) templateNames.add(f);
  }
  for (const r of roots) {
    const abs = path.join(root, r);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
    walk(abs, files);
    const td = path.join(abs, 'templates');
    if (fs.existsSync(td)) for (const f of fs.readdirSync(td)) templateNames.add(f);
  }
  files.sort();

  const mk = () => ({ count: 0, files: [] });
  const m = {
    ui_refs: mk(), claude_dir_refs: mk(), subagent_type: mk(), compact: mk(),
    ledger_refs: mk(), host_tool_names: mk(), host_goal_caveat: mk(), via_task_prose: mk(), write_whole_build: mk(),
  };
  const gate = { count: 0, by_kind: {}, files: [] };
  const av = { opens: 0, closes: 0, files: [] };
  const pins = { count: 0, files: [] };
  const missing = new Set();
  const uiModeFiles = [];

  const simple = [
    ['ui_refs', /ui\.port|ui-push|ui_mode/g],
    ['claude_dir_refs', /\.claude\//g],
    ['subagent_type', /subagent_type/g],
    ['compact', /\/compact/g],
    ['ledger_refs', /Knowledge Ledger|\.shards\/knowledge|knowledge[_-](?:retrieval|harvest|checkpoint)/g],
    ['via_task_prose', /\bvia (?:the )?Task(?: tool)?\b/gi],
  ];

  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    const text = fs.readFileSync(f, 'utf8');
    {
      const stripped = stripToolsLines(text);
      const a = count(HOST_TOOL_RE, stripped), b = count(GOAL_CAVEAT_RE, text);
      if (a) { m.host_tool_names.count += a; m.host_tool_names.files.push(rel); }
      if (b) { m.host_goal_caveat.count += b; m.host_goal_caveat.files.push(rel); }
    }
    for (const [k, re] of simple) {
      const n = count(re, text);
      if (n) { m[k].count += n; m[k].files.push(rel); }
    }
    if (text.includes('::GATE::')) {
      let fileHas = false;
      for (const line of text.split('\n')) {
        const n = count(/::GATE::/g, line);
        if (!n) continue;
        fileHas = true;
        const km = line.match(/kind=([A-Za-z0-9_-]+)/);
        const kind = km ? km[1] : 'unspecified';
        gate.count += n;
        gate.by_kind[kind] = (gate.by_kind[kind] || 0) + n;
      }
      if (fileHas) gate.files.push(rel);
    }
    if (/(^|\/)phases[^/]*\/[^/]+\.md$/.test(rel)) {
      const n = count(WHOLE_BUILD_RE, text);
      if (n) { m.write_whole_build.count += n; m.write_whole_build.files.push(rel); }
    }
    const o = count(/::AUTO-VERIFY::/g, text), c = count(/::ENDAUTO::/g, text);
    if (o || c) { av.opens += o; av.closes += c; av.files.push(rel); }

    if (/(^|\/)agents\/[^/]+\.md$/.test(rel) || /(^|\/)agents\/[^/]+\/AGENT\.md$/.test(rel)) {
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fm && /^model:/m.test(fm[1])) { pins.count++; pins.files.push(rel); }
    }
    if (/(^|\/)[^/]*ui_mode[^/]*\.md$/.test(rel)) uiModeFiles.push(rel);

    if (/(^|\/)(commands|agents)\//.test(rel)) {
      const re = /templates\/([A-Za-z0-9_.-]+\.(?:md|json))/g;
      let t;
      while ((t = re.exec(text))) if (!templateNames.has(t[1])) missing.add(t[1]);
    }
  }

  const sortedKinds = {};
  for (const k of Object.keys(gate.by_kind).sort()) sortedKinds[k] = gate.by_kind[k];
  const report = {
    ui_refs: { count: m.ui_refs.count, files: m.ui_refs.files.length, file_list: m.ui_refs.files, definition: DEFS.ui_refs },
    claude_dir_refs: { count: m.claude_dir_refs.count, files: m.claude_dir_refs.files.length, file_list: m.claude_dir_refs.files, definition: DEFS.claude_dir_refs },
    subagent_type: { count: m.subagent_type.count, files: m.subagent_type.files.length, file_list: m.subagent_type.files, definition: DEFS.subagent_type },
    compact: { count: m.compact.count, files: m.compact.files.length, file_list: m.compact.files, definition: DEFS.compact },
    gate_fences: { count: gate.count, by_kind: sortedKinds, files: gate.files.length, file_list: gate.files, definition: DEFS.gate_fences },
    auto_verify: { opens: av.opens, closes: av.closes, count: av.opens + av.closes, files: av.files.length, file_list: av.files, definition: DEFS.auto_verify },
    ledger_refs: { count: m.ledger_refs.count, files: m.ledger_refs.files.length, file_list: m.ledger_refs.files, definition: DEFS.ledger_refs },
    host_tool_names: { count: m.host_tool_names.count, files: m.host_tool_names.files.length, file_list: m.host_tool_names.files, definition: DEFS.host_tool_names },
    host_goal_caveat: { count: m.host_goal_caveat.count, files: m.host_goal_caveat.files.length, file_list: m.host_goal_caveat.files, definition: DEFS.host_goal_caveat },
    via_task_prose: { count: m.via_task_prose.count, files: m.via_task_prose.files.length, file_list: m.via_task_prose.files, definition: DEFS.via_task_prose },
    write_whole_build: { count: m.write_whole_build.count, files: m.write_whole_build.files.length, file_list: m.write_whole_build.files, definition: DEFS.write_whole_build },
    model_pins: { count: pins.count, files: pins.count, file_list: pins.files, definition: DEFS.model_pins },
    missing_templates: { count: missing.size, names: [...missing].sort(), definition: DEFS.missing_templates },
    ui_mode_files: { count: uiModeFiles.length, file_list: uiModeFiles, definition: DEFS.ui_mode_files },
  };
  const sorted = {};
  for (const k of Object.keys(report).sort()) sorted[k] = report[k];
  return sorted;
}

function stableStringify(v) {
  return JSON.stringify(v, (k, x) => {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      const o = {};
      for (const key of Object.keys(x).sort()) o[key] = x[key];
      return o;
    }
    return x;
  }, 2) + '\n';
}

function formatTable(r) {
  const rows = [['metric', 'count', 'files', 'detail']];
  for (const k of Object.keys(r)) {
    const x = r[k];
    let detail = '';
    if (k === 'gate_fences') detail = Object.entries(x.by_kind).map(([a, b]) => `${a}=${b}`).join(' ');
    else if (k === 'auto_verify') detail = `opens=${x.opens} closes=${x.closes}`;
    else if (k === 'missing_templates') detail = x.names.join(', ');
    rows.push([k, String(x.count), x.files === undefined ? '-' : String(x.files), detail]);
  }
  const w = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  return rows.map((row) => row.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd()).join('\n') + '\n';
}

function main(argv) {
  let roots = ['src', 'core'], json = false, out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--roots') roots = (argv[++i] || '').split(',').filter(Boolean);
    else if (argv[i] === '--json') json = true;
    else if (argv[i] === '--out') out = argv[++i];
  }
  const r = computeReport({ root: process.cwd(), roots });
  const text = json ? stableStringify(r) : formatTable(r);
  if (out) fs.writeFileSync(out, text);
  else process.stdout.write(text);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { computeReport, stableStringify, formatTable };
