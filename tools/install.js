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
const UI_SRC = path.join(SRC_DIR, "ui");
const DOCS_SRC = path.join(SRC_DIR, "docs");

const AGENTS_DEST = path.join(CLAUDE_DIR, "agents");
const COMMANDS_DEST = path.join(CLAUDE_DIR, "commands");
const TEMPLATES_DEST = path.join(PROJECT_DIR, "templates");
const SHARDS_DIR = path.join(PROJECT_DIR, ".shards");
const UI_DEST = path.join(SHARDS_DIR, "ui");
const UI_DOCS_DEST = path.join(UI_DEST, "docs");
const DOCS_DEST = path.join(PROJECT_DIR, "docs", "shards-guide");
const HOOKS_DEST = path.join(SHARDS_DIR, "hooks");

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

  // Remove gate hook entries from settings.json
  const settingsPath = path.join(CLAUDE_DIR, "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      let settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (settings.hooks) {
        const filterHooks = (arr) =>
          (arr || []).filter((entry) =>
            !entry.hooks || !entry.hooks.some((h) => h.command && h.command.includes("gate-hook.js"))
          );
        settings.hooks.Stop = filterHooks(settings.hooks.Stop);
        settings.hooks.PreToolUse = filterHooks(settings.hooks.PreToolUse);
        settings.hooks.UserPromptSubmit = filterHooks(settings.hooks.UserPromptSubmit);
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("  ✓ Removed gate hook entries from .claude/settings.json");
    } catch {}
  }

  // Remove .shards/hooks/
  const hooksDir = path.join(PROJECT_DIR, ".shards", "hooks");
  if (fs.existsSync(hooksDir)) {
    fs.rmSync(hooksDir, { recursive: true });
    console.log("  ✓ Removed .shards/hooks/");
  }

  fs.unlinkSync(manifestPath);
  console.log(`\n✅ Uninstalled ${removed} files.`);
  console.log(`  ℹ  .shards/knowledge/ preserved (persistent workspace memory)\n`);
}

// ─── Install ─────────────────────────────────────────────────────────────────

function install() {
  console.log(`
╔══════════════════════════════════════════╗
║       shards — installer                 ║
║   Shards of Syn's brain                  ║
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

  // 5. Copy UI files
  console.log("\n📦 Installing UI...");
  const uiCount = copyDir(UI_SRC, UI_DEST);
  const uiFiles = listFiles(UI_SRC);
  for (const f of uiFiles) {
    console.log(`  ✓ .shards/ui/${f}`);
  }

  // 5a. Copy developer guide docs into two places:
  //     1) .shards/ui/docs/ — served by the UI guide panel
  //     2) docs/shards-guide/ — readable as plain markdown outside the UI
  console.log("\n📦 Installing Developer Guide...");
  const uiDocsCount = copyDir(DOCS_SRC, UI_DOCS_DEST);
  const docsCount = copyDir(DOCS_SRC, DOCS_DEST);
  const docFiles = listFiles(DOCS_SRC);
  for (const f of docFiles) {
    console.log(`  ✓ .shards/ui/docs/${f}`);
  }
  if (docFiles.length > 0) {
    console.log(`  ✓ docs/shards-guide/ (${docFiles.length} files, plain-markdown copy)`);
  }

  // 5b. Copy gate-hook.js + gate-hook/ into .shards/hooks/
  console.log("\n📦 Installing gate hooks...");
  fs.mkdirSync(HOOKS_DEST, { recursive: true });
  const gateHookSrc = path.join(PACKAGE_ROOT, "tools", "gate-hook.js");
  const gateHookDirSrc = path.join(PACKAGE_ROOT, "tools", "gate-hook");
  const gateHookDest = path.join(HOOKS_DEST, "gate-hook.js");
  const gateHookDirDest = path.join(HOOKS_DEST, "gate-hook");
  fs.copyFileSync(gateHookSrc, gateHookDest);
  copyDir(gateHookDirSrc, gateHookDirDest);
  console.log(`  ✓ .shards/hooks/gate-hook.js`);

  // 6. Seed .claude/settings.json with readonly preset and PreToolUse hook
  const settingsPath = path.join(CLAUDE_DIR, "settings.json");
  const relayScript = path.join(SHARDS_DIR, "ui", "relay.js");
  const gateHookScript = gateHookDest;

  const preToolUseHook = {
    matcher: "Bash",
    hooks: [{ type: "command", command: `node ${relayScript} pre-tool-use` }],
  };
  const gateStopHook = {
    matcher: "",
    hooks: [{ type: "command", command: `node ${gateHookScript} stop` }],
  };
  const gatePreToolUseHook = {
    matcher: "",
    hooks: [{ type: "command", command: `node ${gateHookScript} pre-tool-use` }],
  };
  const gateUserPromptSubmitHook = {
    matcher: "",
    hooks: [{ type: "command", command: `node ${gateHookScript} user-prompt-submit` }],
  };

  if (!fs.existsSync(settingsPath)) {
    const defaultSettings = {
      hooks: {
        Stop: [gateStopHook],
        PreToolUse: [preToolUseHook, gatePreToolUseHook],
        UserPromptSubmit: [gateUserPromptSubmitHook],
      },
      permissions: {
        allow: [
          "Bash(git log:*)", "Bash(git status:*)", "Bash(git diff:*)",
          "Bash(git branch:*)", "Bash(git show:*)", "Bash(git rev-parse:*)",
          "Bash(git remote:*)", "Bash(git tag:*)", "Bash(git stash list:*)",
          "Bash(find:*)", "Bash(ls:*)", "Bash(tree:*)", "Bash(file:*)",
          "Bash(stat:*)", "Bash(du:*)", "Bash(df:*)",
          "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(less:*)",
          "Bash(grep:*)", "Bash(rg:*)", "Bash(ag:*)", "Bash(fzf:*)",
          "Bash(wc:*)", "Bash(echo:*)", "Bash(pwd:*)", "Bash(which:*)",
          "Bash(whoami:*)", "Bash(env:*)", "Bash(printenv:*)",
          "Bash(type:*)", "Bash(command -v:*)", "Bash(uname:*)",
          "Bash(sort:*)", "Bash(uniq:*)", "Bash(cut:*)", "Bash(awk:*)",
          "Bash(diff:*)", "Bash(comm:*)", "Bash(jq:*)",
        ],
        deny: [],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    console.log("\n🔐 Created .claude/settings.json with readonly permissions preset");
  } else {
    // Ensure hooks are present on existing installs
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch {}
    if (!settings.hooks) settings.hooks = {};
    let changed = false;

    // Relay PreToolUse hook
    if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
    const hasRelay = settings.hooks.PreToolUse.some((entry) =>
      entry.hooks && entry.hooks.some((h) => h.command && h.command.includes("relay.js"))
    );
    if (!hasRelay) { settings.hooks.PreToolUse.push(preToolUseHook); changed = true; }

    // Gate Stop hook
    if (!settings.hooks.Stop) settings.hooks.Stop = [];
    const hasGateStop = settings.hooks.Stop.some((entry) =>
      entry.hooks && entry.hooks.some((h) => h.command && h.command.includes("gate-hook.js"))
    );
    if (!hasGateStop) { settings.hooks.Stop.push(gateStopHook); changed = true; }

    // Gate PreToolUse hook
    const hasGatePreToolUse = settings.hooks.PreToolUse.some((entry) =>
      entry.hooks && entry.hooks.some((h) => h.command && h.command.includes("gate-hook.js") && h.command.includes("pre-tool-use"))
    );
    if (!hasGatePreToolUse) { settings.hooks.PreToolUse.push(gatePreToolUseHook); changed = true; }

    // Gate UserPromptSubmit hook
    if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
    const hasGateUserPrompt = settings.hooks.UserPromptSubmit.some((entry) =>
      entry.hooks && entry.hooks.some((h) => h.command && h.command.includes("gate-hook.js"))
    );
    if (!hasGateUserPrompt) { settings.hooks.UserPromptSubmit.push(gateUserPromptSubmitHook); changed = true; }

    if (changed) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("\n🔐 Updated .claude/settings.json with gate enforcement hooks");
    } else {
      console.log("\n🔐 .claude/settings.json already exists (preserved)");
    }
  }

  // 7. Create Knowledge Ledger directory
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

  // 8. Create output directories
  const outputDirs = ["analysis", "studies", "models", "data_models", "services", "research", "dashboards", "brainstorm", "fixes", "projects"];
  for (const dir of outputDirs) {
    const dirPath = path.join(PROJECT_DIR, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`\n📂 Created ${dir}/ directory`);
    }
  }

  // 9. Add .gitignore entries
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

  // 10. Write manifest for uninstall tracking
  const allFiles = [
    ...agentFiles.map((f) => `.claude/agents/${f}`),
    ...cmdFiles.map((f) => `.claude/commands/${f}`),
    ...tplFiles.map((f) => `templates/${f}`),
    ...uiFiles.map((f) => `.shards/ui/${f}`),
    ...docFiles.map((f) => `.shards/ui/docs/${f}`),
    ...docFiles.map((f) => `docs/shards-guide/${f}`),
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

  // 11. Append to CLAUDE.md
  const claudeMdPath = path.join(PROJECT_DIR, "CLAUDE.md");
  const claudeBlock = `
## Shards — Agent Suite

This project uses **Shards**, a suite of data-focused agents that are shards of
Syn's brain. Each agent is a specialist fragment with a distinct personality and
phased workflow.

### Available commands

| Command | Agent | Personality | Speciality |
|---------|-------|-------------|------------|
| \`/shards\` | Syn (Orchestrator) | Friendly, structured | Triage, delegation, final review |
| \`/brainstorm\` | Syn (Brainstorm) | Friendly, structured | Multi-agent ideation, hack day exploration |
| \`/knowledge\` | Syn (Knowledge) | Friendly, structured | Seed, browse, and manage the Knowledge Ledger |
| \`/data-analyst\` | Data Analyst | Helpful | Adhoc queries, quick analyses |
| \`/data-scientist\` | Data Scientist | Condescending | EDA, modeling, deep studies |
| \`/ml-engineer\` | ML Engineer | Intense | Recommenders, ranking, production ML |
| \`/ai-engineer\` | AI Engineer | Existentially anxious | LLM workflows, RAG, prompt engineering, AI safety |
| \`/data-engineer\` | Data Engineer | Grumpy | Pipelines, dbt models |
| \`/data-modeller\` | Data Modeller | Sarcastic | Entities, relationships, grain |
| \`/mlops-engineer\` | MLOps Engineer | Constantly stressed | Model deployment, serving, monitoring, retraining pipelines, AWS/GCP/BentoML |
| \`/bi-engineer\` | BI Engineer | Bored and tired | Streamlit, Plotly Dash, Altair, dashboards, chart design |
| \`/researcher\` | Researcher | Nerdy | Statistical review, methodology validation |
| \`/backend-engineer\` | Backend Engineer | Stressed, overworked | Python code review, FastAPI, Pydantic, data contracts, performance |
| \`/applied-ml-scientist\` | Applied ML Scientist | Intensely technical | Novel framework design, cutting-edge methodology review |
| \`/deep-learning-engineer\` | Deep Learning Engineer | Robot-precise | Neural architecture design, training protocols, custom DL models |

### How it works

- Run \`/shards\` to start — Syn triages your request and delegates to the right shard
- Or run a specialist command directly if you know what you need
- Every phase produces documented decisions in \`project-specs.md\`
- Agents consult each other automatically (visible to you)
- The AI Engineer consults the ML Engineer for production infrastructure and the Researcher for evaluation rigor
- The Researcher reviews statistical methodology for the Data Analyst, Data Scientist, and AI Engineer
- The Backend Engineer reviews Python code (.py and .ipynb) consulted automatically by Syn during Code Review Mode when Python artifacts are present
- The ML Engineer consults the Applied ML Scientist for cutting-edge methodology review on non-standard problems
- The Deep Learning Engineer reviews the ML Engineer's work when DL approaches are warranted, and reviews the Applied ML Scientist's novel frameworks for DL implementation fidelity
- The ML Engineer and Applied ML Scientist both review the Deep Learning Engineer's Create output
- The MLOps Engineer consults the ML Engineer for model architecture constraints and infrastructure design review
- The MLOps Engineer consults the AI Engineer for LLM-specific deployment requirements
- The BI Engineer reviews visualization outputs for the Data Analyst, Data Scientist, and ML Engineer when charts or dashboards are part of the deliverable
- Syn reviews every final plan before execution

### Output directories

- \`analysis/\` — Data Analyst adhoc analyses
- \`studies/\` — Data Scientist deep studies
- \`models/\` — Data Engineer and Data Modeller work
- \`services/\` — ML Engineer greenfield projects
- \`research/\` — Applied ML Scientist novel framework projects
- \`dashboards/\` — BI Engineer dashboard projects
- \`brainstorm/\` — Syn brainstorm sessions

### Decision documentation

Every project produces a \`project-specs.md\` file documenting all decisions.
Agents cannot advance to the next phase until each phase is written and confirmed.
This is the gate pattern — documentation IS the gate.

### Knowledge Ledger

Shards maintains a persistent workspace-wide Knowledge Ledger at \`.shards/knowledge/\`.
Agents automatically check it before starting work and contribute to it when projects complete.

- \`.shards/knowledge/INDEX.md\` — one-line-per-entry index scanned for keyword matches
- \`.shards/knowledge/entities/\` — data table quirks, column semantics, grain surprises
- \`.shards/knowledge/infrastructure/\` — warehouse/API/system behaviors
- \`.shards/knowledge/patterns/\` — reusable SQL/Python snippets
- \`.shards/knowledge/features/\` — verified ML features (Data Scientist + ML Engineer)

**Auto-retrieval:** Before Phase 1, agents scan INDEX.md for entries relevant to the
current project and document findings in project-specs.md.

**Auto-harvest:** After Syn final review, agents extract reusable knowledge and present
candidates for user confirmation before writing to the ledger.

The knowledge directory is preserved across installs and uninstalls.
`;

  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, "utf8");
    if (!content.includes("Shards")) {
      fs.appendFileSync(claudeMdPath, claudeBlock);
      console.log("\n📝 Appended Shards section to existing CLAUDE.md");
    }
  } else {
    fs.writeFileSync(claudeMdPath, `# Project\n${claudeBlock}`);
    console.log("\n📝 Created CLAUDE.md with Shards section");
  }

  // Done
  const total = agentCount + cmdCount + tplCount + uiCount + uiDocsCount + docsCount;
  console.log(`
╔══════════════════════════════════════════╗
║  ✅ Installed ${String(total).padEnd(3)} files successfully      ║
╠══════════════════════════════════════════╣
║                                          ║
║  Open Claude Code in this directory      ║
║  and run:  /shards                       ║
║                                          ║
║  Or go directly to a specialist:         ║
║    /data-analyst                         ║
║    /data-scientist                       ║
║    /ml-engineer                          ║
║    /ai-engineer                          ║
║    /data-engineer                        ║
║    /data-modeller                        ║
║    /mlops-engineer                       ║
║    /bi-engineer                          ║
║    /researcher                           ║
║    /backend-engineer                     ║
║    /applied-ml-scientist                 ║
║    /deep-learning-engineer               ║
║    /brainstorm                           ║
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
