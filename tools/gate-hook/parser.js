// Parse ::GATE:: ... ::ENDGATE:: fences from text
'use strict';

// Matches ::GATE:: <attrs>\n<body>\n::ENDGATE::
const FENCE = /^::GATE::\s+([^\n]+)\n([\s\S]*?)\n::ENDGATE::\s*$/gm;

function parseAttrs(line) {
  const out = {};
  for (const pair of line.trim().split(/\s+/)) {
    const [k, v] = pair.split('=');
    if (k && v) out[k] = v;
  }
  return out;
}

function parseGates(text) {
  const gates = [];
  FENCE.lastIndex = 0;
  let m;
  while ((m = FENCE.exec(text)) !== null) {
    gates.push({ attrs: parseAttrs(m[1]), body: m[2], raw: m[0], index: m.index });
  }
  return gates;
}

// Violation heuristic: check for content after ::ENDGATE:: that looks like phase advance
const PHASE_ADVANCE_PATTERNS = [
  /^##\s*Phase\s+\d+/im,
  /^Phase\s+\d+\b/im,
  /\bproceed(ing)?\s+to\s+phase\b/i,
  /\bmoving\s+on\s+to\b/i,
  /```(python|sql|bash)/i,
];

function checkViolation(fullMessage) {
  const endgateIdx = fullMessage.indexOf('::ENDGATE::');
  if (endgateIdx === -1) return null;

  const postFence = fullMessage.slice(endgateIdx + '::ENDGATE::'.length).trim();
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

module.exports = { parseGates, checkViolation };
