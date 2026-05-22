// Parse ::GATE:: ... ::ENDGATE:: fences from text
'use strict';

const path = require('path');

// Matches ::GATE:: <attrs>\n<body>\n::ENDGATE::
const FENCE = /^::GATE::\s+([^\n]+)\n([\s\S]*?)\n::ENDGATE::\s*$/gm;

// Authoritative kind enum. See CLAUDE.md "The gate pattern" section.
//   phase      — intermediate phase gate; advances phase on confirm.
//   final      — last phase of a track; advances phase on confirm.
//   checkpoint — mid-build component seam; does NOT advance phase. Advisory
//                under SHARDS_CHECKPOINT_ENFORCE=0.
//   execute    — runs an experiment/AR iteration; advances phase on confirm
//                (labeled "Execute gate").
//   confirm    — micro-confirmation checkpoint used in AR; does NOT advance
//                phase. Advisory under SHARDS_CHECKPOINT_ENFORCE=0.
//   handoff    — specialist-to-specialist transition; advances on confirm.
const VALID_KINDS = new Set(['phase', 'final', 'checkpoint', 'execute', 'confirm', 'handoff']);

// Kinds that behave like checkpoints (do not advance phase; advisory-eligible).
const NON_ADVANCING_KINDS = new Set(['checkpoint', 'confirm']);

function parseAttrs(line) {
  const out = {};
  for (const pair of line.trim().split(/\s+/)) {
    const [k, v] = pair.split('=');
    if (k && v) out[k] = v;
  }
  return out;
}

// Lazy require to avoid circular dependency on log.js (log.js does not require
// parser, but defensive). Falls back to stderr-only logging if log.js fails
// to load for any reason.
function logUnknownKind(kindRaw, attrs) {
  try {
    process.stderr.write(`[shards gate-hook] warning: unknown gate kind '${kindRaw}' on gate id='${attrs.id || '<unknown>'}' — normalizing to 'phase'\n`);
  } catch {}
  try {
    const { appendViolation } = require(path.join(__dirname, 'log.js'));
    appendViolation({
      type: 'unknown-gate-kind',
      gate_id: attrs.id || null,
      reason: `unknown gate kind '${kindRaw}' — normalized to 'phase'`,
    });
  } catch {
    // logging is best-effort
  }
}

// Validate and normalize the kind= attribute on a parsed gate. Unknown kinds
// are normalized to 'phase' (backward-compatible) and a warning is logged.
function normalizeKind(attrs) {
  const raw = attrs.kind;
  if (!raw) {
    attrs.kind = 'phase';
    return attrs;
  }
  if (VALID_KINDS.has(raw)) return attrs;
  // Unknown kind — warn + normalize.
  logUnknownKind(raw, attrs);
  attrs.kind = 'phase';
  return attrs;
}

// Pair-up ``` (or longer-backtick) lines into [start, end] character ranges so
// gate markers that only appear inside a quoted markdown code block don't open
// real gates. Without this, the assistant cannot quote a phase template or
// explain the gate pattern in this repo without tripping enforcement.
const CODE_FENCE_LINE = /^(`{3,})[^\n]*$/gm;

function findCodeBlockRanges(text) {
  const fences = [];
  CODE_FENCE_LINE.lastIndex = 0;
  let m;
  while ((m = CODE_FENCE_LINE.exec(text)) !== null) {
    fences.push({ start: m.index, end: m.index + m[0].length, ticks: m[1].length });
  }
  const ranges = [];
  let i = 0;
  while (i < fences.length) {
    const open = fences[i];
    // A closing fence must use the same number of backticks (CommonMark rule —
    // longer-tick fences nest shorter ones). Find the next fence with matching
    // tick count.
    let j = i + 1;
    while (j < fences.length && fences[j].ticks !== open.ticks) j++;
    if (j < fences.length) {
      ranges.push({ start: open.start, end: fences[j].end });
      i = j + 1;
    } else {
      // Unclosed fence — treat rest of doc as inside-code, conservative.
      ranges.push({ start: open.start, end: text.length });
      break;
    }
  }
  return ranges;
}

function isInsideAnyRange(idx, ranges) {
  for (const r of ranges) if (idx >= r.start && idx < r.end) return true;
  return false;
}

function parseGates(text) {
  const gates = [];
  const codeRanges = findCodeBlockRanges(text);
  FENCE.lastIndex = 0;
  let m;
  while ((m = FENCE.exec(text)) !== null) {
    if (isInsideAnyRange(m.index, codeRanges)) continue;
    const attrs = normalizeKind(parseAttrs(m[1]));
    gates.push({ attrs, body: m[2], raw: m[0], index: m.index, fenceEnd: m.index + m[0].length });
  }
  return gates;
}

// Violation heuristic: check for content after ::ENDGATE:: that looks like phase advance.
// Patterns must be phase-specific — generic forward-looking prose ("moving on to wrap up
// the docs") is a common legitimate sign-off and previously triggered false positives.
const PHASE_ADVANCE_PATTERNS = [
  /^##\s*Phase\s+\d+/im,
  /^Phase\s+\d+\b/im,
  /\bproceed(ing)?\s+to\s+phase\b/i,
  /\bmoving\s+on\s+to\s+(the\s+next\s+phase|phase\s+\d+)\b/i,
  /```(python|sql|bash)/i,
];

// Use the actual parsed fence end position so an ENDGATE token nested inside
// an unclosed code block (which the FENCE regex would not match as a real
// fence) does not confuse violation detection. Falls back to indexOf for
// backward compat when no gates parsed.
function checkViolation(fullMessage) {
  const gates = parseGates(fullMessage);
  let endIdx;
  if (gates.length > 0) {
    endIdx = gates[gates.length - 1].fenceEnd;
  } else {
    const literalIdx = fullMessage.indexOf('::ENDGATE::');
    if (literalIdx === -1) return null;
    endIdx = literalIdx + '::ENDGATE::'.length;
  }

  const postFence = fullMessage.slice(endIdx).trim();
  const wordCount = postFence.split(/\s+/).filter(Boolean).length;

  if (wordCount === 0) return null;
  if (wordCount > 40) return 'Post-fence content exceeds 40-word limit (' + wordCount + ' words)';

  for (const pattern of PHASE_ADVANCE_PATTERNS) {
    if (pattern.test(postFence)) {
      return 'Post-fence content matches phase-advance pattern: ' + pattern.toString();
    }
  }
  return null;
}

// ─── Auto-verify markers ─────────────────────────────────────────────────────
//
// Open marker: ::AUTO-VERIFY:: <attrs>          (single-line, no fence body)
// Close marker: ::ENDAUTO::                      (bare, no attrs)
//
// Example:
//   ::AUTO-VERIFY:: agent=data-modeller phase=6 tool_budget=20 ttl_minutes=10
//   ... read-only verification work ...
//   ::ENDAUTO::

const AUTO_OPEN = /^::AUTO-VERIFY::\s+([^\n]+)$/gm;
const AUTO_CLOSE = /^::ENDAUTO::\s*$/gm;

function parseAutoVerify(text) {
  const opens = [];
  AUTO_OPEN.lastIndex = 0;
  let m;
  while ((m = AUTO_OPEN.exec(text)) !== null) {
    opens.push({ attrs: parseAttrs(m[1]), index: m.index });
  }
  // Process all close markers in position order — the prior implementation
  // used .exec() which finds only the first, so a message with multiple
  // close markers (e.g. open-close-open-close in one assistant turn) would
  // miss the later closes.
  const closes = [];
  AUTO_CLOSE.lastIndex = 0;
  let cm;
  while ((cm = AUTO_CLOSE.exec(text)) !== null) {
    closes.push({ index: cm.index });
  }
  return {
    opens,
    closes,
    // Back-compat: keep `close` as the first close marker. Callers that need
    // all markers should use `closes`.
    close: closes.length > 0 ? closes[0] : null,
  };
}

module.exports = {
  parseGates,
  checkViolation,
  parseAutoVerify,
  parseAttrs,
  VALID_KINDS,
  NON_ADVANCING_KINDS,
};
