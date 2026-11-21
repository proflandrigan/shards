'use strict';
// Shared helpers for gates-tool / gates-validation / gates-cli tests.
const GOOD = {
  track: '**Track:** deep', mode: '**Mode:** build',
  checklist: '**Checklist:** analytics_engineer/validation_checklist.md',
  rows: ['| AE-01 | 10 rows | 10 rows | ✓ | |', '| AE-02 | 0 dupes | 0 dupes | ✓ | |'],
  artifacts: '- models/a.sql', downstream: '- none expected',
  summary: 'All checks passed against the warehouse and the grain is confirmed.',
};
function section(o = {}) {
  const c = { ...GOOD, ...o };
  const L = ['## Validation', ''];
  if (c.track) L.push(c.track);
  if (c.mode) L.push(c.mode);
  if (c.checklist) L.push(c.checklist);
  L.push('', '### Evidence', '| Check | Expected | Observed | Pass/Fail | Notes |', '|---|---|---|---|---|', ...c.rows, '');
  L.push('### Artifacts', ...(c.artifacts ? [c.artifacts] : []), '', '### Downstream Impact', ...(c.downstream ? [c.downstream] : []), '');
  L.push('### Summary', c.summary || '', '');
  return L.join('\n');
}
module.exports = { GOOD, section };
