#!/usr/bin/env node
'use strict';
// UserPromptSubmit recorder (E11.0). Appends the normalised prompt to
// <root>/.shards/state/sessions/<key>/prompts.jsonl under the store lock.
// Never blocks the prompt: no stdout, always exit 0. Never reads the host's session log.
const fs = require('fs');
const path = require('path');
const host = require('./lib/host');
const common = require('./lib/common');
const { StateStore, atomicWrite } = require('../runtime/state/store');

async function handler(n, root) {
  const key = host.toSessionKey(n.sessionId);
  if (!key || typeof n.prompt !== 'string') throw new Error('UserPromptSubmit payload missing session_id or prompt');
  const text = common.normalizeText(n.prompt);
  const store = new StateStore(root, key);
  await store.withLock(() => {
    fs.mkdirSync(store.sessionDir, { recursive: true });
    const hooks = store.read('hooks');
    const promptId = (Number.isInteger(hooks.promptSeq) ? hooks.promptSeq : 0) + 1;
    const rec = { v: 1, session_id: n.sessionId, prompt_id: promptId, ts: new Date().toISOString(), text, sha256: common.sha256(text), host: n.host };
    if (n.turnId) rec.turn_id = n.turnId;
    if (n.permissionMode) rec.permission_mode = n.permissionMode;
    fs.appendFileSync(path.join(store.sessionDir, 'prompts.jsonl'), JSON.stringify(rec) + '\n', 'utf8');
    atomicWrite(store.file('hooks'), JSON.stringify({ ...hooks, promptSeq: promptId, host: n.host }, null, 2));
  });
}

if (require.main === module) common.run('user-prompt-submit', handler, host);
module.exports = { handler };
