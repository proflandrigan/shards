#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// ─── Constants ───────────────────────────────────────────────────────────────

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PACKAGE_ROOT, "src");

// Target is always the current working directory (where the user ran npx from)
const PROJECT_DIR = process.cwd();
const CLAUDE_DIR = path.join(PROJECT_DIR, ".claude");

const AGENTS_SRC = path.join(SRC_DIR, "agents");
const COMMANDS_SRC = path.join(SRC_DIR, "commands");
const TEMPLATES_SRC = path.join(SRC_DIR, "templates");

const AGENTS_DEST = path.join(CLAUDE_DIR, "agents");
const COMMANDS_DEST = path.join(CLAUDE_DIR, "commands");
const TEMPLATES_DEST = path.join(PROJECT_DIR, "templates");

const MANIFEST_NAME = ".echoes-manifest.json";

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
        const existing = fs.readFileSync(destPath, "utf8");
        const incoming = fs.readFileSync(srcPath, "utf8");
        if (existing === incoming) {
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
  console.log("\n🗑  Uninstalling echoes...\n");

  const manifestPath = path.join(CLAUDE_DIR, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    console.log("  No installation manifest found. Nothing to uninstall.");
    process.exit(0);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let removed = 0;

  for (const filePath of manifest.files || []) {
    const fullPath = path.join(PROJECT_DIR, filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`  ✓ Removed: ${filePath}`);
      removed++;
    }
  }

  fs.unlinkSync(manifestPath);
  console.log(`\n✅ Uninstalled ${removed} files.\n`);
}

// ─── Install ─────────────────────────────────────────────────────────────────

function install() {
  console.log(`
╔══════════════════════════════════════════╗
║       echoes — installer                 ║
║   Echoes of JFL's brain                  ║
╚══════════════════════════════════════════╝
`);
  console.log(`  Project directory: ${PROJECT_DIR}`);
  console.log(`  Installing to:    ${CLAUDE_DIR}\n`);

  // 1. Create .claude directory structure
  fs.mkdirSync(AGENTS_DEST, { recursive: true });
  fs.mkdirSync(COMMANDS_DEST, { recursive: true });

  // 2. Copy agents
  console.log("📦 Installing agents...");
  const agentCount = copyDir(AGENTS_SRC, AGENTS_DEST);
  const agentFiles = listFiles(AGENTS_SRC);
  for (const f of agentFiles) {
    console.log(`  ✓ .claude/agents/${f}`);
  }

  // 3. Copy commands (slash commands)
  console.log("\n📦 Installing commands...");
  const cmdCount = copyDir(COMMANDS_SRC, COMMANDS_DEST);
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

  // 5. Create output directories
  const outputDirs = ["analysis", "studies", "models", "services"];
  for (const dir of outputDirs) {
    const dirPath = path.join(PROJECT_DIR, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`\n📂 Created ${dir}/ directory`);
    }
  }

  // 6. Add .gitignore entries
  const gitignorePath = path.join(PROJECT_DIR, ".gitignore");
  const gitignoreEntry =
    "\n# echoes — agent output directories (optional — remove comments to track)\n# analysis/\n# studies/\n# models/\n# services/\n";
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf8");
    if (!content.includes("echoes")) {
      fs.appendFileSync(gitignorePath, gitignoreEntry);
      console.log(
        "\n  ✓ Added echoes output directories to .gitignore (commented out)"
      );
    }
  }

  // 7. Write manifest for uninstall tracking
  const allFiles = [
    ...agentFiles.map((f) => `.claude/agents/${f}`),
    ...cmdFiles.map((f) => `.claude/commands/${f}`),
    ...tplFiles.map((f) => `templates/${f}`),
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

  // 8. Append to CLAUDE.md
  const claudeMdPath = path.join(PROJECT_DIR, "CLAUDE.md");
  const claudeBlock = `
## Echoes — Agent Suite

This project uses **Echoes**, a suite of data-focused agents that are echoes of
JFL's brain. Each agent is a specialist clone with a distinct personality and
phased workflow.

### Available commands

| Command | Agent | Personality | Speciality |
|---------|-------|-------------|------------|
| \`/echoes\` | JFL (Orchestrator) | Friendly, structured | Triage, delegation, final review |
| \`/data-analyst\` | Data Analyst | Helpful | Adhoc queries, quick analyses |
| \`/data-scientist\` | Data Scientist | Condescending | EDA, modeling, deep studies |
| \`/ml-engineer\` | ML Engineer | Intense | Recommenders, ranking, production ML |
| \`/ai-engineer\` | AI Engineer | Existentially anxious | LLM workflows, RAG, prompt engineering, AI safety |
| \`/data-engineer\` | Data Engineer | Grumpy | Pipelines, dbt models |
| \`/data-modeller\` | Data Modeller | Sarcastic | Entities, relationships, grain |
| \`/researcher\` | Researcher | Nerdy | Statistical review, methodology validation |

### How it works

- Run \`/echoes\` to start — JFL triages your request and delegates to the right echo
- Or run a specialist command directly if you know what you need
- Every phase produces documented decisions in \`project-specs.md\`
- Agents consult each other automatically (visible to you)
- The AI Engineer consults the ML Engineer for production infrastructure and the Researcher for evaluation rigor
- The Researcher reviews statistical methodology for the Data Analyst, Data Scientist, and AI Engineer
- JFL reviews every final plan before execution

### Output directories

- \`analysis/\` — Data Analyst adhoc analyses
- \`studies/\` — Data Scientist deep studies
- \`models/\` — Data Engineer and Data Modeller work
- \`services/\` — ML Engineer greenfield projects

### Decision documentation

Every project produces a \`project-specs.md\` file documenting all decisions.
Agents cannot advance to the next phase until each phase is written and confirmed.
This is the gate pattern — documentation IS the gate.
`;

  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, "utf8");
    if (!content.includes("Echoes")) {
      fs.appendFileSync(claudeMdPath, claudeBlock);
      console.log("\n📝 Appended Echoes section to existing CLAUDE.md");
    }
  } else {
    fs.writeFileSync(claudeMdPath, `# Project\n${claudeBlock}`);
    console.log("\n📝 Created CLAUDE.md with Echoes section");
  }

  // Done
  const total = agentCount + cmdCount + tplCount;
  console.log(`
╔══════════════════════════════════════════╗
║  ✅ Installed ${String(total).padEnd(3)} files successfully      ║
╠══════════════════════════════════════════╣
║                                          ║
║  Open Claude Code in this directory      ║
║  and run:  /echoes                       ║
║                                          ║
║  Or go directly to a specialist:         ║
║    /data-analyst                         ║
║    /data-scientist                       ║
║    /ml-engineer                          ║
║    /ai-engineer                          ║
║    /data-engineer                        ║
║    /data-modeller                        ║
║    /researcher                           ║
║                                          ║
║  To uninstall:                           ║
║    npx echoes uninstall                  ║
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
    console.log("Usage: npx echoes [install|uninstall]");
    process.exit(1);
}
