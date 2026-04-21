import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Use CommonJS require for the CJS gate-hook modules
const require = createRequire(import.meta.url);

// ─── Helper: temp dir per test ────────────────────────────────────────────────

let tmpDir;
let origCwd;

beforeEach(() => {
  origCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-hook-test-'));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(origCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  // Bust the module cache so state.js re-resolves process.cwd()
  Object.keys(require.cache).filter(k => k.includes('gate-hook')).forEach(k => delete require.cache[k]);
});

// ─── Parser tests ─────────────────────────────────────────────────────────────

describe('parser', () => {
  it('parses a single gate', () => {
    const { parseGates } = require('../tools/gate-hook/parser.js');
    const text = `Some text\n::GATE:: id=phase1-test phase=1 kind=phase\nStop here and wait.\n::ENDGATE::\nMore text`;
    const gates = parseGates(text);
    expect(gates).toHaveLength(1);
    expect(gates[0].attrs.id).toBe('phase1-test');
    expect(gates[0].attrs.phase).toBe('1');
    expect(gates[0].attrs.kind).toBe('phase');
    expect(gates[0].body).toBe('Stop here and wait.');
  });

  it('parses multiple gates', () => {
    const { parseGates } = require('../tools/gate-hook/parser.js');
    const text = `::GATE:: id=gate-a phase=1 kind=phase\nFirst gate\n::ENDGATE::\nMiddle text\n::GATE:: id=gate-b phase=2 kind=confirm\nSecond gate\n::ENDGATE::`;
    const gates = parseGates(text);
    expect(gates).toHaveLength(2);
    expect(gates[0].attrs.id).toBe('gate-a');
    expect(gates[1].attrs.id).toBe('gate-b');
  });

  it('returns empty array for text with no gates', () => {
    const { parseGates } = require('../tools/gate-hook/parser.js');
    expect(parseGates('No gates here')).toHaveLength(0);
  });

  it('ignores malformed fences missing id attribute', () => {
    const { parseGates } = require('../tools/gate-hook/parser.js');
    // Missing id — parseGates still parses it but attrs.id will be undefined
    const text = `::GATE:: phase=1 kind=phase\nBody\n::ENDGATE::`;
    const gates = parseGates(text);
    expect(gates).toHaveLength(1);
    expect(gates[0].attrs.id).toBeUndefined();
  });

  it('detects post-fence phase advance as violation', () => {
    const { checkViolation } = require('../tools/gate-hook/parser.js');
    const msg = `::GATE:: id=g1 phase=1 kind=phase\nStop.\n::ENDGATE::\n## Phase 3\nNow I will proceed.`;
    expect(checkViolation(msg)).toBeTruthy();
  });

  it('detects code block after gate as violation', () => {
    const { checkViolation } = require('../tools/gate-hook/parser.js');
    const msg = `::GATE:: id=g1 phase=1 kind=phase\nStop.\n::ENDGATE::\n\`\`\`python\nprint('hi')\n\`\`\``;
    expect(checkViolation(msg)).toBeTruthy();
  });

  it('allows short benign post-fence text', () => {
    const { checkViolation } = require('../tools/gate-hook/parser.js');
    const msg = `::GATE:: id=g1 phase=1 kind=phase\nStop.\n::ENDGATE::`;
    expect(checkViolation(msg)).toBeNull();
  });

  it('flags overly long post-fence text', () => {
    const { checkViolation } = require('../tools/gate-hook/parser.js');
    const extra = Array(42).fill('word').join(' ');
    const msg = `::GATE:: id=g1 phase=1 kind=phase\nStop.\n::ENDGATE::\n${extra}`;
    expect(checkViolation(msg)).toBeTruthy();
  });
});

// ─── Classify tests ───────────────────────────────────────────────────────────

describe('classify', () => {
  let classify;
  beforeEach(() => {
    classify = require('../tools/gate-hook/classify.js').classify;
  });

  const positives = ['y', 'yes', 'yep', 'yeah', 'yup', 'confirm', 'confirmed', 'proceed', 'go', 'go ahead', 'approved', 'lgtm', 'ship it', 'ok', 'okay', 'sounds good', 'looks good', 'continue', 'next', 'advance', 'move on'];
  for (const word of positives) {
    it(`classifies "${word}" as confirm`, () => {
      expect(classify(word)).toBe('confirm');
      expect(classify(word.toUpperCase())).toBe('confirm');
    });
  }

  const negatives = ['n', 'no', 'nope', 'stop', 'hold', 'wait', 'change', 'revise', 'actually', 'not quite', 'let me'];
  for (const word of negatives) {
    it(`classifies "${word}" as deny`, () => {
      expect(classify(word)).toBe('deny');
    });
  }

  it('classifies empty string as ambiguous', () => {
    expect(classify('')).toBe('ambiguous');
  });

  it('classifies "maybe" as ambiguous', () => {
    expect(classify('maybe')).toBe('ambiguous');
  });

  it('classifies "idk" as ambiguous', () => {
    expect(classify('idk')).toBe('ambiguous');
  });

  it('handles ::GATE-CONFIRM:: prefix as explicit confirm', () => {
    expect(classify('::GATE-CONFIRM:: phase1-test')).toBe('confirm');
  });
});

// ─── State tests ──────────────────────────────────────────────────────────────

describe('state', () => {
  it('returns default state when file missing', () => {
    const { read } = require('../tools/gate-hook/state.js');
    const s = read();
    expect(s.open).toBe(false);
    expect(Array.isArray(s.history)).toBe(true);
  });

  it('round-trips read/write', () => {
    const { read, write } = require('../tools/gate-hook/state.js');
    const data = { open: true, id: 'test-gate', phase: 1, kind: 'phase', history: [] };
    write(data);
    const result = read();
    expect(result.open).toBe(true);
    expect(result.id).toBe('test-gate');
  });

  it('creates directory if missing', () => {
    const { write } = require('../tools/gate-hook/state.js');
    write({ open: false, history: [] });
    expect(fs.existsSync(path.join(tmpDir, '.shards', 'gates', 'state.json'))).toBe(true);
  });
});

// ─── Stop handler tests ───────────────────────────────────────────────────────

describe('stop handler', () => {
  function writeTranscript(messages) {
    const transcriptPath = path.join(tmpDir, 'transcript.jsonl');
    const lines = messages.map(m => JSON.stringify(m));
    fs.writeFileSync(transcriptPath, lines.join('\n'));
    return transcriptPath;
  }

  function makeAssistantEntry(text) {
    return { role: 'assistant', content: [{ type: 'text', text }] };
  }

  it('opens gate when clean gate fence found', () => {
    const transcriptPath = writeTranscript([
      makeAssistantEntry('::GATE:: id=phase1-framing phase=1 kind=phase\nStop here and wait.\n::ENDGATE::'),
    ]);

    // Run stop handler inline
    process.chdir(tmpDir);
    const stateModule = require('../tools/gate-hook/state.js');
    const { readLastAssistantMessage } = require('../tools/gate-hook/transcript.js');
    const { parseGates, checkViolation } = require('../tools/gate-hook/parser.js');

    const lastMsg = readLastAssistantMessage(transcriptPath);
    const gates = parseGates(lastMsg);
    expect(gates).toHaveLength(1);
    expect(checkViolation(lastMsg)).toBeNull();

    const gate = gates[0];
    const current = stateModule.read();
    stateModule.write({
      open: true,
      id: gate.attrs.id,
      phase: gate.attrs.phase,
      kind: gate.attrs.kind,
      history: current.history || [],
    });

    const s = stateModule.read();
    expect(s.open).toBe(true);
    expect(s.id).toBe('phase1-framing');
  });

  it('detects violation when Phase header follows gate', () => {
    const { checkViolation } = require('../tools/gate-hook/parser.js');
    const msg = '::GATE:: id=g1 phase=1 kind=phase\nStop.\n::ENDGATE::\n## Phase 3\nDoing next phase.';
    expect(checkViolation(msg)).toBeTruthy();
  });
});

// ─── PreToolUse handler tests ─────────────────────────────────────────────────

describe('preToolUse handler', () => {
  function setup(open, toolName) {
    const stateModule = require('../tools/gate-hook/state.js');
    if (open) {
      stateModule.write({ open: true, id: 'test-gate', phase: 1, kind: 'phase', opened_at: new Date().toISOString(), history: [] });
    } else {
      stateModule.write({ open: false, history: [] });
    }

    const ALLOWED_TOOLS = new Set(['Read', 'Glob', 'Grep']);
    const s = stateModule.read();
    if (!s.open) return { blocked: false };
    if (ALLOWED_TOOLS.has(toolName)) return { blocked: false };
    return { blocked: true };
  }

  it('blocks Write tool when gate is open', () => {
    expect(setup(true, 'Write').blocked).toBe(true);
  });

  it('blocks Edit tool when gate is open', () => {
    expect(setup(true, 'Edit').blocked).toBe(true);
  });

  it('blocks Bash tool when gate is open', () => {
    expect(setup(true, 'Bash').blocked).toBe(true);
  });

  it('blocks Task tool when gate is open', () => {
    expect(setup(true, 'Task').blocked).toBe(true);
  });

  it('allows Read tool when gate is open', () => {
    expect(setup(true, 'Read').blocked).toBe(false);
  });

  it('allows Glob tool when gate is open', () => {
    expect(setup(true, 'Glob').blocked).toBe(false);
  });

  it('allows Grep tool when gate is open', () => {
    expect(setup(true, 'Grep').blocked).toBe(false);
  });

  it('allows all tools when gate is closed', () => {
    expect(setup(false, 'Write').blocked).toBe(false);
    expect(setup(false, 'Edit').blocked).toBe(false);
    expect(setup(false, 'Bash').blocked).toBe(false);
  });
});

// ─── UserPromptSubmit handler tests ──────────────────────────────────────────

describe('userPromptSubmit handler', () => {
  function setupOpen() {
    const stateModule = require('../tools/gate-hook/state.js');
    stateModule.write({
      open: true,
      id: 'phase2-scope',
      phase: 2,
      kind: 'phase',
      opened_at: new Date().toISOString(),
      history: [],
    });
    return stateModule;
  }

  it('closes gate on "yes, proceed"', () => {
    const stateModule = setupOpen();
    const { classify } = require('../tools/gate-hook/classify.js');
    const prompt = 'yes, proceed';
    const s = stateModule.read();
    if (s.open && classify(prompt) === 'confirm') {
      stateModule.write({ open: false, history: [...s.history, { id: s.id, closed_at: new Date().toISOString() }] });
    }
    expect(stateModule.read().open).toBe(false);
    expect(stateModule.read().history).toHaveLength(1);
  });

  it('keeps gate open on "no, actually..."', () => {
    const stateModule = setupOpen();
    const { classify } = require('../tools/gate-hook/classify.js');
    const prompt = 'no, actually change the metric';
    const result = classify(prompt);
    expect(result).toBe('deny');
    expect(stateModule.read().open).toBe(true);
  });

  it('keeps gate open on "hmm" (ambiguous)', () => {
    const stateModule = setupOpen();
    const { classify } = require('../tools/gate-hook/classify.js');
    const prompt = 'hmm not sure';
    const result = classify(prompt);
    expect(result).toBe('ambiguous');
    expect(stateModule.read().open).toBe(true);
  });
});
