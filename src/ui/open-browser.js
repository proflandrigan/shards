#!/usr/bin/env node

'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const SHARDS_DIR = path.join(process.cwd(), '.shards');
const PORT_FILE = path.join(SHARDS_DIR, 'ui.port');

function getPort() {
  try {
    const raw = fs.readFileSync(PORT_FILE, 'utf8').trim();
    // Support both JSON format (new) and plain number (old)
    try {
      const info = JSON.parse(raw);
      return info.port;
    } catch {
      return parseInt(raw, 10);
    }
  } catch {
    return 7842;
  }
}

const port = getPort();
const url = `http://localhost:${port}`;

console.log(`Shards UI: ${url}`);

const platform = process.platform;
let command;
if (platform === 'darwin') {
  command = `open "${url}"`;
} else if (platform === 'win32') {
  command = `start "" "${url}"`;
} else {
  command = `xdg-open "${url}"`;
}

exec(command, (err) => {
  if (err) {
    console.log(`Could not auto-open browser. Visit: ${url}`);
  }
});
