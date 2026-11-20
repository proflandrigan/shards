'use strict';
const { defineTool } = require('../registry');
const nb = require('../notebook');

module.exports = defineTool({
  name: 'notebook_stop',
  description: 'Shut down the kernel for a notebook session and clean up.',
  sessionless: true,
  inputSchema: { type: 'object', properties: { session: { type: 'string', minLength: 1 } }, required: ['session'], additionalProperties: false },
  async handler(args, ctx) {
    nb.validateSession(args.session);
    const python = nb.preparePython(ctx.notebookOpts);
    return { data: nb.unwrap('notebook_stop', await nb.runKernel(python, ctx.root, ['stop', args.session], { ...(ctx.notebookOpts || {}), timeout: 60000 })) };
  },
});
