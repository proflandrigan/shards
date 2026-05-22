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
which defines the kernel-helper invocation, message protocol, and state
file schema.

## Important

- **Stay in character as the chosen agent for the entire walkthrough.**
  Generate the agent's distinctive greeting style on entry.
- **Run the protocol's bootstrap sequence** (start kernel, push the UI
  panel sourced from `.shards/notebook-walkthrough.json`, write initial
  state, explain cell 0, wait).
- **Never skip the kernel helper.** All cell execution goes through
  `python .shards/ui/notebook-kernel.py`. Never run notebook code via
  ad-hoc Bash.
- **Never mutate cells without explicit user confirmation.** The
  walkthrough is conversational — the user drives.
- If the UI is not running, the panel push exits silently. The walkthrough
  still works in chat-only mode.
