# Plan: Gemini CLI Compatibility for Shards

## Context

Shards is currently tightly coupled to Claude Code — every agent file, command, hook, and installer path assumes `.claude/` directories, Claude Code tool names, and Claude Code's `Task()` orchestration syntax. The goal is to make the package installable and functional on **both Claude Code and Gemini CLI** without maintaining two separate copies of the 100+ agent/instruction files.

## Approach: Build-time Transformation

Keep source files in `src/` in their current Claude Code format (single source of truth). The installer detects or accepts a `--platform` flag and applies deterministic transformations when targeting Gemini. No source files in `src/agents/`, `src/commands/`, or `src/templates/` change.

---

## Step 1: Create `tools/transform.js` — Platform Transformation Engine

New file. Exports functions used by the installer to transform file contents for the target platform.

### 1a. Tool name mapping

```javascript
const TOOL_MAP = {
  gemini: {
    'Read': 'ReadFile',
    'Write': 'WriteFile',
    'Glob': 'FindFiles',
    'Grep': 'SearchText',
    'Bash': 'Shell',
    'WebSearch': 'GoogleSearch',
    'NotebookEdit': 'Shell',  // no direct equivalent
    'Task': null,             // handled separately — subagents are tools by name
    // Edit, WebFetch — same name on both platforms
  }
};
```

### 1b. `transformFrontmatter(content, platform)`

- Parse YAML frontmatter from agent `.md` files
- Map `tools:` values using `TOOL_MAP` (remove `Task` — Gemini agents are callable as tools by name)
- Map `model:` field (`opus` → `gemini-2.5-pro`, `sonnet` → `gemini-2.5-flash`) via a configurable `MODEL_MAP`
- Add `kind: local` for Gemini agents
- Preserve all other fields, pass through unknown ones

### 1c. `transformPaths(content, platform)`

Regex replacements on the markdown body:
- `.claude/agents/specific_instructions/` → `.gemini/agents/specific_instructions/`
- `.claude/agents/` → `.gemini/agents/`
- `.claude/commands/` → `.gemini/commands/`
- `.claude/settings.json` → `.gemini/settings.json`
- `CLAUDE.md` → `GEMINI.md` (only when referring to the context file, not as a generic string)

Order: longest prefix first to avoid partial matches.

### 1d. `transformToolReferences(content, platform)`

Replace backtick-quoted tool names in prose (`` `Read` `` → `` `ReadFile` ``, `` `Bash` `` → `` `Shell` ``, etc.). Leave bare English words like "Read the file" alone — the LLM infers the right tool from context.

### 1e. `transformTaskCalls(content, platform)`

The hardest transformation. Current pattern (64+ occurrences):

```
Task(
  subagent_type="data-modeller",
  description="Explore data model for [topic]",
  prompt="I am the Data Analyst shard..."
)
```

Gemini equivalent — agents in `.gemini/agents/` are callable as tools by name:

```
Call the `data-modeller` agent with the following task:

"Explore data model for [topic].
I am the Data Analyst shard..."
```

Regex to match: `Task\(\s*subagent_type="([^"]+)",?\s*(?:description="([^"]*)",?\s*)?prompt="([\s\S]*?)"\s*\)` — extract agent name, description, and prompt, then reformat. Also handle triple-quoted `"""..."""` prompt blocks.

Add a validation step: after transformation, scan for any remaining `Task(` references and warn.

### 1f. `transformCommand(content, platform)`

Convert `.md` command files to `.toml` format for Gemini:

**Input (Claude Code `.md`):**
```yaml
---
description: Start a Shards session...
---
[markdown body]
```

**Output (Gemini `.toml`):**
```toml
description = "Start a Shards session..."
prompt = """
[markdown body with path/tool transforms applied]
"""
```

---

## Step 2: Refactor `tools/install.js` — Platform-Aware Installation

### 2a. Add `--platform` CLI flag

```
npx shards install                    # auto-detect
npx shards install --platform=claude  # force Claude Code
npx shards install --platform=gemini  # force Gemini CLI
npx shards install --platform=both   # install for both
```

Auto-detection logic: check for `.claude/` → claude, `.gemini/` → gemini, both → both, neither → prompt user.

### 2b. Platform configuration object

```javascript
const PLATFORMS = {
  claude: {
    configDir: '.claude',
    agentsDir: '.claude/agents',
    commandsDir: '.claude/commands',
    contextFile: 'CLAUDE.md',
    settingsFile: '.claude/settings.json',
    commandExt: '.md',
  },
  gemini: {
    configDir: '.gemini',
    agentsDir: '.gemini/agents',
    commandsDir: '.gemini/commands',
    contextFile: 'GEMINI.md',
    settingsFile: '.gemini/settings.json',
    commandExt: '.toml',
  }
};
```

### 2c. Modify `copyDir` to apply transforms

Instead of raw `fs.copyFileSync`, agent and command files pass through the transformation engine before writing. Templates and UI files copy as-is (they're platform-agnostic).

### 2d. Update manifest for per-platform tracking

```json
{
  "version": "x.y.z",
  "platforms": {
    "claude": { "installedAt": "...", "files": [...] },
    "gemini": { "installedAt": "...", "files": [...] }
  }
}
```

Manifest location: `.shards/.shards-manifest.json` (moved from `.claude/` to a neutral location).

### 2e. Context file generation

For Gemini: write the same Shards documentation block to `GEMINI.md` instead of `CLAUDE.md`. Replace any Claude Code-specific references in the block content.

### 2f. Update uninstall to handle per-platform removal

`npx shards uninstall` removes all platforms. `npx shards uninstall --platform=gemini` removes only Gemini files.

---

## Step 3: Hook Event Mapping for Shards UI

Modify `tools/shards-ui.js` to write platform-appropriate hooks.

| Claude Code Hook | Gemini CLI Hook |
|-----------------|----------------|
| `UserPromptSubmit` | `BeforeModel` |
| `Stop` | `AfterAgent` |
| `PostToolUse` | `AfterTool` |

Write hooks to the correct settings file (`.claude/settings.json` or `.gemini/settings.json`). The relay script (`src/ui/relay.js`) accepts event type as an argument — just pass the Gemini event names. Minor update to relay.js to normalize both sets of event names to internal event types.

---

## Step 4: Handle Edge Cases

### 4a. NotebookEdit fallback
For Gemini, where `NotebookEdit` doesn't exist: in agent files that reference it (data-scientist, ml-engineer, ai-engineer phases), add a small instruction block explaining how to create/modify notebooks using `Shell` (e.g., write JSON directly or use `jupyter nbconvert`).

### 4b. Model mapping
Provide a `MODEL_MAP` constant in `transform.js`. Default: `opus` → `gemini-2.5-pro`, `sonnet` → `gemini-2.5-flash`. Allow override via environment variable `SHARDS_MODEL_MAP` or a `.shards/config.json` file.

### 4c. Persona transfer in Syn
Syn's command file references `.claude/agents/syn.md` — this path gets rewritten. The `/compact` instruction is Claude Code-specific; for Gemini, replace with equivalent context management advice.

---

## Files Modified

| File | Change |
|------|--------|
| `tools/transform.js` | **New** — transformation engine |
| `tools/install.js` | Major refactor — platform detection, transform integration, manifest update |
| `tools/shards-ui.js` | Add Gemini hook setup |
| `src/ui/relay.js` | Normalize Gemini event names |
| `package.json` | Update description, add keywords |

**No changes to any files in `src/agents/`, `src/commands/`, or `src/templates/`.**

---

## Verification

1. Run `node tools/install.js --platform=claude` in a test directory → verify output matches current behavior exactly
2. Run `node tools/install.js --platform=gemini` in a test directory → verify:
   - `.gemini/agents/*.md` files have correct frontmatter (Gemini tool names, model mapping)
   - All `.claude/` paths rewritten to `.gemini/`
   - All `Task()` blocks rewritten to Gemini delegation syntax
   - `.gemini/commands/*.toml` files generated correctly
   - `GEMINI.md` created with correct content
3. Grep transformed output for any remaining `Task(`, `.claude/`, or Claude-only tool names — should find zero
4. Run `node tools/install.js --platform=both` → verify both directories populated correctly
5. Test `node tools/install.js uninstall --platform=gemini` → verify only Gemini files removed
6. Test the Shards UI with Gemini hooks configured
