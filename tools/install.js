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

// Directories that should never be installed (test artifacts, dev tooling).
const SKIP_DIRS = new Set(['__tests__', '__mocks__', 'node_modules', '.git']);

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
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

  // Remove shards-installed hook entries from settings.json.
  //
  // Preferred: exact-match removal using the `hookEntries` field recorded by
  // the installer in the manifest. Each recorded entry has { event, matcher,
  // command } that we strip surgically.
  //
  // Fallback (legacy manifests without `hookEntries`): substring filter on
  // both `gate-hook.js` and `.shards/ui/relay.js`. Necessary because old
  // installs predate the exact-match recording.
  const settingsPath = path.join(CLAUDE_DIR, "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      let settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (settings.hooks) {
        const recordedEntries = Array.isArray(manifest.hookEntries)
          ? manifest.hookEntries
          : null;

        const stripFromEvent = (eventName) => {
          if (!Array.isArray(settings.hooks[eventName])) return;
          settings.hooks[eventName] = settings.hooks[eventName].filter((entry) => {
            if (!entry.hooks) return true;
            if (recordedEntries) {
              // Exact-match path: drop the entry only if all of its inner
              // hooks match a recorded (event, matcher, command) triple.
              const allMatchRecorded = entry.hooks.every((h) =>
                recordedEntries.some(
                  (rec) =>
                    rec.event === eventName &&
                    (rec.matcher || "") === (entry.matcher || "") &&
                    rec.command === h.command
                )
              );
              return !allMatchRecorded;
            }
            // Legacy substring fallback.
            return !entry.hooks.some(
              (h) =>
                h.command &&
                (h.command.includes("gate-hook.js") ||
                  h.command.includes(".shards/ui/relay.js"))
            );
          });
        };

        stripFromEvent("Stop");
        stripFromEvent("PreToolUse");
        stripFromEvent("UserPromptSubmit");
        stripFromEvent("PostToolUse");
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("  ✓ Removed shards hook entries from .claude/settings.json");
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

  // 6. Seed .claude/settings.json with readonly preset and PreToolUse hook.
  //
  // Hook commands use `$CLAUDE_PROJECT_DIR` (substituted by Claude Code at
  // hook execution time) instead of absolute paths so the committed
  // settings.json is portable across developers and machines. See:
  // https://code.claude.com/docs/en/hooks
  const settingsPath = path.join(CLAUDE_DIR, "settings.json");
  const relayCmd = (subcmd) =>
    `node $CLAUDE_PROJECT_DIR/.shards/ui/relay.js ${subcmd}`;
  const gateCmd = (subcmd) =>
    `node $CLAUDE_PROJECT_DIR/.shards/hooks/gate-hook.js ${subcmd}`;

  // Relay hooks — feed live events to the Shards UI for all four hook points
  // the UI cares about. Reference: see .claude/settings.json events feeding
  // src/ui/relay.js (chat-session.js consumes pre-tool-use, post-tool-use,
  // user-prompt, and stop).
  const preToolUseHook = {
    matcher: "Bash",
    hooks: [{ type: "command", command: relayCmd("pre-tool-use") }],
  };
  const relayStopHook = {
    matcher: "",
    hooks: [{ type: "command", command: relayCmd("stop") }],
  };
  const relayUserPromptHook = {
    matcher: "",
    hooks: [{ type: "command", command: relayCmd("user-prompt") }],
  };
  const relayPostToolUseHook = {
    matcher: "",
    hooks: [{ type: "command", command: relayCmd("post-tool-use") }],
  };

  // Gate hooks — enforce the ::GATE:: workflow pattern.
  const gateStopHook = {
    matcher: "",
    hooks: [{ type: "command", command: gateCmd("stop") }],
  };
  const gatePreToolUseHook = {
    matcher: "",
    hooks: [{ type: "command", command: gateCmd("pre-tool-use") }],
  };
  const gateUserPromptSubmitHook = {
    matcher: "",
    hooks: [{ type: "command", command: gateCmd("user-prompt-submit") }],
  };

  // Flat list of (event, matcher, command) triples recorded in the manifest
  // so uninstall can surgically remove ONLY the entries the installer wrote.
  const installedHookEntries = [
    { event: "PreToolUse", matcher: "Bash", command: relayCmd("pre-tool-use") },
    { event: "PreToolUse", matcher: "", command: gateCmd("pre-tool-use") },
    { event: "Stop", matcher: "", command: gateCmd("stop") },
    { event: "Stop", matcher: "", command: relayCmd("stop") },
    { event: "UserPromptSubmit", matcher: "", command: gateCmd("user-prompt-submit") },
    { event: "UserPromptSubmit", matcher: "", command: relayCmd("user-prompt") },
    { event: "PostToolUse", matcher: "", command: relayCmd("post-tool-use") },
  ];

  // Permission rules for shards specialists.
  //
  // BASE_ALLOW: narrow Bash patterns + Edit globs that pre-approve the
  // tool calls specialists routinely make. Pre-approval means CC's
  // permission system green-lights the call before any prompt or auto-mode
  // classifier round-trip — the smoothest possible path.
  //
  // All patterns are narrow (no `Bash(*)` blanket) so they survive auto
  // mode's pruning of broad rules. `Edit(<dir>/**)` covers Write, Edit,
  // AND NotebookEdit per CC permissions spec.
  //
  // We omit entries for commands CC already treats as read-only built-ins
  // (ls, cat, echo, pwd, head, tail, grep, find, wc, which, diff, stat,
  // du, cd, read-only git forms) — those auto-approve in every mode
  // regardless of allow rules.
  const BASE_ALLOW = [
    // ── Git read-only beyond CC built-ins ──
    "Bash(git log:*)", "Bash(git status:*)", "Bash(git diff:*)",
    "Bash(git branch:*)", "Bash(git show:*)", "Bash(git rev-parse:*)",
    "Bash(git remote:*)", "Bash(git tag:*)", "Bash(git stash list:*)",

    // ── File / text tooling not in CC's built-in read-only set ──
    "Bash(tree:*)", "Bash(less:*)", "Bash(df:*)",
    "Bash(rg:*)", "Bash(ag:*)", "Bash(fzf:*)", "Bash(jq:*)",

    // ── Shell intros / environment probes ──
    "Bash(env:*)", "Bash(printenv:*)", "Bash(type:*)",
    "Bash(command -v:*)", "Bash(uname:*)", "Bash(whoami:*)",

    // ── dbt — read-only subcommands ──
    "Bash(dbt show:*)", "Bash(dbt ls:*)", "Bash(dbt list:*)",
    "Bash(dbt parse:*)", "Bash(dbt compile:*)", "Bash(dbt deps:*)",
    "Bash(dbt debug:*)", "Bash(dbt source freshness:*)",

    // ── dbt — mutating commands specialists routinely run ──
    "Bash(dbt build:*)", "Bash(dbt run:*)", "Bash(dbt test:*)",
    "Bash(dbt seed:*)", "Bash(dbt snapshot:*)",

    // ── Python test execution ──
    "Bash(pytest:*)", "Bash(python -m pytest:*)",
    "Bash(python3 -m pytest:*)",

    // ── Jupyter notebook execution scoped to shards output dirs ──
    "Bash(jupyter nbconvert --execute analysis/*)",
    "Bash(jupyter nbconvert --execute studies/*)",
    "Bash(jupyter nbconvert --execute models/*)",
    "Bash(jupyter nbconvert --execute research/*)",
    "Bash(jupyter nbconvert --execute services/*)",

    // ── BigQuery CLI — read-mostly ──
    "Bash(bq query --dry_run:*)", "Bash(bq query --max_rows:*)",
    "Bash(bq show:*)", "Bash(bq ls:*)", "Bash(bq head:*)",

    // ── mkdir scoped to shards output dirs ──
    "Bash(mkdir -p analysis/*)", "Bash(mkdir -p studies/*)",
    "Bash(mkdir -p models/*)", "Bash(mkdir -p services/*)",
    "Bash(mkdir -p data_models/*)", "Bash(mkdir -p dashboards/*)",
    "Bash(mkdir -p research/*)", "Bash(mkdir -p fixes/*)",
    "Bash(mkdir -p presentations/*)", "Bash(mkdir -p panels/*)",
    "Bash(mkdir -p brainstorm/*)", "Bash(mkdir -p .shards/*)",

    // ── Package metadata ──
    "Bash(pip list:*)", "Bash(pip show:*)", "Bash(pip freeze:*)",
    "Bash(npm ls:*)", "Bash(npm list:*)",
    "Bash(npm outdated:*)", "Bash(npm view:*)",

    // ── Version probes ──
    "Bash(node --version:*)", "Bash(python --version:*)",
    "Bash(python3 --version:*)", "Bash(dbt --version:*)",
    "Bash(git --version:*)",

    // ── File edits scoped to shards output directories ──
    // `Edit(<glob>)` covers Write, Edit, AND NotebookEdit per CC spec.
    // `**` is gitignore-recursive — matches at any depth.
    "Edit(analysis/**)", "Edit(studies/**)", "Edit(models/**)",
    "Edit(services/**)", "Edit(data_models/**)", "Edit(dashboards/**)",
    "Edit(research/**)", "Edit(fixes/**)", "Edit(presentations/**)",
    "Edit(panels/**)", "Edit(brainstorm/**)", "Edit(.shards/**)",

    // ── Shards UI bridge ──
    "Bash(node .shards/ui/ui-push.js:*)",
    "Bash(node .shards/ui/relay.js pre-tool-use:*)",
  ];

  // BASE_DENY: hard floor — blocks even when an allow rule, a hook, or the
  // auto-mode classifier would let the call through (deny > ask > allow per
  // CC spec). CC splits compound commands and requires each subcommand to
  // match independently, so dangerous chains need each side listed.
  const BASE_DENY = [
    // Evil-script execution paths
    "Bash(sh -c *)", "Bash(bash -c *)",

    // Force-push protection — git accepts the flag in multiple positions
    // and with optional remote/refspec args. We list each shape explicitly
    // because CC permission patterns use a single `*` that spans args but
    // requires at least one token where written (so trailing `*` and a bare
    // form are distinct patterns).
    "Bash(git push --force)", "Bash(git push -f)",
    "Bash(git push --force *)", "Bash(git push -f *)",
    "Bash(git push * --force *)", "Bash(git push * -f *)",
    "Bash(git push * --force)", "Bash(git push * -f)",

    // Push to main/master — both bare and with trailing args
    "Bash(git push origin main)", "Bash(git push origin main *)",
    "Bash(git push origin master)", "Bash(git push origin master *)",

    // rm -rf with --no-preserve-root may bypass CC's built-in circuit
    // breaker for plain `rm -rf /` and `rm -rf ~`
    "Bash(rm -rf --no-preserve-root *)",
  ];

  // BASE_ASK: force a prompt under all modes — including `auto` where the
  // classifier would otherwise auto-approve. Use sparingly for high-stakes
  // operations where explicit human review is non-negotiable.
  const BASE_ASK = [
    // Production-target dbt invocations
    "Bash(dbt run --target prod*)",
    "Bash(dbt build --target prod*)",
    "Bash(dbt seed --target prod*)",
    "Bash(dbt snapshot --target prod*)",
  ];

  if (!fs.existsSync(settingsPath)) {
    const defaultSettings = {
      hooks: {
        Stop: [gateStopHook, relayStopHook],
        PreToolUse: [preToolUseHook, gatePreToolUseHook],
        UserPromptSubmit: [gateUserPromptSubmitHook, relayUserPromptHook],
        PostToolUse: [relayPostToolUseHook],
      },
      permissions: {
        allow: BASE_ALLOW,
        deny: BASE_DENY,
        ask: BASE_ASK,
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
    console.log("\n🔐 Created .claude/settings.json with shards permissions preset");
  } else {
    // Ensure hooks are present on existing installs.
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch {}
    if (!settings.hooks) settings.hooks = {};
    let changed = false;

    // Generic dedup: add `entry` under settings.hooks[eventName] unless an
    // entry with the same matcher + same `command` (exact match OR substring
    // match against `dedupSubstring` so legacy absolute-path entries are
    // recognized as already-present) is already there. Matcher comparison
    // normalizes case+whitespace so a user-edited "Bash " or "bash" still
    // recognises the installer-shipped "Bash" — without this, re-install would
    // happily append a duplicate hook for the same logical (event, matcher,
    // command) triple, multiplying the per-tool-call hook firing.
    const normMatcher = (m) => String(m || "").trim().toLowerCase();
    const ensureHookEntry = (eventName, entry, dedupSubstring) => {
      if (!Array.isArray(settings.hooks[eventName])) settings.hooks[eventName] = [];
      const targetCmd = entry.hooks[0].command;
      const targetMatcher = normMatcher(entry.matcher);
      const exists = settings.hooks[eventName].some((existing) => {
        if (normMatcher(existing.matcher) !== targetMatcher) return false;
        if (!Array.isArray(existing.hooks)) return false;
        return existing.hooks.some((h) => {
          if (!h.command) return false;
          if (h.command === targetCmd) return true;
          // Recognize legacy variants (absolute paths, alternate quoting) so
          // we don't double-register on re-install.
          return dedupSubstring && h.command.includes(dedupSubstring);
        });
      });
      if (!exists) {
        settings.hooks[eventName].push(entry);
        changed = true;
      }
    };

    // Relay hooks — all four hook points the UI feeds on. Dedup substrings
    // identify each by the relay subcommand so legacy absolute-path entries
    // (e.g. `node /Users/.../relay.js pre-tool-use`) are treated as
    // already-present.
    ensureHookEntry("PreToolUse", preToolUseHook, "relay.js pre-tool-use");
    ensureHookEntry("Stop", relayStopHook, "relay.js stop");
    ensureHookEntry("UserPromptSubmit", relayUserPromptHook, "relay.js user-prompt");
    ensureHookEntry("PostToolUse", relayPostToolUseHook, "relay.js post-tool-use");

    // Gate hooks.
    ensureHookEntry("Stop", gateStopHook, "gate-hook.js stop");
    ensureHookEntry("PreToolUse", gatePreToolUseHook, "gate-hook.js pre-tool-use");
    ensureHookEntry("UserPromptSubmit", gateUserPromptSubmitHook, "gate-hook.js user-prompt-submit");

    // Merge missing permission patterns (non-destructive — only adds, never removes).
    // Existing user-added entries and legacy entries are preserved as-is; only the
    // BASE_* patterns missing from the current settings get appended.
    if (!settings.permissions) settings.permissions = {};

    // Canonicalize a permission pattern so the `:*` suffix shorthand and the
    // equivalent space-then-`*` form are treated as the same entry. Per CC
    // docs, `Bash(cmd:*)`, `Bash(cmd *)`, and `Bash(cmd*)` all match the same
    // set of commands; treating them as distinct led to settings.json
    // accumulating dead duplicates on every reinstall.
    //
    // Scope: only Bash() patterns. Edit()/Read() use gitignore-style globs
    // where `**` (recursive) is meaningfully distinct from `*` (single-level)
    // — collapsing `Edit(analysis/**)` to `Edit(analysis/*)` would silently
    // narrow the rule.
    //
    // The negative lookbehind `(?<!\*)` on the single-`*` branch protects any
    // intentional `**` sequence inside a Bash arg from being shortened.
    const canonPattern = (p) => {
      if (typeof p !== "string") return p;
      if (!/^Bash\(/.test(p)) return p;
      return p.replace(/(?:\s*:\*|(?<!\*)\s*\*)\)\s*$/, ")");
    };

    // Drop existing entries that are duplicates under canonicalization. Keep
    // the first occurrence of each canonical form. This is the migration path
    // for installs that already accumulated `Bash(...*)` + `Bash(...:*)` pairs.
    const dedupeCanonical = (key) => {
      if (!Array.isArray(settings.permissions[key])) return 0;
      const seen = new Set();
      const kept = [];
      let dropped = 0;
      for (const entry of settings.permissions[key]) {
        const canon = canonPattern(entry);
        if (seen.has(canon)) { dropped++; continue; }
        seen.add(canon);
        kept.push(entry);
      }
      if (dropped > 0) {
        settings.permissions[key] = kept;
        changed = true;
      }
      return dropped;
    };

    const mergeMissing = (key, patterns) => {
      if (!Array.isArray(settings.permissions[key])) settings.permissions[key] = [];
      const existing = new Set(settings.permissions[key].map(canonPattern));
      let added = 0;
      for (const pattern of patterns) {
        const canon = canonPattern(pattern);
        if (!existing.has(canon)) {
          settings.permissions[key].push(pattern);
          existing.add(canon);
          added++;
          changed = true;
        }
      }
      return added;
    };

    const allowDropped = dedupeCanonical("allow");
    const denyDropped  = dedupeCanonical("deny");
    const askDropped   = dedupeCanonical("ask");
    const totalDropped = allowDropped + denyDropped + askDropped;
    if (totalDropped > 0) {
      console.log(`\n🧹 Removed ${totalDropped} duplicate permission patterns (\`*\`/\`:*\` variants)`);
    }

    const allowAdded = mergeMissing("allow", BASE_ALLOW);
    const denyAdded  = mergeMissing("deny",  BASE_DENY);
    const askAdded   = mergeMissing("ask",   BASE_ASK);

    if (allowAdded > 0) console.log(`\n🔐 Added ${allowAdded} allow patterns to .claude/settings.json`);
    if (denyAdded  > 0) console.log(`🔐 Added ${denyAdded} deny patterns to .claude/settings.json`);
    if (askAdded   > 0) console.log(`🔐 Added ${askAdded} ask patterns to .claude/settings.json`);

    if (changed) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("\n🔐 Updated .claude/settings.json with gate enforcement hooks");
    } else {
      console.log("\n🔐 .claude/settings.json already exists (preserved)");
    }
  }

  // 6a. Create .shards/auto/ for auto-verify state and audit log
  const autoDir = path.join(SHARDS_DIR, "auto");
  if (!fs.existsSync(autoDir)) {
    fs.mkdirSync(autoDir, { recursive: true });
    console.log("\n🤖 Created .shards/auto/ (auto-verify mode state and audit log)");
  }

  // 6b. Create .shards/notebooks/ for Notebook Walkthrough mode kernel sessions
  const notebooksDir = path.join(SHARDS_DIR, "notebooks");
  if (!fs.existsSync(notebooksDir)) {
    fs.mkdirSync(notebooksDir, { recursive: true });
    console.log("\n📓 Created .shards/notebooks/ (notebook walkthrough kernel sessions)");
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
  const outputDirs = ["analysis", "studies", "models", "data_models", "services", "research", "dashboards", "brainstorm", "fixes", "projects", "presentations", "panels"];
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
    "\n# shards — agent output directories (optional — remove comments to track)\n# analysis/\n# studies/\n# models/\n# data_models/\n# services/\n# research/\n# dashboards/\n# brainstorm/\n# fixes/\n# projects/\n# presentations/\n# panels/\n";
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
    // Flat record of hook entries (event + matcher + command) the installer
    // wrote into .claude/settings.json. Uninstall uses these for exact-match
    // surgical removal — see uninstall(). Legacy manifests without this field
    // fall back to substring matching against gate-hook.js / .shards/ui/relay.js.
    hookEntries: installedHookEntries,
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
- \`presentations/\` — Syn Slides Mode decks
- \`panels/\` — Syn Panel Review reports (multi-specialist directory audits)

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

  // Tool-call conventions primer. Read by the user and — when active — by
  // Claude Code's auto-mode classifier. The classifier sees CLAUDE.md on
  // every action check, so this section primes it on what counts as routine
  // Shards specialist work and avoids false-positive denials.
  const conventionsBlock = `
## Shards — Tool-call conventions

This section describes what counts as routine tool-call activity inside a
Shards session. It is read by Claude and — when the user has enabled Claude
Code's auto mode — by the auto-mode classifier, so that working specialist
operations are not mistaken for unusual behavior.

### File writes

Shards specialists write artifacts into a fixed set of project-root
subdirectories — \`analysis/\`, \`studies/\`, \`models/\`, \`services/\`,
\`data_models/\`, \`dashboards/\`, \`research/\`, \`presentations/\`,
\`panels/\`, \`fixes/\`, \`brainstorm/\` — and into the \`.shards/\` state
directory. Writes inside these scopes (including each project's
\`project-specs.md\`, generated notebooks, SQL files, dashboard code, and
service code) are normal specialist work. Writes outside these scopes are
unusual and warrant review.

### Bash commands

The following commands are part of routine validation and execution flow:

- **dbt:** \`dbt show\`, \`dbt ls\`, \`dbt parse\`, \`dbt compile\`,
  \`dbt deps\`, \`dbt debug\`, \`dbt source freshness\`, plus mutating runs
  against developer-configured (non-production) targets: \`dbt run\`,
  \`dbt build\`, \`dbt test\`, \`dbt seed\`, \`dbt snapshot\`. Production-target
  invocations (\`--target prod*\`) require explicit user approval.
- **Notebook execution:** \`jupyter nbconvert --execute\` against notebooks
  under the output directories listed above.
- **Python tests:** \`pytest\` and \`python -m pytest\` against the project's
  test suite.
- **Warehouse exploration:** \`bq query --dry_run\`, \`bq query --max_rows\`,
  \`bq show\`, \`bq ls\`, \`bq head\`, and \`SELECT\`-only invocations of
  \`psql\`, \`snowsql\`, and similar warehouse CLIs against developer-configured
  warehouses. These are read-only validation, not exfiltration.

### Workflow gates vs. safety boundaries

Phase transitions in a Shards session are paced by \`::GATE:: ... ::ENDGATE::\`
fences enforced by a local hook at \`.shards/hooks/gate-hook.js\`. These gates
are **workflow checkpoints** — they pause the agent so the user can review the
phase before advancing. They are not safety boundaries. Safety is enforced by
the permission allow/deny rules in \`.claude/settings.json\` and, when active,
the auto-mode classifier. Tool calls between gate fences are part of normal
specialist execution and do not require additional per-call review beyond the
standard permissions layer.

### What is unusual

Operations that should trigger careful review even inside a Shards session:

- Writes outside the output directories above (especially \`.git\`,
  \`node_modules\`, system paths, or other projects' directories).
- Network requests beyond developer-configured warehouses and read-only API
  documentation lookups.
- Production-target dbt invocations, force pushes, pushes to \`main\` or
  \`master\`, and destructive shell commands.

These cases are not part of routine Shards workflow and should prompt for
explicit user approval regardless of permission mode.
`;

  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, "utf8");
    // Detect the three cases:
    //   1. Source repo: PROJECT_DIR is the shards repo itself (we detect this
    //      by the presence of tools/install.js at the project root — i.e. the
    //      file being executed is local to PROJECT_DIR). Skip CLAUDE.md edits.
    //   2. Previous install: file contains the installer-appended Agent Suite
    //      marker. Backfill the conventions block if missing.
    //   3. Fresh install: append both sections.
    //
    // We do NOT use a generic "contains the word Shards" guard — that gives a
    // false-positive against any user file that mentions Shards in prose or
    // code samples and silently skips the install. Only the actual marker
    // section header (or source-repo detection) is load-bearing.
    const isSourceRepo  = fs.existsSync(path.join(PROJECT_DIR, "tools", "install.js")) &&
                          fs.existsSync(path.join(PROJECT_DIR, "src", "agents")) &&
                          fs.existsSync(path.join(PROJECT_DIR, "package.json")) &&
                          path.resolve(PROJECT_DIR) === path.resolve(PACKAGE_ROOT);
    const hasAgentSuite  = content.includes("## Shards — Agent Suite");
    const hasConventions = content.includes("## Shards — Tool-call conventions");

    if (isSourceRepo) {
      console.log("\n📝 CLAUDE.md detected as shards source repo — preserved as-is");
    } else if (!hasAgentSuite && !hasConventions) {
      // First-time install into a CLAUDE.md without installer markers — append
      // both sections.
      fs.appendFileSync(claudeMdPath, claudeBlock + conventionsBlock);
      console.log("\n📝 Appended Shards sections to existing CLAUDE.md");
    } else if (hasAgentSuite && !hasConventions) {
      // Previous install — backfill the new conventions block only.
      fs.appendFileSync(claudeMdPath, conventionsBlock);
      console.log("\n📝 Appended Shards Tool-call conventions section to existing CLAUDE.md");
    } else if (!hasAgentSuite && hasConventions) {
      // Unusual but possible — conventions present without Agent Suite header.
      // Backfill just the Agent Suite block.
      fs.appendFileSync(claudeMdPath, claudeBlock);
      console.log("\n📝 Appended Shards Agent Suite section to existing CLAUDE.md");
    } else {
      // Fully up-to-date.
      console.log("\n📝 CLAUDE.md already has Shards sections (preserved)");
    }
  } else {
    fs.writeFileSync(claudeMdPath, `# Project\n${claudeBlock}${conventionsBlock}`);
    console.log("\n📝 Created CLAUDE.md with Shards sections");
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
║  Notebook walkthrough mode:              ║
║    /notebook-walkthrough                 ║
║    (requires: pip install jupyter_client ║
║               ipykernel)                 ║
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
