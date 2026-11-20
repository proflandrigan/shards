'use strict';
// `meta=` of {{artifact.emit}}: parse the "k=v k2=v" text into the object artifact_emit expects,
// typed by core/schema/artifacts/<type>.schema.json. See build/MACROS.md section 3.13.
const fs = require('fs');
const path = require('path');

const KEY_RE = /[A-Za-z_][A-Za-z0-9_-]*=/y;
const NEXT_KEY_RE = /\s+(?=[A-Za-z_][A-Za-z0-9_-]*=)/g;
const PLACEHOLDER_RE = /^<[^<>]+>$/;

// "title=AR: <p> (branch: <b>) panel_id=ar-<p> note='a b=c'" -> { title, panel_id, note }.
// An unquoted value runs to the next ` key=`; quote it ('...' or "...") if it contains one.
function parseMeta(str) {
  const out = {};
  const n = str.length;
  let i = 0;
  const skipWs = () => { while (i < n && /\s/.test(str[i])) i++; };
  skipWs();
  while (i < n) {
    KEY_RE.lastIndex = i;
    const m = KEY_RE.exec(str);
    if (!m) throw new Error(`malformed meta: expected key=value at '${str.slice(i)}'`);
    const key = m[0].slice(0, -1);
    i = KEY_RE.lastIndex;
    let value;
    if (str[i] === '"' || str[i] === "'") {
      const end = str.indexOf(str[i], i + 1);
      if (end === -1) throw new Error(`malformed meta: unterminated quote in '${key}'`);
      value = str.slice(i + 1, end);
      i = end + 1;
      if (i < n && !/\s/.test(str[i])) throw new Error(`malformed meta: text after closing quote in '${key}'`);
    } else {
      NEXT_KEY_RE.lastIndex = i;
      const nx = NEXT_KEY_RE.exec(str);
      const end = nx ? nx.index : n;
      value = str.slice(i, end).trim();
      i = end;
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) throw new Error(`malformed meta: duplicate key '${key}'`);
    if (value === '') throw new Error(`malformed meta: empty value for '${key}'`);
    out[key] = value;
    skipWs();
  }
  return out;
}

function loadSchema(coreDir, type) {
  if (!coreDir) return null;
  const p = path.join(coreDir, 'schema', 'artifacts', `${type}.schema.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// Type the parsed strings by the artifact schema. Integer/number/boolean fields become JS values;
// a `<placeholder>` in such a field becomes { placeholder } so it renders unquoted (the agent fills
// in a number). Returns { meta, errors }.
function typeMeta(raw, schema) {
  const errors = [];
  const meta = {};
  const props = (schema && schema.properties) || {};
  for (const [k, v] of Object.entries(raw)) {
    const t = props[k] && props[k].type;
    if (t === 'integer' || t === 'number' || t === 'boolean') {
      if (PLACEHOLDER_RE.test(v)) meta[k] = { placeholder: v };
      else if (t === 'boolean' && (v === 'true' || v === 'false')) meta[k] = v === 'true';
      else if (t === 'integer' && /^-?\d+$/.test(v)) meta[k] = Number(v);
      else if (t === 'number' && v.trim() !== '' && Number.isFinite(Number(v))) meta[k] = Number(v);
      else errors.push(`meta '${k}' must be ${t === 'integer' ? 'an' : 'a'} ${t} (or a <placeholder>), got '${v}'`);
    } else {
      meta[k] = v;
    }
  }
  for (const r of (schema && schema.required) || []) {
    if (!Object.prototype.hasOwnProperty.call(meta, r)) errors.push(`meta is missing required '${r}'`);
  }
  return { meta, errors };
}

// Object literal for the rendered instruction: {"title": "PR #<number>", "pr": <number>}.
function formatMeta(meta) {
  const parts = Object.entries(meta).map(([k, v]) => {
    const val = v && typeof v === 'object' && 'placeholder' in v ? v.placeholder : JSON.stringify(v);
    return `${JSON.stringify(k)}: ${val}`;
  });
  return `{${parts.join(', ')}}`;
}

module.exports = { parseMeta, typeMeta, formatMeta, loadSchema };
