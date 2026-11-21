'use strict';
// Artifact event log (E2.9): append-only JSONL at <root>/.shards/events.jsonl.
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { lockedAppend } = require('../state/append');
const schema = require('../../core/schema/event.schema.json');

const EVENT_TYPES = schema.properties.type.enum.slice();

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

// Per-type meta schemas (core/schema/artifacts/<type>.schema.json), compiled once.
const ARTIFACT_TYPES = EVENT_TYPES.slice();
const metaValidators = {};
for (const t of ARTIFACT_TYPES) {
  metaValidators[t] = ajv.compile(require(`../../core/schema/artifacts/${t}.schema.json`));
}

function validateMeta(type, meta) {
  const v = metaValidators[type];
  if (!v) return { valid: false, errors: [`unknown artifact type: ${JSON.stringify(type)}`] };
  const m = meta === undefined || meta === null ? {} : meta;
  if (v(m)) return { valid: true, errors: [] };
  return { valid: false, errors: v.errors.map((e) => `${e.instancePath || '(meta)'} ${e.message}`) };
}

function validateEvent(evt) {
  if (!validate(evt)) {
    return { valid: false, errors: validate.errors.map((e) => `${e.instancePath || '(event)'} ${e.message}`) };
  }
  const m = validateMeta(evt.type, evt.meta);
  if (!m.valid) return { valid: false, errors: [`invalid meta for ${evt.type}: ${m.errors.join('; ')}`] };
  return { valid: true, errors: [] };
}

function deepestExisting(p) {
  let cur = p;
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return cur;
}

function resolveInsideRoot(root, p) {
  if (typeof p !== 'string' || p === '') throw new Error('path must be a non-empty string');
  if (p.includes('\0')) throw new Error('path contains NUL byte');
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, p);
  const rel = path.relative(absRoot, abs);
  if (rel === '' ) throw new Error('path must name a file inside the project root');
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`path escapes project root: ${p}`);
  }
  // Symlink escape check on the deepest existing ancestor.
  let realRoot;
  try { realRoot = fs.realpathSync(absRoot); } catch (_) { realRoot = absRoot; }
  const real = fs.realpathSync(deepestExisting(abs));
  const rr = path.relative(realRoot, real);
  if (rr === '..' || rr.startsWith('..' + path.sep) || path.isAbsolute(rr)) {
    throw new Error(`path escapes project root via symlink: ${p}`);
  }
  return rel.split(path.sep).join('/');
}

function buildEvent({ type, path: p, meta } = {}, ctx) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`unknown event type: ${JSON.stringify(type)}`);
  let rel = null;
  if (p !== undefined && p !== null) rel = resolveInsideRoot(ctx.root, p);
  else if (type !== 'close') throw new Error(`path is required for event type '${type}'`);
  const frames = (ctx.state && ctx.state.read('frames').frames) || [];
  const top = frames[frames.length - 1];
  return {
    v: 1,
    ts: new Date().toISOString(),
    session: String(ctx.sessionKey),
    agent: top && top.agent ? top.agent : null,
    type,
    path: rel,
    meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {},
  };
}

async function emitEvent(ctx, args) {
  const evt = buildEvent(args || {}, ctx);
  const r = validateEvent(evt);
  if (!r.valid) {
    throw new Error(r.errors[0].startsWith('invalid meta for') ? r.errors[0] : `invalid event: ${r.errors.join('; ')}`);
  }
  await lockedAppend(path.join(ctx.root, '.shards', 'events.jsonl'), JSON.stringify(evt));
  return evt;
}

module.exports = { EVENT_TYPES, ARTIFACT_TYPES, validateMeta, validateEvent, resolveInsideRoot, buildEvent, emitEvent };
