---
description: Start an interactive cell-by-cell walkthrough of a Jupyter notebook with a Shards agent
---

The user wants to walk through a Jupyter notebook live — execute cells one
at a time, hear them explained, ask questions, and edit cells as needed.
This is **interactive walkthrough mode**. There are no phases, no gates,
no `project-specs.md` — it is a conversational session.

## What you do first

Before any other output, ask the user two questions:

1. **Which notebook?** — Path to a `.ipynb` file. If they only mention a
   project or study by name, search the obvious directories
   (`studies/`, `models/`, `services/`, `analysis/`, `research/`,
   `dashboards/`) for `.ipynb` files and offer the matches.

2. **Which agent?** — Pick the right specialist for the notebook content:
   - **Data Scientist** — analytical / methodology / statistics-heavy
     notebooks, anything under `studies/` or `analysis/`
   - **ML Engineer** — model training / evaluation / production-ML
     notebooks, anything under `models/` / `services/` / `research/`
   - **Syn** — neutral orientation, unfamiliar territory, or when the user
     just wants a friendly guide

You can suggest based on the notebook path and content, but let the user
pick.

## Then route

Once you have notebook path + agent choice, hand off into that agent's
walkthrough mode by reading the agent's notebook walkthrough instructions
in full and following them exactly:

- Data Scientist → `.claude/agents/specific_instructions/data_scientist/notebook_walkthrough.md`
- ML Engineer → `.claude/agents/specific_instructions/ml_engineer/notebook_walkthrough.md`
- Syn → `.claude/agents/specific_instructions/syn/notebook_walkthrough.md`

All three reference the shared protocol at
`.claude/agents/specific_instructions/shared/notebook_walkthrough_protocol.md`
which defines the message protocol and state file schema. Where that
protocol describes kernel-helper invocation, use the `notebook_*` tools
listed under Important instead.

## Important

- **Stay in character as the chosen agent for the entire walkthrough.**
  Generate the agent's distinctive greeting style on entry.
- **Run the protocol's bootstrap sequence** (call `notebook_start`, write
  the initial walkthrough state, explain cell 0, wait). Pushing the UI panel
  is optional; see the last point.
- **Execute cells only through the notebook tools.** Use `notebook_start`
  (once, with `notebook` and `session`), `notebook_exec` (one cell, by
  `session` and `cell`), `notebook_run_all`, and `notebook_stop` when the
  walkthrough ends. Never run notebook code via ad-hoc Bash or a direct
  Python call. Kernel state lives under `.shards/notebooks/<session>/`. If
  `notebook_start` returns an install hint, the user needs
  `pip install jupyter_client ipykernel` in their Python environment before
  you continue.
- **Never mutate cells without explicit user confirmation.** The
  walkthrough is conversational — the user drives.
- The walkthrough works without the Shards UI (chat-only mode). If the UI is
  running, it can show the watched state file at
  `<project>/.shards/notebook-walkthrough.json`; if it is not, skip the panel
  push and carry on in chat.
