#!/usr/bin/env node

'use strict';

/**
 * ui-push.js — Agent-to-UI panel push CLI
 *
 * Usage:
 *   node ui-push.js <panel-type> [options]
 *
 * Panel types:
 *   data-viewer   Interactive data table (Tabulator.js)
 *   dag           Dependency graph
 *   diagram       ER / architecture diagram
 *   chart         Plotly.js chart
 *   diff          Code diff viewer
 *   model-card    Structured model metadata card
 *   close         Close a panel by ID
 *
 * Options:
 *   --title <string>      Panel tab title
 *   --data <json>         Inline JSON data
 *   --source <filepath>   Path to data file (server reads it; watches for changes)
 *   --type <subtype>      Panel subtype (e.g. "bar", "scatter" for charts)
 *   --agent <name>        Agent name (e.g. "data-analyst")
 *   --panel-id <id>       Panel ID for updates or close (auto-generated if not given)
 *
 * Exits silently on any failure (UI not running = no-op).
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { randomUUID } = require('crypto');

// ─── Locate .shards/ui.port ───────────────────────────────────────────────────

function findPortFile() {
  // Walk up from cwd to find .shards/ui.port
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, '.shards', 'ui.port');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readPortFile(portFile) {
  try {
    return JSON.parse(fs.readFileSync(portFile, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Argument parser ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const result = {
    panel: null,
    title: null,
    data: null,
    source: null,
    type: null,
    agent: null,
    panelId: null,
  };

  const args = argv.slice(2);
  result.panel = args[0] || null;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--title' && args[i + 1]) { result.title = args[++i]; }
    else if (arg === '--data' && args[i + 1]) { result.data = args[++i]; }
    else if (arg === '--source' && args[i + 1]) { result.source = args[++i]; }
    else if (arg === '--type' && args[i + 1]) { result.type = args[++i]; }
    else if (arg === '--agent' && args[i + 1]) { result.agent = args[++i]; }
    else if (arg === '--panel-id' && args[i + 1]) { result.panelId = args[++i]; }
  }

  return result;
}

// ─── HTTP POST ────────────────────────────────────────────────────────────────

function postEvent(port, token, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/event',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `Bearer ${token}`,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(true));
      }
    );
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const portFile = findPortFile();
  if (!portFile) process.exit(0); // UI not running — silent no-op

  const portInfo = readPortFile(portFile);
  if (!portInfo || !portInfo.port || !portInfo.token) process.exit(0);

  const { port, token } = portInfo;
  const args = parseArgs(process.argv);

  if (!args.panel) process.exit(0);

  const VALID_PANELS = ['data-viewer', 'dag', 'diagram', 'chart', 'diff', 'model-card', 'experiment-dashboard', 'close'];
  if (!VALID_PANELS.includes(args.panel)) process.exit(0);

  // Resolve source to absolute path if given
  const sourcePath = args.source ? path.resolve(args.source) : null;

  // Parse inline data if provided
  let inlineData = null;
  if (args.data) {
    try {
      inlineData = JSON.parse(args.data);
    } catch {
      // If it's not valid JSON, pass as string — server will handle
      inlineData = args.data;
    }
  }

  const panelId = args.panelId || randomUUID();

  let payload;
  if (args.panel === 'close') {
    payload = {
      eventType: 'ui-panel-close',
      panelId: args.panelId || null,
    };
  } else {
    payload = {
      eventType: 'ui-panel',
      panel: args.panel,
      panelId,
      title: args.title || args.panel,
      data: inlineData,
      source: sourcePath,
      type: args.type || null,
      agent: args.agent || null,
    };
  }

  await postEvent(port, token, payload);
  // Always exit 0 — agents should never fail due to UI state
  process.exit(0);
}

main().catch(() => process.exit(0));
