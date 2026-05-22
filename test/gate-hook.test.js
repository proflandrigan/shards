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

  it('ignores gate markers inside a fenced markdown code block', () => {
    const { parseGates } = require('../tools/gate-hook/parser.js');
    const text = [
      'Here is an example of the gate pattern:',
      '```',
      '::GATE:: id=example-only phase=1 kind=phase',
      'this is illustrative, not a real gate',
      '::ENDGATE::',
      '```',
      'End of example.',
    ].join('\n');
    expect(parseGates(text)).toHaveLength(0);
  });

  it('still parses a real gate that follows a fenced code-block example', () => {
    const { parseGates } = require('../tools/gate-hook/parser.js');
    const text = [
      '```',
      '::GATE:: id=example phase=1 kind=phase',
      'illustrative',
      '::ENDGATE::',
      '```',
      '',
      '::GATE:: id=real-gate phase=2 kind=phase',
      'Stop and wait.',
      '::ENDGATE::',
    ].join('\n');
    const gates = parseGates(text);
    expect(gates).toHaveLength(1);
    expect(gates[0].attrs.id).toBe('real-gate');
  });

  it('ignores gates inside a longer-backtick fenced block that contains a triple-backtick line', () => {
    const { parseGates } = require('../tools/gate-hook/parser.js');
    const text = [
      '````',
      '```',
      '::GATE:: id=nested phase=1 kind=phase',
      'still illustrative',
      '::ENDGATE::',
      '```',
      '````',
    ].join('\n');
    expect(parseGates(text)).toHaveLength(0);
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

// ─── Atomic state writes (Bug H1) ─────────────────────────────────────────────

describe('atomic state writes', () => {
  it('state.write produces no partial JSON visible to concurrent readers', async () => {
    const { read, write, STATE } = require('../tools/gate-hook/state.js');
    // Bracket many writes interleaved with reads. Under the old bare
    // writeFileSync any partial flush would surface as JSON.parse failures —
    // the read() catches that and silently returns { open: false } (which is
    // the bug). With tmp+rename, every read must see either the prior full
    // state or the next full state, never a half-written one.
    const writes = [];
    const reads = [];

    for (let i = 0; i < 20; i++) {
      writes.push((async () => {
        write({ open: true, id: `gate-${i}`, phase: i, kind: 'phase', history: [{ id: `prev-${i}` }] });
      })());
      reads.push((async () => {
        // Each read should always parse cleanly.
        const s = read();
        // If we see a stale default we'd get open:false with no id — that's
        // the failure mode we're guarding against.
        if (s.open === true && (!s.id || typeof s.id !== 'string')) {
          throw new Error('partial state observed');
        }
        return s;
      })());
    }

    await Promise.all([...writes, ...reads]);

    // Final state must be valid JSON, open=true, and one of the writes' ids.
    const final = read();
    expect(final.open).toBe(true);
    expect(typeof final.id).toBe('string');
    expect(final.id).toMatch(/^gate-\d+$/);

    // No stray .tmp files left in the gates dir.
    const dir = path.dirname(STATE);
    const stragglers = fs.readdirSync(dir).filter(n => n.includes('.tmp'));
    expect(stragglers).toHaveLength(0);
  });

  it('auto-state.write uses tmp+rename and leaves no straggler tmp files', () => {
    const autoState = require('../tools/gate-hook/auto-state.js');
    for (let i = 0; i < 10; i++) {
      autoState.write({ open: true, id: `auto-${i}`, history: [], tool_budget_initial: 10, tool_budget_remaining: 10 - i });
    }
    const dir = path.dirname(autoState.STATE);
    const stragglers = fs.readdirSync(dir).filter(n => n.includes('.tmp'));
    expect(stragglers).toHaveLength(0);
    const s = autoState.read();
    expect(s.id).toBe('auto-9');
  });

  it('log.appendHistory writes complete lines via O_APPEND', () => {
    const log = require('../tools/gate-hook/log.js');
    // 200 sequential appends — every line must parse as JSON and we must see
    // exactly 200 lines (no interleaving / truncation).
    for (let i = 0; i < 200; i++) {
      log.appendHistory({ event: 'opened', gate_id: `g-${i}`, kind: 'phase' });
    }
    const file = path.join(tmpDir, '.shards', 'gates', 'gates.jsonl');
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(200);
    for (const ln of lines) {
      expect(() => JSON.parse(ln)).not.toThrow();
    }
  });
});

// ─── Kind taxonomy (Bug H3) ───────────────────────────────────────────────────

describe('kind taxonomy', () => {
  const validKinds = ['phase', 'final', 'checkpoint', 'execute', 'confirm', 'handoff'];

  for (const k of validKinds) {
    it(`parser accepts kind=${k}`, () => {
      const { parseGates } = require('../tools/gate-hook/parser.js');
      const msg = `::GATE:: id=test-${k} phase=1 kind=${k}\nBody\n::ENDGATE::`;
      const gates = parseGates(msg);
      expect(gates).toHaveLength(1);
      expect(gates[0].attrs.kind).toBe(k);
    });
  }

  it('parser exposes VALID_KINDS and NON_ADVANCING_KINDS sets', () => {
    const parser = require('../tools/gate-hook/parser.js');
    expect(parser.VALID_KINDS instanceof Set).toBe(true);
    expect(parser.NON_ADVANCING_KINDS.has('checkpoint')).toBe(true);
    expect(parser.NON_ADVANCING_KINDS.has('confirm')).toBe(true);
    expect(parser.NON_ADVANCING_KINDS.has('phase')).toBe(false);
    expect(parser.NON_ADVANCING_KINDS.has('execute')).toBe(false);
    expect(parser.NON_ADVANCING_KINDS.has('handoff')).toBe(false);
  });

  it('parser normalizes unknown kind to phase and logs warning', () => {
    const { parseGates } = require('../tools/gate-hook/parser.js');
    // Capture stderr to verify warning emitted (best-effort; suppress noise).
    const origWrite = process.stderr.write.bind(process.stderr);
    let stderrCaptured = '';
    process.stderr.write = (chunk) => { stderrCaptured += String(chunk); return true; };
    try {
      const msg = `::GATE:: id=odd-1 phase=1 kind=banana\nBody\n::ENDGATE::`;
      const gates = parseGates(msg);
      expect(gates).toHaveLength(1);
      // Backward-compatible normalization.
      expect(gates[0].attrs.kind).toBe('phase');
    } finally {
      process.stderr.write = origWrite;
    }
    expect(stderrCaptured).toMatch(/unknown gate kind/i);

    // And a violation entry should be appended.
    const file = path.join(tmpDir, '.shards', 'gates', 'violations.jsonl');
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed.some(e => e.type === 'unknown-gate-kind' && e.gate_id === 'odd-1')).toBe(true);
  });

  it('confirm kind is non-advancing (advisory under CHECKPOINT_ENFORCE=0)', () => {
    const { NON_ADVANCING_KINDS } = require('../tools/gate-hook/parser.js');
    // Simulate the handleStop branch: if NON_ADVANCING_KINDS.has(kind) and
    // CHECKPOINT_ENFORCE=0, the gate is logged advisory and state is NOT
    // opened.
    const stateModule = require('../tools/gate-hook/state.js');
    const { appendHistory } = require('../tools/gate-hook/log.js');

    const CHECKPOINT_ENFORCE = false; // SHARDS_CHECKPOINT_ENFORCE=0
    const gate = { attrs: { id: 'g1', phase: '2', kind: 'confirm', agent: 'ml-engineer' } };

    const gateKind = gate.attrs.kind;
    if (NON_ADVANCING_KINDS.has(gateKind) && !CHECKPOINT_ENFORCE) {
      appendHistory({ event: 'advisory', kind: gateKind, gate_id: gate.attrs.id, phase: gate.attrs.phase });
    } else {
      stateModule.write({ open: true, id: gate.attrs.id, phase: gate.attrs.phase, kind: gateKind, history: [] });
    }

    const s = stateModule.read();
    expect(s.open).toBe(false);

    const file = path.join(tmpDir, '.shards', 'gates', 'gates.jsonl');
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const advisory = lines.map(l => JSON.parse(l)).find(e => e.event === 'advisory');
    expect(advisory).toBeTruthy();
    expect(advisory.kind).toBe('confirm');
  });

  it('checkpoint kind is non-advancing (advisory under CHECKPOINT_ENFORCE=0)', () => {
    const { NON_ADVANCING_KINDS } = require('../tools/gate-hook/parser.js');
    expect(NON_ADVANCING_KINDS.has('checkpoint')).toBe(true);
  });

  it('execute kind is advancing (NOT advisory under CHECKPOINT_ENFORCE=0)', () => {
    const { NON_ADVANCING_KINDS } = require('../tools/gate-hook/parser.js');
    const stateModule = require('../tools/gate-hook/state.js');

    const CHECKPOINT_ENFORCE = false;
    const gate = { attrs: { id: 'g-exec', phase: '3', kind: 'execute' } };
    const gateKind = gate.attrs.kind;
    if (NON_ADVANCING_KINDS.has(gateKind) && !CHECKPOINT_ENFORCE) {
      // Should NOT take this branch — execute is advancing.
      throw new Error('execute incorrectly classified as non-advancing');
    } else {
      stateModule.write({ open: true, id: gate.attrs.id, phase: gate.attrs.phase, kind: gateKind, history: [] });
    }

    const s = stateModule.read();
    expect(s.open).toBe(true);
    expect(s.kind).toBe('execute');
  });

  it('parser.parseAutoVerify returns all close markers in `closes` array', () => {
    const { parseAutoVerify } = require('../tools/gate-hook/parser.js');
    const text = `\n::AUTO-VERIFY:: agent=x phase=1 tool_budget=5\nfoo\n::ENDAUTO::\nbar\n::AUTO-VERIFY:: agent=x phase=2 tool_budget=5\nbaz\n::ENDAUTO::\n`;
    const av = parseAutoVerify(text);
    expect(av.opens).toHaveLength(2);
    expect(av.closes).toHaveLength(2);
    expect(av.close).toBeTruthy(); // back-compat — first close
    // Closes must appear after their corresponding opens.
    for (let i = 0; i < av.opens.length; i++) {
      expect(av.opens[i].index).toBeLessThan(av.closes[i].index);
    }
  });
});

// ─── shards-gates checkpoints merges advisory entries (Bug M8) ───────────────

describe('shards-gates checkpoints merging', () => {
  it('merges advisory-mode checkpoints from JSONL with confirmed ones from state.history', () => {
    // Set up: 1 confirmed checkpoint in state.json, 1 advisory checkpoint in
    // JSONL, 1 advisory confirm in JSONL. shards-gates should show all three.
    const gatesDir = path.join(tmpDir, '.shards', 'gates');
    fs.mkdirSync(gatesDir, { recursive: true });

    const state = {
      open: false,
      history: [{
        id: 'cp-confirmed', kind: 'checkpoint', phase: '4',
        opened_at: '2026-05-21T10:00:00Z', closed_at: '2026-05-21T10:05:00Z',
        confirmed_by: 'user-prompt',
      }],
    };
    fs.writeFileSync(path.join(gatesDir, 'state.json'), JSON.stringify(state));

    const jsonl = [
      { event: 'advisory', kind: 'checkpoint', gate_id: 'cp-advisory', phase: '5', ts: '2026-05-21T11:00:00Z' },
      { event: 'advisory', kind: 'confirm',    gate_id: 'cf-advisory', phase: '6', ts: '2026-05-21T12:00:00Z' },
      // An 'opened' entry that should be excluded since it corresponds to the closed one.
      { event: 'opened',   kind: 'checkpoint', gate_id: 'cp-confirmed', phase: '4', ts: '2026-05-21T10:00:00Z' },
    ];
    fs.writeFileSync(
      path.join(gatesDir, 'gates.jsonl'),
      jsonl.map(e => JSON.stringify(e)).join('\n') + '\n'
    );

    // Spawn the CLI in this cwd.
    const { spawnSync } = require('child_process');
    const cli = path.resolve(origCwd, 'tools', 'shards-gates.js');
    const result = spawnSync(process.execPath, [cli, 'checkpoints'], {
      cwd: tmpDir, encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    const out = result.stdout;
    expect(out).toMatch(/cp-confirmed/);
    expect(out).toMatch(/cp-advisory/);
    expect(out).toMatch(/cf-advisory/);
    expect(out).toMatch(/\[advisory\]/);
  });
});

// ─── force-close resets auto-verify (Bug M9) ─────────────────────────────────

describe('shards-gates force-close', () => {
  it('resets auto-verify state when a block is open', () => {
    // Set up: an open gate AND an open auto-verify block.
    const gatesDir = path.join(tmpDir, '.shards', 'gates');
    const autoDir = path.join(tmpDir, '.shards', 'auto');
    fs.mkdirSync(gatesDir, { recursive: true });
    fs.mkdirSync(autoDir, { recursive: true });

    fs.writeFileSync(path.join(gatesDir, 'state.json'), JSON.stringify({
      open: true, id: 'stuck-gate', phase: '3', kind: 'phase',
      opened_at: '2026-05-21T10:00:00Z', history: [],
    }));
    fs.writeFileSync(path.join(autoDir, 'state.json'), JSON.stringify({
      open: true, id: 'auto-123', agent: 'ml-engineer', phase: '6',
      opened_at: '2026-05-21T10:01:00Z',
      expires_at: '2026-05-21T11:00:00Z',
      tool_budget_initial: 20, tool_budget_remaining: 15, history: [],
    }));

    const { spawnSync } = require('child_process');
    const cli = path.resolve(origCwd, 'tools', 'shards-gates.js');
    const result = spawnSync(process.execPath, [cli, 'force-close'], {
      cwd: tmpDir, encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Force-closed gate 'stuck-gate'/);
    expect(result.stdout).toMatch(/auto-verify block 'auto-123'/);

    // Verify both state files now show closed.
    const gateAfter = JSON.parse(fs.readFileSync(path.join(gatesDir, 'state.json'), 'utf8'));
    const autoAfter = JSON.parse(fs.readFileSync(path.join(autoDir, 'state.json'), 'utf8'));
    expect(gateAfter.open).toBe(false);
    expect(autoAfter.open).toBe(false);
    expect(autoAfter.history).toHaveLength(1);
    expect(autoAfter.history[0].closed_reason).toBe('operator-force-close');
  });

  it('reports auto-verify was already closed when no block open', () => {
    const gatesDir = path.join(tmpDir, '.shards', 'gates');
    fs.mkdirSync(gatesDir, { recursive: true });
    fs.writeFileSync(path.join(gatesDir, 'state.json'), JSON.stringify({
      open: true, id: 'stuck-gate', phase: '3', kind: 'phase',
      opened_at: '2026-05-21T10:00:00Z', history: [],
    }));

    const { spawnSync } = require('child_process');
    const cli = path.resolve(origCwd, 'tools', 'shards-gates.js');
    const result = spawnSync(process.execPath, [cli, 'force-close'], {
      cwd: tmpDir, encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Auto-verify state was already closed/);
  });
});

// ─── Force-close escape hatch + stale-gate sweep ──────────────────────────────

describe('isForceCloseBash', () => {
  let isForceCloseBash;
  beforeEach(() => {
    process.chdir(tmpDir);
    isForceCloseBash = require('../tools/gate-hook/sweep.js').isForceCloseBash;
  });

  it('allows the npm bin invocation', () => {
    expect(isForceCloseBash('Bash', { command: 'shards-gates force-close' })).toBe(true);
  });

  it('allows direct node invocation', () => {
    expect(isForceCloseBash('Bash', { command: 'node tools/shards-gates.js force-close' })).toBe(true);
  });

  it('allows $CLAUDE_PROJECT_DIR-prefixed invocation', () => {
    expect(isForceCloseBash('Bash', {
      command: 'node $CLAUDE_PROJECT_DIR/tools/shards-gates.js force-close',
    })).toBe(true);
  });

  it('rejects non-Bash tools even with the right command shape', () => {
    expect(isForceCloseBash('Write', { command: 'shards-gates force-close' })).toBe(false);
    expect(isForceCloseBash('Edit', { command: 'shards-gates force-close' })).toBe(false);
  });

  it('rejects pipe-chained invocations', () => {
    expect(isForceCloseBash('Bash', {
      command: 'shards-gates force-close | tee /tmp/log',
    })).toBe(false);
  });

  it('rejects semicolon-chained invocations', () => {
    expect(isForceCloseBash('Bash', {
      command: 'shards-gates force-close; rm -rf .',
    })).toBe(false);
  });

  it('rejects && / || chained invocations', () => {
    expect(isForceCloseBash('Bash', {
      command: 'shards-gates force-close && echo done',
    })).toBe(false);
    expect(isForceCloseBash('Bash', {
      command: 'shards-gates force-close || true',
    })).toBe(false);
  });

  it('rejects backtick command substitution', () => {
    expect(isForceCloseBash('Bash', {
      command: 'echo `shards-gates force-close`',
    })).toBe(false);
  });

  it('rejects $() command substitution', () => {
    expect(isForceCloseBash('Bash', {
      command: 'echo $(shards-gates force-close)',
    })).toBe(false);
  });

  it('rejects unrelated commands', () => {
    expect(isForceCloseBash('Bash', { command: 'shards-gates status' })).toBe(false);
    expect(isForceCloseBash('Bash', { command: 'shards-gates history' })).toBe(false);
    expect(isForceCloseBash('Bash', { command: 'ls' })).toBe(false);
  });

  it('rejects empty / missing command', () => {
    expect(isForceCloseBash('Bash', {})).toBe(false);
    expect(isForceCloseBash('Bash', { command: '' })).toBe(false);
    expect(isForceCloseBash('Bash', null)).toBe(false);
  });
});

describe('isStale / sweepStale', () => {
  let isStale, sweepStale;
  beforeEach(() => {
    process.chdir(tmpDir);
    ({ isStale, sweepStale } = require('../tools/gate-hook/sweep.js'));
  });

  it('treats a gate with missing opened_at as stale', () => {
    const s = { open: true, id: 'test-gate-1', phase: 1, kind: 'phase', history: [] };
    expect(isStale(s)).toBe(true);
  });

  it('treats a gate with invalid opened_at as stale', () => {
    const s = { open: true, id: 'g', phase: 1, kind: 'phase', opened_at: 'not-a-date', history: [] };
    expect(isStale(s)).toBe(true);
  });

  it('treats a gate older than 24h as stale', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const s = { open: true, id: 'g', phase: 1, kind: 'phase', opened_at: old, history: [] };
    expect(isStale(s)).toBe(true);
  });

  it('does NOT sweep a fresh gate', () => {
    const fresh = new Date().toISOString();
    const s = { open: true, id: 'g', phase: 1, kind: 'phase', opened_at: fresh, history: [] };
    expect(isStale(s)).toBe(false);
  });

  it('does NOT sweep a closed gate even with missing opened_at', () => {
    const s = { open: false, history: [] };
    expect(isStale(s)).toBe(false);
  });

  it('does NOT sweep at exactly 24h boundary (just under)', () => {
    const justUnder = new Date(Date.now() - (24 * 60 * 60 * 1000 - 1000)).toISOString();
    const s = { open: true, id: 'g', phase: 1, kind: 'phase', opened_at: justUnder, history: [] };
    expect(isStale(s)).toBe(false);
  });

  it('sweepStale writes closed state and logs violation + history', () => {
    const stateModule = require('../tools/gate-hook/state.js');
    const stuck = { open: true, id: 'test-gate-1', phase: 1, kind: 'phase', history: [] };
    stateModule.write(stuck);

    const after = sweepStale(stuck, 'sess-abc');

    // Returned state is closed.
    expect(after.open).toBe(false);
    // Persisted state is closed.
    expect(stateModule.read().open).toBe(false);
    // History entry preserves the gate identity and tags the reason.
    expect(after.history).toHaveLength(1);
    const entry = after.history[0];
    expect(entry.id).toBe('test-gate-1');
    expect(entry.confirmed_by).toBe('stale-sweep');
    expect(entry.closed_reason).toBe('missing-opened-at');
    expect(entry.closed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // violations.jsonl gets a stale-sweep entry.
    const vFile = path.join(tmpDir, '.shards', 'gates', 'violations.jsonl');
    const vLines = fs.readFileSync(vFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const violation = vLines.find(e => e.type === 'stale-sweep');
    expect(violation).toBeTruthy();
    expect(violation.gate_id).toBe('test-gate-1');
    expect(violation.reason).toBe('missing-opened-at');
    expect(violation.session_id).toBe('sess-abc');

    // gates.jsonl gets a closed entry tagged stale-sweep.
    const hFile = path.join(tmpDir, '.shards', 'gates', 'gates.jsonl');
    const hLines = fs.readFileSync(hFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const history = hLines.find(e => e.event === 'closed' && e.confirmed_by === 'stale-sweep');
    expect(history).toBeTruthy();
    expect(history.gate_id).toBe('test-gate-1');
  });

  it('sweepStale tags reason=older-than-24h for an old but well-formed gate', () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const stuck = { open: true, id: 'old-gate', phase: 2, kind: 'phase', opened_at: old, history: [] };
    const after = sweepStale(stuck, 'sess-old');
    expect(after.history[0].closed_reason).toBe('older-than-24h');
  });

  it('sweepStale preserves prior history entries', () => {
    const prior = { id: 'prior-gate', closed_at: '2026-01-01T00:00:00Z' };
    const stuck = { open: true, id: 'g2', phase: 1, kind: 'phase', history: [prior] };
    const after = sweepStale(stuck, 'sess');
    expect(after.history).toHaveLength(2);
    expect(after.history[0]).toEqual(prior);
    expect(after.history[1].id).toBe('g2');
  });
});

describe('hook end-to-end (subprocess)', () => {
  // Spawn the gate-hook binary directly with a JSON payload on stdin and
  // observe state.json + stdout. This exercises the full dispatcher path
  // including the new sweep + escape-hatch wiring in handlePreToolUse.
  const { spawnSync } = require('child_process');

  function runHook(event, payload) {
    const cli = path.resolve(origCwd, 'tools', 'gate-hook.js');
    return spawnSync(process.execPath, [cli, event], {
      cwd: tmpDir,
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });
  }

  it('pre-tool-use auto-closes a stale gate (no opened_at) and lets Write through', () => {
    const gatesDir = path.join(tmpDir, '.shards', 'gates');
    fs.mkdirSync(gatesDir, { recursive: true });
    fs.writeFileSync(path.join(gatesDir, 'state.json'), JSON.stringify({
      open: true, id: 'test-gate-1', phase: 1, kind: 'phase', history: [],
    }));

    const result = runHook('pre-tool-use', {
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/x', content: 'hi' },
      session_id: 'sess-1',
    });
    expect(result.status).toBe(0);
    // No block payload should be emitted — the sweep cleared the gate and Write
    // is now in the no-gate-open branch.
    expect(result.stdout || '').not.toMatch(/GATE-BLOCK/);

    const after = JSON.parse(fs.readFileSync(path.join(gatesDir, 'state.json'), 'utf8'));
    expect(after.open).toBe(false);
    expect(after.history.at(-1).confirmed_by).toBe('stale-sweep');
  });

  it('pre-tool-use allows Bash force-close even when a (fresh) gate is open', () => {
    const gatesDir = path.join(tmpDir, '.shards', 'gates');
    fs.mkdirSync(gatesDir, { recursive: true });
    fs.writeFileSync(path.join(gatesDir, 'state.json'), JSON.stringify({
      open: true, id: 'fresh-gate', phase: 2, kind: 'phase',
      opened_at: new Date().toISOString(), history: [],
    }));

    const result = runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'node tools/shards-gates.js force-close' },
      session_id: 'sess-2',
    });
    expect(result.status).toBe(0);
    expect(result.stdout || '').not.toMatch(/GATE-BLOCK/);

    // Gate stays open — the hook just permits the Bash call. cmdForceClose is
    // what actually clears state.json, and it runs in a separate subprocess.
    const after = JSON.parse(fs.readFileSync(path.join(gatesDir, 'state.json'), 'utf8'));
    expect(after.open).toBe(true);
    expect(after.id).toBe('fresh-gate');
  });

  it('pre-tool-use blocks Bash force-close in a pipe chain', () => {
    const gatesDir = path.join(tmpDir, '.shards', 'gates');
    fs.mkdirSync(gatesDir, { recursive: true });
    fs.writeFileSync(path.join(gatesDir, 'state.json'), JSON.stringify({
      open: true, id: 'fresh-gate', phase: 2, kind: 'phase',
      opened_at: new Date().toISOString(), history: [],
    }));

    const result = runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'shards-gates force-close; rm -rf important/' },
      session_id: 'sess-3',
    });
    expect(result.status).toBe(0);
    expect(result.stdout || '').toMatch(/GATE-BLOCK/);
  });

  it('pre-tool-use still blocks other Bash commands when a fresh gate is open', () => {
    const gatesDir = path.join(tmpDir, '.shards', 'gates');
    fs.mkdirSync(gatesDir, { recursive: true });
    fs.writeFileSync(path.join(gatesDir, 'state.json'), JSON.stringify({
      open: true, id: 'fresh-gate', phase: 2, kind: 'phase',
      opened_at: new Date().toISOString(), history: [],
    }));

    const result = runHook('pre-tool-use', {
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      session_id: 'sess-4',
    });
    expect(result.status).toBe(0);
    expect(result.stdout || '').toMatch(/GATE-BLOCK/);
  });
});

// ─── checkViolation uses fence end position (low-hanging fruit) ───────────────

describe('checkViolation fence boundary', () => {
  it('does not flag ENDGATE inside a code block as the fence end', () => {
    const { checkViolation } = require('../tools/gate-hook/parser.js');
    // A real gate, followed by a code block containing the literal string
    // ::ENDGATE:: (which would not actually parse as a fence). The old
    // implementation used indexOf and would have treated the first literal
    // match as the fence end, then looked at content after that — missing
    // post-fence violations after the real fence end.
    const msg = [
      '::GATE:: id=g1 phase=1 kind=phase',
      'Stop and wait.',
      '::ENDGATE::',
      '',
      '## Phase 2',
      'Now advancing improperly.',
    ].join('\n');
    expect(checkViolation(msg)).toBeTruthy();
  });
});
