'use strict';
const { defineTool } = require('../registry');
const nb = require('../notebook');

module.exports = defineTool({
  name: 'notebook_start',
  description: 'Start a persistent Jupyter kernel for a notebook (.ipynb inside the project). Generates a session id if none is given. Requires jupyter_client + ipykernel in the Python interpreter.',
  sessionless: true,
  inputSchema: { type: 'object', properties: { notebook: { type: 'string', minLength: 1 }, session: { type: 'string' } }, required: ['notebook'], additionalProperties: false },
  async handler(args, ctx) {
    const abs = nb.resolveNotebook(ctx.root, args.notebook);
    if (args.session !== undefined) nb.validateSession(args.session);
    const python = nb.preparePython(ctx.notebookOpts);
    const o = { ...(ctx.notebookOpts || {}) };
    let sid = args.session;
    if (!sid) {
      const r = await nb.runKernel(python, ctx.root, ['new-session'], o);
      sid = nb.validateSession(r.sessionId);
    }
    return { data: await nb.runKernel(python, ctx.root, ['start', sid, abs], { ...o, timeout: 120000 }) };
  },
});
