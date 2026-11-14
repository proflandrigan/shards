'use strict';
const { defineTool } = require('../registry');
const nb = require('../notebook');

module.exports = defineTool({
  name: 'notebook_run_all',
  description: 'Restart the kernel and execute every code cell top to bottom; stops at the first failure.',
  sessionless: true,
  inputSchema: { type: 'object', properties: { session: { type: 'string', minLength: 1 } }, required: ['session'], additionalProperties: false },
  async handler(args, ctx) {
    nb.validateSession(args.session);
    const python = nb.preparePython(ctx.notebookOpts);
    return { data: await nb.runKernel(python, ctx.root, ['run-all', args.session], { ...(ctx.notebookOpts || {}), timeout: 900000 }) };
  },
});
