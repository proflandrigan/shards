'use strict';
const { defineTool } = require('../registry');
const nb = require('../notebook');

module.exports = defineTool({
  name: 'notebook_exec',
  description: 'Execute one cell (0-based index) of a started notebook session against its live kernel.',
  sessionless: true,
  inputSchema: { type: 'object', properties: { session: { type: 'string', minLength: 1 }, cell: { type: 'integer', minimum: 0 } }, required: ['session', 'cell'], additionalProperties: false },
  async handler(args, ctx) {
    nb.validateSession(args.session);
    const python = nb.preparePython(ctx.notebookOpts);
    return { data: await nb.runKernel(python, ctx.root, ['exec', args.session, String(args.cell)], { ...(ctx.notebookOpts || {}), timeout: 600000 }) };
  },
});
