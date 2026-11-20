'use strict';
// The operator command a user runs to confirm a gate from a terminal. Installed users (plugin,
// skills package, staged shards-mcp) have no cli/ next to the runtime, so the published npm
// form is primary; a repo checkout (runtime/ with a sibling cli/shards.js) also gets the local form.
const fs = require('fs');
const path = require('path');

// Keep in step with package.json name + publishConfig.tag (test/gates-confirm-command.test.js checks it).
const NPM_SPEC = '@proflandrigan/shards@next';

function localCli(runtimeDir = path.join(__dirname, '..')) {
  const p = path.resolve(runtimeDir, '..', 'cli', 'shards.js');
  try { return fs.statSync(p).isFile() ? p : null; } catch (_) { return null; }
}

const quote = (s) => (/[\s"'$`\\]/.test(s) ? JSON.stringify(s) : s);

function confirmArgs(gateId, sessionKey, changes) {
  return `gates confirm ${gateId} --session ${sessionKey}${changes ? ' --changes "<note>"' : ''}`;
}

// -> the npx command line (run from the project directory).
function confirmCommand(gateId, sessionKey, { changes = false } = {}) {
  return `npx ${NPM_SPEC} ${confirmArgs(gateId, sessionKey, changes)}`;
}

// -> the repo-checkout command line, or null when this runtime has no sibling cli/.
function localConfirmCommand(gateId, sessionKey, { changes = false, runtimeDir } = {}) {
  const cli = localCli(runtimeDir);
  return cli ? `node ${quote(cli)} ${confirmArgs(gateId, sessionKey, changes)}` : null;
}

// -> lines (indented two spaces) listing the operator commands, confirm and request-changes.
function operatorConfirmLines(gateId, sessionKey, { runtimeDir } = {}) {
  const lines = [
    `  ${confirmCommand(gateId, sessionKey)}`,
    `  ${confirmCommand(gateId, sessionKey, { changes: true })}`,
  ];
  const local = localConfirmCommand(gateId, sessionKey, { runtimeDir });
  if (local) lines.push('  (from this repo checkout:)', `  ${local}`, `  ${localConfirmCommand(gateId, sessionKey, { changes: true, runtimeDir })}`);
  lines.push('  Run it from the project directory (or add --root <project>).');
  return lines;
}

module.exports = { NPM_SPEC, localCli, confirmCommand, localConfirmCommand, operatorConfirmLines };
