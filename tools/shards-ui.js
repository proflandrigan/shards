#!/usr/bin/env node
"use strict";
// Deprecation stub: the Shards web UI moved to Studio.
const cmd = process.argv[2] || "start";
console.log("The Shards UI has moved to Studio.");
console.log("Run: npx @proflandrigan/shards-studio");
process.exit(["status", "help", "stop", "--help", "-h"].includes(cmd) ? 0 : 1);
