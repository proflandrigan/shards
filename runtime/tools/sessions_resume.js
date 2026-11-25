'use strict';
const { defineTool } = require('../registry');
const ops = require('../sessions/ops');

module.exports = defineTool({
  name: 'sessions_resume',
  description: 'Look up a session by id (or unique prefix) and return its index entry plus per-host resume hints. Resume itself is host-side; this prints the command. Also reports the autonomous-research run of that session, if any.',
  inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1 } }, required: ['id'], additionalProperties: false },
  async handler(args, ctx) {
    const { entry, hints, host } = ops.resumeInfo(ctx.root, args.id);
    let ar = null;
    try {
      const fs = require('fs'); const path = require('path');
      const { StateStore } = require('../state/store');
      if (entry && entry.sessionId && fs.existsSync(path.join(ctx.root, '.shards', 'state', 'sessions', entry.sessionId))) {
        ar = require('../research').brief(new StateStore(ctx.root, entry.sessionId));
      }
    } catch (_) { ar = null; }
    const out = { entry, hints, host };
    if (ar) out.ar = { ...ar, hint: ar.status === 'ended' ? 'AR run ended.' : `AR run ${ar.run_id} is ${ar.status}: after resuming call ar_status({run_id:"${ar.run_id}", resume:true}).` };
    return { data: out };
  },
});
