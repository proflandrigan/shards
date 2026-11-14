'use strict';
// Tool registry. Tools are plain definitions with JSON-Schema input; args are validated
// with ajv; every response (success, error, validation failure, unknown tool) starts
// with the state header block.
const Ajv = require('ajv');
const { buildHeader, headerInfoFromStore } = require('./header');
const { regroundHook } = require('./reground');

const ajv = new Ajv({ allErrors: true, strict: false });

function defineTool({ name, description, inputSchema, handler } = {}) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`defineTool: invalid name ${JSON.stringify(name)}`);
  if (typeof description !== 'string' || !description) throw new Error(`defineTool(${name}): description required`);
  if (typeof handler !== 'function') throw new Error(`defineTool(${name}): handler must be a function`);
  const schema = inputSchema || { type: 'object', properties: {}, additionalProperties: false };
  if (schema.type !== 'object') throw new Error(`defineTool(${name}): inputSchema must be an object schema`);
  const validate = ajv.compile(schema);
  return { name, description, inputSchema: schema, handler, validate };
}

class Registry {
  constructor(tools = []) {
    this.tools = new Map();
    tools.forEach((t) => this.register(t));
  }
  register(tool) {
    if (!tool || typeof tool.validate !== 'function') throw new Error('register: use defineTool()');
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool ${tool.name}`);
    this.tools.set(tool.name, tool);
  }
  list() {
    return [...this.tools.values()].map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  }

  // ctx: {root, getConfig, state, sessionKey}. Returns MCP CallToolResult.
  async call(name, args, baseCtx) {
    const header = () => buildHeader(headerInfoFromStore(baseCtx.state));
    const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: header() }, { type: 'text', text: msg }] });
    const tool = this.tools.get(name);
    if (!tool) return fail(`Unknown tool: ${name}`);
    const a = args === undefined || args === null ? {} : args;
    if (!tool.validate(a)) {
      const msg = tool.validate.errors.map((e) => `${e.instancePath || '(args)'} ${e.message}`).join('; ');
      return fail(`Invalid arguments for ${name}: ${msg}`);
    }
    try {
      const ctx = { ...baseCtx, reground: regroundHook };
      const out = (await tool.handler(a, ctx)) || {};
      const body = out.text !== undefined ? String(out.text) : out.data !== undefined ? JSON.stringify(out.data, null, 2) : '';
      // Header computed after the handler so it reflects any state change it made.
      return { content: [{ type: 'text', text: header() }, { type: 'text', text: body }] };
    } catch (e) {
      return fail(e && e.message ? e.message : String(e));
    }
  }
}

module.exports = { defineTool, Registry };
