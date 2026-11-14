// Validation section parser + checker for the gate hook.
// Implements src/agents/specific_instructions/shared/validation_protocol.md
// and tools/gate-hook/VALIDATION_SPEC.md.
'use strict';

const fs = require('fs');
const path = require('path');

const VALID_TRACKS = new Set(['quick', 'deep', 'fixer']);
const VALID_PASS_FAIL = new Set(['✓', '✗', 'n/a']);

// ─── Specs file resolution ───────────────────────────────────────────────────

// Shards projects live under convention directories — see CLAUDE.md output
// directory map. We search these for the most recently modified project-specs.md.
const PROJECT_DIRS = [
  'analysis', 'studies', 'models', 'data_models', 'services',
  'research', 'dashboards', 'brainstorm', 'fixes',
];

// Find the most recently modified project-specs.md in any immediate subdirectory
// of the conventional project dirs (e.g. analysis/*/project-specs.md).
function findLatestSpecs(root) {
  let best = null;
  let bestMtime = 0;
  for (const d of PROJECT_DIRS) {
    const base = path.join(root, d);
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const candidate = path.join(base, e.name, 'project-specs.md');
      try {
        const st = fs.statSync(candidate);
        if (st.mtimeMs > bestMtime) {
          bestMtime = st.mtimeMs;
          best = candidate;
        }
      } catch {
        // no specs file here — skip
      }
    }
  }
  return best;
}

function specsPath() {
  if (process.env.SHARDS_PROJECT_SPECS_PATH) {
    return process.env.SHARDS_PROJECT_SPECS_PATH;
  }
  // Backward-compatible: prefer a specs file at CWD if one exists.
  const cwdPath = path.join(process.cwd(), 'project-specs.md');
  try {
    fs.accessSync(cwdPath, fs.constants.R_OK);
    return cwdPath;
  } catch {
    // Not at CWD — search conventional project subdirectories.
  }
  return findLatestSpecs(process.cwd()) || cwdPath;
}

function readSpecs() {
  try {
    return fs.readFileSync(specsPath(), 'utf8');
  } catch {
    return null;
  }
}

// ─── Section extraction ──────────────────────────────────────────────────────

// Return the body of the LAST `## Validation` section in the file.
// A section body runs from the heading line to the next `## ` heading or EOF.
function extractValidationBody(content) {
  if (!content) return null;
  const lines = content.split('\n');
  let lastStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Validation\s*$/.test(lines[i])) lastStart = i;
  }
  if (lastStart === -1) return null;

  let end = lines.length;
  for (let i = lastStart + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(lastStart + 1, end).join('\n');
}

// Extract the body of a `### <heading>` subsection within the validation body.
function extractSubsection(body, heading) {
  if (!body) return null;
  const lines = body.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp('^###\\s+' + heading.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\s*$').test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###\s+/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

function hasSubsectionHeading(body, heading) {
  if (!body) return false;
  return new RegExp('^###\\s+' + heading.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\s*$', 'm').test(body);
}

// ─── Field parsers ───────────────────────────────────────────────────────────

function matchOne(body, re) {
  if (!body) return null;
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function modePresent(body) {
  if (!body) return false;
  return /^\*\*Mode:\*\*/m.test(body);
}

// Parse a markdown pipe table. Returns array of row objects keyed by header name (lowercased, trimmed).
// Skips separator row (|---|---|).
function parsePipeTable(section) {
  if (!section) return [];
  const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const tableLines = lines.filter(l => l.startsWith('|'));
  if (tableLines.length < 2) return [];

  const header = tableLines[0]
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(c => c.trim().toLowerCase());

  // The next line should be the separator row — skip it if it's all dashes.
  const dataStart = /^\|[-\s|:]+\|?$/.test(tableLines[1]) ? 2 : 1;

  const rows = [];
  for (let i = dataStart; i < tableLines.length; i++) {
    const cells = tableLines[i]
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(c => c.trim());
    if (cells.length !== header.length) continue;
    const row = {};
    header.forEach((h, idx) => { row[h] = cells[idx]; });
    rows.push(row);
  }
  return rows;
}

// Parse a bulleted list, return array of bullet texts (trimmed).
// Accepts `- ` or `* ` prefix.
function parseBullets(section) {
  if (!section) return [];
  return section
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^[-*]\s+/.test(l))
    .map(l => l.replace(/^[-*]\s+/, '').trim());
}

function nonWhitespaceLength(s) {
  if (!s) return 0;
  return s.replace(/\s+/g, '').length;
}

// ─── Top-level parse + check ─────────────────────────────────────────────────

function parseValidationSection(content) {
  const body = extractValidationBody(content);
  if (body === null) return { present: false };

  const evidence = extractSubsection(body, 'Evidence');
  const artifacts = extractSubsection(body, 'Artifacts');
  const downstream = extractSubsection(body, 'Downstream Impact');
  const openIssues = hasSubsectionHeading(body, 'Open Issues');
  const summary = extractSubsection(body, 'Summary');

  return {
    present: true,
    // Anchor each field match to the same line as the label — otherwise
    // \s* would greedily consume newlines and swallow subsequent lines
    // when the label's value is empty.
    track: matchOne(body, /\*\*Track:\*\*[^\S\n]*(quick|deep|fixer)\b/i),
    modeLinePresent: modePresent(body),
    mode: matchOne(body, /\*\*Mode:\*\*[^\S\n]*([^\n]+)/),
    checklist: matchOne(body, /\*\*Checklist:\*\*[^\S\n]*([^\n]+validation_checklist\.md)/),
    appliedAt: matchOne(body, /\*\*Applied at:\*\*[^\S\n]*([^\n]+)/),
    evidenceRows: parsePipeTable(evidence),
    artifactBullets: parseBullets(artifacts),
    downstreamBullets: parseBullets(downstream),
    openIssuesHeadingPresent: openIssues,
    summaryLength: nonWhitespaceLength(summary),
  };
}

function checkValidation(parsed) {
  const errors = [];
  if (!parsed.present) return [{ code: 'MISSING_SECTION' }];

  if (!parsed.track || !VALID_TRACKS.has(parsed.track.toLowerCase())) {
    errors.push({ code: 'MISSING_TRACK' });
  }

  // Mode: optional. If the line is present, value must be non-empty.
  if (parsed.modeLinePresent && (!parsed.mode || !parsed.mode.trim())) {
    errors.push({ code: 'EMPTY_MODE' });
  }

  if (!parsed.checklist) errors.push({ code: 'MISSING_CHECKLIST' });

  if (parsed.evidenceRows.length === 0) {
    errors.push({ code: 'NO_EVIDENCE_ROWS' });
  } else {
    for (let i = 0; i < parsed.evidenceRows.length; i++) {
      const row = parsed.evidenceRows[i];
      const check = (row.check || '').trim();
      const expected = (row.expected || '').trim();
      const observed = (row.observed || '').trim();
      const passFail = (row['pass/fail'] || row.passfail || '').trim();
      const notes = (row.notes || '').trim();

      if (!check || !expected || !observed) {
        errors.push({ code: 'INCOMPLETE_EVIDENCE_ROW', row: i + 1 });
        continue;
      }
      if (!VALID_PASS_FAIL.has(passFail)) {
        errors.push({ code: 'INVALID_PASS_FAIL', row: i + 1, got: passFail });
        continue;
      }
      if (passFail === 'n/a' && !notes) {
        errors.push({ code: 'NA_WITHOUT_JUSTIFICATION', row: i + 1 });
      }
    }
  }

  if (parsed.artifactBullets.length === 0) errors.push({ code: 'NO_ARTIFACTS' });
  if (parsed.downstreamBullets.length === 0) errors.push({ code: 'NO_DOWNSTREAM' });
  if (parsed.summaryLength < 20) {
    errors.push({ code: 'SUMMARY_TOO_SHORT', length: parsed.summaryLength });
  }

  return errors;
}

// ─── Error formatting ────────────────────────────────────────────────────────

const ERROR_DESCRIPTIONS = {
  MISSING_SECTION: 'No `## Validation` heading found in project-specs.md',
  MISSING_TRACK: '`**Track:**` line missing or value is not quick/deep/fixer',
  EMPTY_MODE: '`**Mode:**` line present but value is blank (omit the line entirely if Mode is not meaningful)',
  MISSING_CHECKLIST: '`**Checklist:**` line missing or doesn\'t reference a `validation_checklist.md`',
  NO_EVIDENCE_ROWS: 'Evidence table has zero data rows',
  INCOMPLETE_EVIDENCE_ROW: 'A row has an empty Check, Expected, or Observed cell',
  INVALID_PASS_FAIL: 'A row\'s Pass/Fail value is not one of ✓, ✗, or n/a',
  NA_WITHOUT_JUSTIFICATION: 'A row has `Pass/Fail: n/a` but the Notes cell is empty',
  NO_ARTIFACTS: 'Artifacts section has no bullets (use `- none (see Summary)` to override intentionally)',
  NO_DOWNSTREAM: 'Downstream Impact section has no bullets',
  SUMMARY_TOO_SHORT: 'Summary has fewer than 20 non-whitespace characters',
};

function describe(err) {
  const base = ERROR_DESCRIPTIONS[err.code] || err.code;
  if (err.row) return `row ${err.row}: ${base}${err.got ? ` (got: "${err.got}")` : ''}`;
  return base;
}

function formatValidationError(checklist, gate, errors) {
  const lines = [
    '::GATE-BLOCK:: Validation evidence is missing or incomplete.',
    '',
    `Required checklist: ${checklist}/validation_checklist.md`,
    `Gate: ${gate.id} (phase ${gate.phase || '?'}, kind ${gate.kind || '?'})`,
    '',
    'Problems:',
    ...errors.map(e => `  - ${e.code}: ${describe(e)}`),
    '',
    'What to do:',
    '  1. Re-read .claude/agents/specific_instructions/shared/validation_protocol.md',
    '     for the required `## Validation` section schema.',
    `  2. Re-read .claude/agents/specific_instructions/${checklist}/validation_checklist.md`,
    '     for the domain-specific checks.',
    '  3. Run the checks, record observed values in the Evidence table, and',
    '     re-emit the gate fence.',
    '',
    'If this phase should not require validation, remove the `validates=...`',
    'attribute from the gate fence.',
  ];
  return lines.join('\n');
}

module.exports = {
  parseValidationSection,
  checkValidation,
  formatValidationError,
  readSpecs,
  // Exported for tests
  _internals: {
    extractValidationBody,
    extractSubsection,
    parsePipeTable,
    parseBullets,
    nonWhitespaceLength,
    VALID_TRACKS,
    VALID_PASS_FAIL,
    ERROR_DESCRIPTIONS,
  },
};
