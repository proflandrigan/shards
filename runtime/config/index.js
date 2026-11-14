'use strict';
// shards.config.yaml: schema validation, zero-config defaults, first-use creation (E6.1).
// No shell, path.join only. Never rewrites an existing config file.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const schema = require('../../core/schema/shards-config.schema.json');

const CONFIG_FILENAME = 'shards.config.yaml';
const JOBS = ['record', 'tasks', 'knowledge', 'review', 'artifacts', 'presentation'];

class ConfigError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

// `{output_dir}` is substituted by the runtime with the active agent's output_dir.
const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  jobs: {
    record: { binding: 'git', options: { path: '{output_dir}/project-specs.md' } },
    tasks: { binding: 'git', options: { path: 'TASKS.md' } },
    knowledge: { binding: 'git', options: { paths: ['docs/'], git_log: true } },
    review: { binding: 'git', options: {} },
    artifacts: { binding: 'git', options: { path: '{output_dir}' } },
    presentation: { binding: 'git', options: {} },
  },
  gates: { policy: 'phase', budget: { max_gates: 100 } },
  git: {
    commit: true,
    push: false,
    denylist: {
      globs: [
        '*.parquet', '*.feather', '*.arrow', '*.pkl', '*.pickle', '*.joblib',
        '*.pt', '*.pth', '*.ckpt', '*.safetensors', '*.onnx', '*.h5', '*.npy', '*.npz',
        '*.db', '*.sqlite', '*.sqlite3', '*.csv.gz', '*.zip', '*.tar', '*.tar.gz',
      ],
      max_file_size_bytes: 5 * 1024 * 1024,
    },
  },
  bindings: {},
});

const MODEL_ID_RE = /^(claude[-_]|gpt[-_]|o[1-9](-|$)|gemini[-_]|llama[-_]?\d|mistral[-_]|mixtral|command[-_]r|deepseek[-_]|qwen)/i;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
  return out;
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// D7: a model name is legal only inside `tiers`.
function findModelLiterals(node, pathParts, out) {
  if (typeof node === 'string') {
    if (MODEL_ID_RE.test(node.trim())) out.push({ path: pathParts.join('.'), value: node });
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => findModelLiterals(v, pathParts.concat(String(i)), out));
  } else if (isPlainObject(node)) {
    for (const k of Object.keys(node)) {
      if (pathParts.length === 0 && k === 'tiers') continue;
      findModelLiterals(node[k], pathParts.concat(k), out);
    }
  }
}

function formatAjvError(e) {
  const where = e.instancePath ? e.instancePath.slice(1).replace(/\//g, '.') : '(root)';
  if (e.keyword === 'enum') return `${where}: must be one of ${e.params.allowedValues.join(' | ')}`;
  if (e.keyword === 'additionalProperties') return `${where}: unknown key "${e.params.additionalProperty}"`;
  if (e.keyword === 'oneOf') return null; // noisy; sub-errors carry the detail
  return `${where}: ${e.message}`;
}

function validateConfig(obj) {
  if (!isPlainObject(obj)) return { ok: false, errors: ['(root): config must be a mapping'] };
  const errors = [];
  if (!validateSchema(obj)) {
    for (const e of validateSchema.errors) {
      const m = formatAjvError(e);
      if (m && !errors.includes(m)) errors.push(m);
    }
    if (!errors.length) errors.push('jobs: each job must be a binding name or { binding, options }');
  }
  const lits = [];
  findModelLiterals(obj, [], lits);
  for (const l of lits) {
    errors.push(`${l.path}: model name "${l.value}" is not allowed here. Model names may appear only under "tiers" (D7).`);
  }
  return { ok: errors.length === 0, errors };
}

function normalizeJob(v) {
  if (typeof v === 'string') return { binding: v, options: {} };
  return { binding: v.binding, options: isPlainObject(v.options) ? v.options : {} };
}

// Merge defaults into a user config. A string job value is shorthand for { binding }.
function mergeDefaults(user) {
  const merged = deepMerge(clone(DEFAULT_CONFIG), {});
  const u = isPlainObject(user) ? user : {};
  for (const k of Object.keys(u)) {
    if (k === 'jobs' && isPlainObject(u.jobs)) {
      for (const job of Object.keys(u.jobs)) {
        const nj = normalizeJob(u.jobs[job]);
        const def = DEFAULT_CONFIG.jobs[job];
        // Default options only apply while the job still uses the default binding.
        const baseOpts = def && def.binding === nj.binding ? def.options : {};
        merged.jobs[job] = { binding: nj.binding, options: deepMerge(clone(baseOpts), nj.options) };
      }
    } else {
      merged[k] = deepMerge(merged[k], u[k]);
    }
  }
  return merged;
}

const CREATED_TEMPLATE = `# shards.config.yaml: created automatically by Shards on first use.
# This file is the single source of truth for where each job's output goes.
# Everything below is the zero-config default (git only). Delete or edit freely;
# Shards never rewrites this file once it exists. See docs/config.md.
version: 1

# Each job points at a binding (bindings/<name>.md). Examples once you connect tools:
#   record: confluence
#   tasks: { binding: jira, options: { project: ABC } }
jobs:
  record: git          # project-specs.md under the agent's output_dir
  tasks: git           # TASKS.md
  knowledge: git       # docs/ plus git log
  review: git
  artifacts: git       # the agent's output_dir
  presentation: git    # local files

# Gate policy: strict (human on every gate) | phase (default) | plan (approve plan + budget once)
gates:
  policy: phase
  # budget:            # plan policy only; null/omitted = unbounded (max_gates defaults to 100)
  #   max_gates: 100
  #   max_tool_calls: 500
  #   max_minutes: 120

git:
  commit: true         # commit confirmed-gate output paths on the current branch
  push: false          # Shards never pushes unless you turn this on
  # denylist:          # defaults skip data dumps and model binaries; set to override
  #   globs: ["*.parquet", "*.pkl"]
  #   max_file_size_bytes: 5242880

# Optional tier hints. Shards uses the session's model unless you map tiers here.
# tiers:
#   small: <your model string>
#   large: <your model string>

# Per-binding settings, e.g. bindings.confluence.space
bindings: {}
`;

function configPath(projectRoot) {
  return path.join(projectRoot, CONFIG_FILENAME);
}

function loadOrCreateConfig(projectRoot) {
  if (typeof projectRoot !== 'string' || !projectRoot) throw new ConfigError('projectRoot is required');
  const p = configPath(projectRoot);
  let created = false;
  if (!fs.existsSync(p)) {
    fs.mkdirSync(projectRoot, { recursive: true });
    try {
      fs.writeFileSync(p, CREATED_TEMPLATE, { encoding: 'utf8', flag: 'wx' });
      created = true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw new ConfigError(`Cannot create ${p}: ${e.message}`);
    }
  }
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    throw new ConfigError(`Cannot read ${p}: ${e.message}`);
  }
  let parsed;
  try {
    parsed = YAML.parse(raw);
  } catch (e) {
    throw new ConfigError(`${CONFIG_FILENAME} is not valid YAML: ${e.message}`);
  }
  if (parsed === null || parsed === undefined) parsed = {};
  const res = validateConfig(parsed);
  if (!res.ok) {
    throw new ConfigError(`Invalid ${CONFIG_FILENAME}:\n  - ${res.errors.join('\n  - ')}`, res.errors);
  }
  const config = mergeDefaults(parsed);
  const final = validateConfig(config);
  if (!final.ok) {
    throw new ConfigError(`Invalid ${CONFIG_FILENAME}:\n  - ${final.errors.join('\n  - ')}`, final.errors);
  }
  return { config, created, path: p };
}

function resolveJob(config, jobName) {
  if (!JOBS.includes(jobName)) throw new ConfigError(`Unknown job "${jobName}". Jobs: ${JOBS.join(', ')}`);
  const raw = config && config.jobs && config.jobs[jobName];
  const def = DEFAULT_CONFIG.jobs[jobName];
  if (raw === undefined) return { binding: def.binding, options: clone(def.options) };
  const nj = normalizeJob(raw);
  const baseOpts = def.binding === nj.binding ? def.options : {};
  return { binding: nj.binding, options: deepMerge(clone(baseOpts), nj.options) };
}

module.exports = { loadOrCreateConfig, validateConfig, DEFAULT_CONFIG, resolveJob, ConfigError, JOBS, CONFIG_FILENAME };
