'use strict';
// Single source for the Shards tool-call conventions text: build/assets/shards-conventions.md.
// Used by `shards install --claude-md` (marked CLAUDE.md block) and the shards-conventions skill.
const fs = require('fs');
const path = require('path');

const ASSET = path.join(__dirname, 'assets', 'shards-conventions.md');
const SKILL_DESCRIPTION = 'Shards tool-call conventions: which file writes, Bash commands and gate tool calls are routine in a Shards session and which are unusual. Use when judging whether an action in a Shards session is expected.';

function conventionsBody() { return fs.readFileSync(ASSET, 'utf8').replace(/\s+$/, '') + '\n'; }

function conventionsSkill() {
  return `---\nname: shards-conventions\ndescription: ${SKILL_DESCRIPTION}\n---\n\n${conventionsBody()}`;
}

module.exports = { conventionsBody, conventionsSkill, SKILL_DESCRIPTION };
