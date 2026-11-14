"use strict";
// Maps the v2 core/ layout back to the v1 installed layout
// (.claude/agents/<id>.md + .claude/agents/specific_instructions/<snake>/...),
// so the legacy installer (tools/install.js) keeps producing the same tree.
// Removed together with the v1 installer.

const fs = require("fs");
const os = require("os");
const path = require("path");

// core/protocols/<name>.md whose legacy file name carried a "_protocol" suffix.
const PROTOCOL_SUFFIXED = new Set([
  "diverge", "join_path", "notebook_walkthrough", "reviewer_verdict", "swarm", "validation",
]);

// Files that exist only in v2 (never installed by the legacy installer).
const V2_ONLY = new Set(["agent.yaml", "persona-summary.md"]);

function walk(dir, prefix = "") {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

// core-relative path (under core/) -> path relative to .claude/agents/, or null.
function toLegacyAgentPath(rel) {
  let m;
  if ((m = rel.match(/^agents\/([a-z-]+)\/(.+)$/))) {
    const id = m[1], rest = m[2], snake = id.replace(/-/g, "_");
    if (V2_ONLY.has(rest)) return null;
    if (rest === "AGENT.md") return `${id}.md`;
    if (/^phases(_quick|_deep)?\//.test(rest)) return `specific_instructions/${snake}/${rest}`;
    if ((m = rest.match(/^modes\/(.+)$/))) {
      const name = m[1] === "service.md" ? "service_mode.md" : m[1];
      return `specific_instructions/${snake}/${name}`;
    }
    return null;
  }
  if ((m = rel.match(/^protocols\/(.+)\.md$/))) {
    const n = PROTOCOL_SUFFIXED.has(m[1]) ? `${m[1]}_protocol` : m[1];
    return `specific_instructions/shared/${n}.md`;
  }
  return null;
}

// Materialize the legacy agents tree into a fresh temp dir; returns its path.
function stageLegacyAgents(coreDir) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "shards-legacy-agents-"));
  for (const rel of walk(coreDir)) {
    const legacy = toLegacyAgentPath(rel);
    if (!legacy) continue;
    const dest = path.join(stage, legacy);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(coreDir, rel), dest);
  }
  return stage;
}

module.exports = { toLegacyAgentPath, stageLegacyAgents, PROTOCOL_SUFFIXED };
