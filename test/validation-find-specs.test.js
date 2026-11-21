import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// findLatestSpecs is internal to runtime/lib/validation.js and not exported, so these tests
// go through readSpecs(), which resolves the specs file via findLatestSpecs(process.cwd()).
// A child process is used so the cwd can be pointed at a temp root without chdir in the worker.
const here = path.dirname(fileURLToPath(import.meta.url));
const VALIDATION = path.join(here, '..', 'runtime', 'lib', 'validation.js');

function readSpecsFrom(root) {
  const script = `
    const { readSpecs } = require(${JSON.stringify(VALIDATION)});
    const out = readSpecs();
    process.stdout.write(out === null ? '__NULL__' : out);
  `;
  const env = { ...process.env };
  delete env.SHARDS_PROJECT_SPECS_PATH;
  return execFileSync(process.execPath, ['-e', script], { cwd: root, env, encoding: 'utf8' });
}

function writeSpecs(root, rel, marker) {
  const file = path.join(root, rel, 'project-specs.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# ${marker}\n`);
}

describe('findLatestSpecs (via readSpecs)', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('finds shards/<project>/project-specs.md', () => {
    writeSpecs(root, path.join('shards', 'p1'), 'P1-SPECS');
    expect(readSpecsFrom(root)).toContain('P1-SPECS');
  });

  it('still finds legacy analysis/<project>/project-specs.md', () => {
    writeSpecs(root, path.join('analysis', 'p0'), 'P0-SPECS');
    expect(readSpecsFrom(root)).toContain('P0-SPECS');
  });
});
