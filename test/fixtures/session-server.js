'use strict';
// Test fixture: runtime server with an injected fake ancestry.
// usage: node session-server.js --root <dir> --ancestry '[900001,900002]'
const path = require('path');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createServer } = require(path.join(__dirname, '..', '..', 'runtime', 'server.js'));

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const parsed = JSON.parse(arg('--ancestry') || '[]');
const { server } = createServer({ root: arg('--root'), ancestry: () => parsed });
server.connect(new StdioServerTransport()).catch((e) => { process.stderr.write(String(e && e.stack || e)); process.exit(1); });
