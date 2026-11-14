'use strict';
// Binding-file loader + validator (E6.2). A binding is bindings/<name>.md:
// YAML frontmatter (core/schema/binding.schema.json) + markdown body with one
// "## verb: <verb>" section per declared verb.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const schema = require('../../core/schema/binding.schema.json');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'bindings');
const VERB_PREFIX = {
  record: 'record', tasks: 'tasks', knowledge: 'knowledge',
  review: 'review', artifacts: 'artifact', presentation: 'presentation',
};

class BindingError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'BindingError';
    this.errors = errors;
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function splitFrontmatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  if (!m) return null;
  return { front: m[1], body: m[2] || '' };
}

// Pure validator: text -> { ok, errors, binding }.
function parseBinding(text, expectedName) {
  const errors = [];
  const parts = splitFrontmatter(text);
  if (!parts) return { ok: false, errors: ['missing YAML frontmatter (--- ... ---)'] };
  let fm;
  try {
    fm = YAML.parse(parts.front);
  } catch (e) {
    return { ok: false, errors: [`frontmatter is not valid YAML: ${e.message}`] };
  }
  if (fm === null || typeof fm !== 'object' || Array.isArray(fm)) {
    return { ok: false, errors: ['frontmatter must be a mapping'] };
  }
  if (!validateSchema(fm)) {
    for (const e of validateSchema.errors) {
      const where = e.instancePath ? e.instancePath.slice(1).replace(/\//g, '.') : '(root)';
      errors.push(e.keyword === 'additionalProperties'
        ? `${where}: unknown key "${e.params.additionalProperty}"`
        : `${where}: ${e.message}`);
    }
    return { ok: false, errors };
  }
  if (expectedName && fm.name !== expectedName) {
    errors.push(`name "${fm.name}" must equal the file name "${expectedName}"`);
  }
  for (const job of fm.jobs) {
    if (!fm.verbs[job]) errors.push(`jobs lists "${job}" but verbs has no entry for it`);
  }
  for (const job of Object.keys(fm.verbs)) {
    if (!fm.jobs.includes(job)) errors.push(`verbs.${job} is declared but "${job}" is not in jobs`);
    for (const v of fm.verbs[job]) {
      if (!v.startsWith(`${VERB_PREFIX[job]}.`)) {
        errors.push(`verb "${v}" under ${job} must start with "${VERB_PREFIX[job]}."`);
      }
      const re = new RegExp(`^##\\s+verb:\\s*${v.replace(/\./g, '\\.')}\\s*$`, 'm');
      if (!re.test(parts.body)) errors.push(`body is missing a "## verb: ${v}" section`);
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], binding: { ...fm, body: parts.body } };
}

function loadBinding(name, dir = DEFAULT_DIR) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    throw new BindingError(`Invalid binding name "${name}"`);
  }
  const file = path.join(dir, `${name}.md`);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new BindingError(`Unknown binding "${name}" (no ${file})`);
    throw new BindingError(`Cannot read ${file}: ${e.message}`);
  }
  const res = parseBinding(text, name);
  if (!res.ok) throw new BindingError(`Invalid binding "${name}":\n  - ${res.errors.join('\n  - ')}`, res.errors);
  return res.binding;
}

function listBindings(dir = DEFAULT_DIR) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  return files
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .map((f) => f.slice(0, -3))
    .sort();
}

module.exports = { loadBinding, listBindings, parseBinding, BindingError };
