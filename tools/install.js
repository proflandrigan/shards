#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// ─── Constants ───────────────────────────────────────────────────────────────

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PACKAGE_ROOT, "src");

// Target is always the current working directory (where the user ran npx from)
const PROJECT_DIR = process.cwd();
const CLAUDE_DIR = path.join(PROJECT_DIR, ".claude");
const GEMINI_DIR = path.join(PROJECT_DIR, ".gemini");

const AGENTS_SRC = path.join(SRC_DIR, "agents");
const COMMANDS_SRC = path.join(SRC_DIR, "commands");
const TEMPLATES_SRC = path.join(SRC_DIR, "templates");
const UI_SRC = path.join(SRC_DIR, "ui");

const AGENTS_DEST_CLAUDE = path.join(CLAUDE_DIR, "agents");
const AGENTS_DEST_GEMINI = path.join(GEMINI_DIR, "agents");
const COMMANDS_DEST_CLAUDE = path.join(CLAUDE_DIR, "commands");
const TEMPLATES_DEST = path.join(PROJECT_DIR, "templates");
const SHARDS_DIR = path.join(PROJECT_DIR, ".shards");
const UI_DEST = path.join(SHARDS_DIR, "ui");

const MANIFEST_NAME = ".shards-manifest.json";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(srcPath, destPath);
    } else {
      if (fs.existsSync(destPath)) {
        const existing = fs.readFileSync(destPath);
        const incoming = fs.readFileSync(srcPath);
        if (existing.equals(incoming)) {
          continue;
        }
        const backupPath = destPath + ".backup";
        fs.copyFileSync(destPath, backupPath);
        console.log(
          `  ⚠  Backed up existing: ${path.relative(PROJECT_DIR, destPath)} → .backup`
        );
      }
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function listFiles(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listFiles(path.join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

// ─── Uninstall ───────────────────────────────────────────────────────────────

function uninstall() {
  console.log("\n🗑  Uninstalling shards...\n");

  const manifestPathClaude = path.join(CLAUDE_DIR, MANIFEST_NAME);
  const manifestPathGemini = path.join(GEMINI_DIR, MANIFEST_NAME);
  
  let manifest = { files: [] };
  if (fs.existsSync(manifestPathClaude)) {
    manifest = JSON.parse(fs.readFileSync(manifestPathClaude, "utf8"));
  } else if (fs.existsSync(manifestPathGemini)) {
    manifest = JSON.parse(fs.readFileSync(manifestPathGemini, "utf8"));
  } else {
    console.log("  No installation manifest found. Nothing to uninstall.");
    process.exit(0);
  }

  let removed = 0;

  for (const filePath of manifest.files || []) {
    const fullPath = path.join(PROJECT_DIR, filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`  ✓ Removed: ${filePath}`);
      removed++;
    }
  }

  if (fs.existsSync(manifestPathClaude)) fs.unlinkSync(manifestPathClaude);
  if (fs.existsSync(manifestPathGemini)) fs.unlinkSync(manifestPathGemini);
  
  console.log(`\n✅ Uninstalled ${removed} files.`);
  console.log(`  ℹ  .shards/knowledge/ preserved (persistent workspace memory)\n`);
}

// ─── Install ─────────────────────────────────────────────────────────────────

function install() {
  console.log(`
╔══════════════════════════════════════════╗
║       shards — installer                 ║
║   Shards of JFL's brain                  ║
╚══════════════════════════════════════════╝
`);
  console.log(`  Project directory: ${PROJECT_DIR}`);
  console.log(`  Claude directory:  ${CLAUDE_DIR}`);
  console.log(`  Gemini directory:  ${GEMINI_DIR}\n`);

  // 1. Create directory structures
  fs.mkdirSync(AGENTS_DEST_CLAUDE, { recursive: true });
  fs.mkdirSync(AGENTS_DEST_GEMINI, { recursive: true });
  fs.mkdirSync(COMMANDS_DEST_CLAUDE, { recursive: true });

  // 2. Copy agents
  console.log("📦 Installing agents...");
  copyDir(AGENTS_SRC, AGENTS_DEST_CLAUDE);
  copyDir(AGENTS_SRC, AGENTS_DEST_GEMINI);
  const agentFiles = listFiles(AGENTS_SRC);
  for (const f of agentFiles) {
    console.log(`  ✓ .claude/agents/${f}`);
    console.log(`  ✓ .gemini/agents/${f}`);
  }

  // 3. Copy commands (slash commands for Claude)
  console.log("\n📦 Installing commands...");
  copyDir(COMMANDS_SRC, COMMANDS_DEST_CLAUDE);
  const cmdFiles = listFiles(COMMANDS_SRC);
  for (const f of cmdFiles) {
    console.log(`  ✓ .claude/commands/${f}`);
  }

  // 4. Copy templates
  console.log("\n📦 Installing templates...");
  const tplCount = copyDir(TEMPLATES_SRC, TEMPLATES_DEST);
  const tplFiles = listFiles(TEMPLATES_SRC);
  for (const f of tplFiles) {
    console.log(`  ✓ templates/${f}`);
  }

  // 5. Copy UI files
  console.log("\n📦 Installing UI...");
  const uiCount = copyDir(UI_SRC, UI_DEST);
  const uiFiles = listFiles(UI_SRC);
  for (const f of uiFiles) {
    console.log(`  ✓ .shards/ui/${f}`);
  }

  // 6. Create Knowledge Ledger directory
  const knowledgeDir = path.join(SHARDS_DIR, "knowledge");
  const knowledgeSubdirs = ["entities", "infrastructure", "patterns", "features"];
  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true });
    for (const sub of knowledgeSubdirs) {
      fs.mkdirSync(path.join(knowledgeDir, sub), { recursive: true });
    }
    // Copy INDEX.md template
    const indexSrc = path.join(TEMPLATES_SRC, "knowledge-index.md");
    const indexDest = path.join(knowledgeDir, "INDEX.md");
    if (fs.existsSync(indexSrc)) {
      fs.copyFileSync(indexSrc, indexDest);
    }
    console.log("\n📂 Created .shards/knowledge/ (persistent workspace memory)");
  } else {
    console.log("\n📂 .shards/knowledge/ already exists (preserved)");
    // Ensure subdirs exist even on re-install
    for (const sub of knowledgeSubdirs) {
      fs.mkdirSync(path.join(knowledgeDir, sub), { recursive: true });
    }
  }

  // 7. Create output directories
  const outputDirs = ["analysis", "studies", "models", "data_models", "services", "research", "dashboards", "brainstorm", "fixes", "projects"];
  for (const dir of outputDirs) {
    const dirPath = path.join(PROJECT_DIR, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`\n📂 Created ${dir}/ directory`);
    }
  }

  // 8. Add .gitignore entries
  const gitignorePath = path.join(PROJECT_DIR, ".gitignore");
  const gitignoreEntry =
    "\n# shards — agent output directories (optional — remove comments to track)\n# analysis/\n# studies/\n# models/\n# data_models/\n# services/\n# research/\n# dashboards/\n# brainstorm/\n# fixes/\n# projects/\n";
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf8");
    if (!content.includes("shards")) {
      fs.appendFileSync(gitignorePath, gitignoreEntry);
      console.log(
        "\n  ✓ Added shards output directories to .gitignore (commented out)"
      );
    }
  }

  // 9. Write manifest for uninstall tracking
  const allFiles = [
    ...agentFiles.map((f) => `.claude/agents/${f}`),
    ...agentFiles.map((f) => `.gemini/agents/${f}`),
    ...cmdFiles.map((f) => `.claude/commands/${f}`),
    ...tplFiles.map((f) => `templates/${f}`),
    ...uiFiles.map((f) => `.shards/ui/${f}`),
  ];
  const manifest = {
    version: require(path.join(PACKAGE_ROOT, "package.json")).version,
    installedAt: new Date().toISOString(),
    files: allFiles,
  };
  fs.writeFileSync(
    path.join(CLAUDE_DIR, MANIFEST_NAME),
    JSON.stringify(manifest, null, 2)
  );
  fs.writeFileSync(
    path.join(GEMINI_DIR, MANIFEST_NAME),
    JSON.stringify(manifest, null, 2)
  );

  // 10. Append to CLAUDE.md and GEMINI.md
  const claudeMdPath = path.join(PROJECT_DIR, "CLAUDE.md");
  const geminiMdPath = path.join(PROJECT_DIR, "GEMINI.md");
  const shardsBlock = `
## Shards — Agent Suite

This project uses **Shards**, a suite of data-focused agents that are shards of
JFL's brain. Each agent is a specialist fragment with a distinct personality and
phased workflow.

### Available Agents

| Agent | Personality | Speciality |
|-------|-------------|------------|
| JFL (Orchestrator) | Friendly, structured | Triage, delegation, final review |
| Data Analyst | Helpful | Adhoc queries, quick analyses |
| Data Scientist | Condescending | EDA, modeling, deep studies |
| ML Engineer | Intense | Recommenders, ranking, production ML |
| AI Engineer | Existentially anxious | LLM workflows, RAG, prompt engineering, AI safety |
| Data Engineer | Grumpy | Pipelines, dbt models |
| Data Modeller | Sarcastic | Entities, relationships, grain |
| MLOps Engineer | Constantly stressed | Model deployment, serving, monitoring, retraining pipelines, AWS/GCP/BentoML |
| BI Engineer | Bored and tired | Streamlit, Plotly Dash, Altair, dashboards, chart design |
| Researcher | Nerdy | Statistical review, methodology validation |
| Backend Engineer | Stressed, overworked | Python code review, FastAPI, Pydantic, data contracts, performance |
| Applied ML Scientist | Intensely technical | Novel framework design, cutting-edge methodology review |
| Deep Learning Engineer | Robot-precise | Neural architecture design, training protocols, custom DL models |

### How to use with Claude Code

- Run \`/shards\` to start — JFL triages your request and delegates to the right shard
- Or run a specialist command directly: \`/data-analyst\`, \`/data-scientist\`, etc.

### How to use with Gemini CLI

- Run \`Ask jfl to [task]\` — JFL will triage and coordinate.
- Or call a specialist directly: \`Ask data-analyst to [task]\`.
- Specialists will run as native sub-agents.

### Workflow & Decision Documentation

Every project produces a \`project-specs.md\` file documenting all decisions.
Agents follow a **phased workflow** and a **gate pattern**: they cannot advance
to the next phase until the current phase's decisions are written and confirmed
by the user. Documentation IS the gate.

### Knowledge Ledger

Shards maintains a persistent workspace-wide Knowledge Ledger at \`.shards/knowledge/\`.
Agents automatically check it before starting work and contribute to it when projects complete.

- \`.shards/knowledge/INDEX.md\` — one-line-per-entry index scanned for keyword matches
- \`.shards/knowledge/entities/\`, \`infrastructure/\`, \`patterns/\`, \`features/\` — detailed entries
`;

  const appendToMd = (mdPath, block) => {
    if (fs.existsSync(mdPath)) {
      const content = fs.readFileSync(mdPath, "utf8");
      if (!content.includes("Shards")) {
        fs.appendFileSync(mdPath, block);
        console.log(`\n📝 Appended Shards section to existing ${path.basename(mdPath)}`);
      }
    } else {
      fs.writeFileSync(mdPath, `# Project\n${block}`);
      console.log(`\n📝 Created ${path.basename(mdPath)} with Shards section`);
    }
  };

  appendToMd(claudeMdPath, shardsBlock);
  appendToMd(geminiMdPath, shardsBlock);

  // Done
  const total = agentFiles.length * 2 + cmdFiles.length + tplFiles.length + uiFiles.length;
  console.log(`
╔══════════════════════════════════════════╗
║  ✅ Installed ${String(total).padEnd(3)} files successfully      ║
╠══════════════════════════════════════════╣
║                                          ║
║  Use with Claude Code:                   ║
║    /shards                               ║
║                                          ║
║  Use with Gemini CLI:                    ║
║    Ask jfl to [task]                     ║
║                                          ║
║  Launch the web UI:                      ║
║    shards-ui                             ║
║                                          ║
║  To uninstall:                           ║
║    npx shards uninstall                  ║
║                                          ║
╚══════════════════════════════════════════╝
`);
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────

const command = process.argv[2] || "install";

switch (command) {
  case "install":
    install();
    break;
  case "uninstall":
    uninstall();
    break;
  default:
    console.log(`Unknown command: ${command}`);
    console.log("Usage: npx shards [install|uninstall]");
    process.exit(1);
}
