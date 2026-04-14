'use strict';

/**
 * Server worker — forked by the main process for each workspace.
 *
 * Each fork gets its own copy of server.js module state, so
 * multiple workspaces can run independent servers without
 * clobbering each other's path constants or session stores.
 *
 * Communication with the main process is via IPC:
 *   parent -> child: { type: 'start', projectDir, uiDir, vendorDir }
 *   child -> parent: { type: 'ready', port, authToken }
 *   child -> parent: { type: 'error', message }
 *   parent -> child: { type: 'shutdown' }
 */

const path = require('path');

process.on('message', async (msg) => {
  if (msg.type === 'start') {
    try {
      const { createServer } = require(msg.serverPath || path.join(__dirname, '..', 'src', 'ui', 'server'));
      const result = await createServer(msg.projectDir, {
        uiDir: msg.uiDir,
        electronMode: true,
        vendorDir: msg.vendorDir
      });
      process.send({
        type: 'ready',
        port: result.port,
        authToken: result.authToken
      });
    } catch (err) {
      process.send({ type: 'error', message: err.message });
    }
  } else if (msg.type === 'shutdown') {
    process.exit(0);
  }
});
