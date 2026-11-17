#!/usr/bin/env node
"use strict";
// shards-ui: DEPRECATED (E10.5). The v1 web UI is gone; Studio replaces it. No v2 command is an equivalent, so
// this prints the replacement and exits: 0 for status/stop/help (nothing to do), 1 for anything that tried to start the UI.
const cmd = process.argv[2] || "start";
console.log("shards-ui is deprecated: the Shards UI has moved to Studio.");
console.log("Run: npx @proflandrigan/shards-studio");
console.log("Gate and session operations: shards gates status | shards sessions list");
process.exit(["status", "help", "stop", "--help", "-h"].includes(cmd) ? 0 : 1);
