# Notebook execution (shards runtime)

Developer notes for the notebook tools that drive a Jupyter kernel for `[NW]` Notebook Walkthrough and for any agent that runs notebook cells. Covers `runtime/notebook/kernel.py`, the `notebook_*` MCP tools, and the `notebook-walkthrough` command. Describes what the code does today. Open items are marked `OPEN` or `TODO(owner: proflandrigan)`.

## 1. Purpose

Notebook cells run in a persistent kernel, one per session, so variables survive between calls. Agents do not run notebook code through ad-hoc Bash or a direct Python call. All execution goes through the tools below.

- Helper: `runtime/notebook/kernel.py`, a `jupyter_client` kernel wrapper.
- Per-session state: `.shards/notebooks/<session>/` under the project root.
- No shell is used. Python is discovered as `python3`, then `python` (`py` on Windows). Set `SHARDS_PYTHON` to override.

## 2. MCP tools

| Tool | Input | Behaviour |
|------|-------|-----------|
| `notebook_start` | `notebook`, `session?` | Starts a kernel for the `.ipynb` file. Creates the session state directory. |
| `notebook_exec` | `session`, `cell` | Runs one cell by index and returns its outputs. |
| `notebook_run_all` | `session` | Runs every cell in order. |
| `notebook_stop` | `session` | Shuts the kernel down. |

If `jupyter_client` or `ipykernel` is missing, each tool returns an install hint instead of failing silently:

```
pip install jupyter_client ipykernel
```

Run that in the Python environment the project uses. `SHARDS_PYTHON` picks which one.

## 3. Walkthrough

`src/commands/notebook-walkthrough.md` is the entry point. The user picks a notebook and an agent (Data Scientist, ML Engineer, or Syn). The agent then reads its walkthrough file and runs the shared protocol. It uses `notebook_start` once, `notebook_exec` per cell, and `notebook_stop` at the end.

The walkthrough is conversational. It has no phases and no gates, and it writes no `project-specs.md`. Cells are not changed without explicit user confirmation.

## 4. UI (optional)

The walkthrough runs in chat-only mode. When the Shards UI is running, it can show the watched state file at `<project>/.shards/notebook-walkthrough.json` in the `notebook-walkthrough` panel. Without the UI the state file is still written and the chat carries on.

## 5. Failure modes

| Symptom | Cause | What to do |
|---------|-------|------------|
| Install hint returned | `jupyter_client` or `ipykernel` not installed in the chosen Python. | Run the `pip install` line in the project's environment. |
| Wrong Python used | `python3` on PATH is not the project's interpreter. | Set `SHARDS_PYTHON` to the right executable. |
| `notebook_exec` on unknown session | `notebook_start` not run, or session stopped. | Start the kernel again. |
| Kernel state lost | Kernel stopped, or the process ended. | Run `notebook_start` and re-run the cells you need. |
| No interpreter found on Windows | Discovery tries `python3`, `python`, then `py`; none resolved on PATH. | Set `SHARDS_PYTHON` to the full interpreter path. |

## 6. Open items

- OPEN: macOS and Windows verification is not done for the kernel path.
- TODO(owner: proflandrigan): run the install-hint and kernel-start path on macOS and on Windows (`py` discovery).
- OPEN: `src/agents/specific_instructions/shared/notebook_walkthrough_protocol.md` still describes the older kernel helper invocation. Update it to the `notebook_*` tools. It is outside this change's scope.
