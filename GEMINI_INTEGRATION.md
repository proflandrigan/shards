# Implementation Plan: Gemini CLI Support for Shards

This plan outlines the steps to make the Shards agent suite and UI compatible with Gemini CLI, while maintaining full compatibility with Claude Code.

## Objective
- Enable Shards specialists to run as sub-agents in Gemini CLI.
- Map Claude's `Task` tool to Gemini CLI's sub-agent mechanism.
- Integrate Shards UI with Gemini CLI hooks.
- Provide a seamless installation process for both environments.

## Proposed Solution

### 1. Project Structure & Installation
- Update `tools/install.js` to support Gemini CLI:
    - Install agents and `specific_instructions/` to both `.claude/agents/` and `.gemini/agents/`.
    - Create `.gemini/settings.json` with initial configuration.
    - Create a `GEMINI.md` file mirroring `CLAUDE.md`.
    - Add a `Task.md` sub-agent to `.gemini/agents/` to emulate Claude's `Task` tool.

### 2. Shards UI Integration
- Update `tools/shards-ui.js` to configure Gemini CLI hooks:
    - `BeforeAgent` (user prompt)
    - `AfterAgent` (agent response)
    - `BeforeTool` (pre-tool-use)
    - `AfterTool` (post-tool-use)
    - `SessionEnd` (session termination)
- Update `src/ui/relay.js` to handle Gemini CLI's hook payloads (JSON on stdin):
    - Adapt to Gemini's prompt/response formats (which differ from Claude's transcript format).
    - Maintain existing Claude Code relay functionality.

### 3. Task Tool Emulation
- Create `src/agents/Task.md` (to be installed as `.gemini/agents/Task.md`):
    - Define a sub-agent named `Task` that takes `subagent_type`, `description`, and `prompt`.
    - Instructions: "Call the sub-agent tool named after the `subagent_type` and pass the `prompt` to it."
    - This allows all existing Shards prompts (which use `Task(...)`) to work without any changes to the specialists' instructions.

### 4. Persona Transfer & Sub-agents
- In Gemini CLI, Shards can be used in two ways:
    1. **Single-session persona transfer:** Same as Claude Code. The main agent reads `.claude/agents/<agent>.md` and adopts the persona.
    2. **Sub-agent delegation:** Use Gemini CLI's native sub-agent support. "Ask the data-analyst to [task]."
- The `Task` sub-agent will bridge the gap between these two modes when agents consult each other.

## Key Files & Context
- `tools/install.js`: The installer.
- `tools/shards-ui.js`: UI setup and hook configuration.
- `src/ui/relay.js`: Hook event forwarder.
- `src/agents/Task.md`: New emulation sub-agent.
- `package.json`: Updated metadata.

## Implementation Steps

### Phase 0: Meta
1.  **Create `GEMINI_INTEGRATION.md`**:
    - Copy this implementation plan to the root of the project for reference.

### Phase 1: Relay & UI Setup
1.  **Modify `src/ui/relay.js`**:
    - Add logic to detect Gemini CLI payloads (checking `hook_event_name` in JSON).
    - Handle `BeforeAgent` (extract `prompt`).
    - Handle `AfterAgent` (extract `prompt_response`).
    - Handle `BeforeTool` and `AfterTool` (extract `tool_name`, `tool_input`).
    - Ensure robust extraction of content strings (handling both Gemini's flat strings and Claude's complex content blocks).
2.  **Modify `tools/shards-ui.js`**:
    - Update `setupHooks()` to also detect `.gemini` directory.
    - Write Gemini-specific hook configurations to `.gemini/settings.json`.
    - Ensure permissions are set correctly for `ui-push.js` and `relay.js`.

### Phase 2: Installation & Agents
1.  **Modify `tools/install.js`**:
    - Define `GEMINI_DIR = path.join(PROJECT_DIR, ".gemini")`.
    - In `install()`, copy agents and commands to `.gemini/agents/`.
    - Create/Update `GEMINI.md` with instructions for Gemini CLI users.
2.  **Create `src/agents/Task.md`**:
    - A simple delegation sub-agent as described above.

### Phase 3: Documentation
1.  **Update `README.md`**:
    - Mention Gemini CLI support.
2.  **Create `GEMINI.md`**:
    - Provide a guide similar to `CLAUDE.md` but for Gemini CLI.

## Verification & Testing
1.  **Relay Test**: Run `node tools/shards-ui.js start` and manually send Gemini-style JSON payloads to `relay.js` via stdin. Verify they appear in the UI.
2.  **Installation Test**: Run `node tools/install.js` and verify `.gemini/agents/` and `.gemini/settings.json` are created correctly.
3.  **End-to-End Gemini Test**: Open Gemini CLI, run `/shards` (if configured) or call a specialist sub-agent, and verify:
    - The specialist follows its instructions.
    - Hook events are correctly relayed to the UI.
    - The `Task` delegation works when one agent consults another.

## Rollback Strategy
- The installer already creates backups (`.backup`) of existing files.
- `shards-ui stop` and `install uninstall` already exist to clean up.
- All changes are additive (adding `.gemini/` files) or backward-compatible (updating `relay.js`).
