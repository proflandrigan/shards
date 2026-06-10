# Notebook Walkthrough — Shared Protocol

This document defines the **interactive notebook walkthrough** mode shared by
the Data Scientist, ML Engineer, and Syn shards. The per-agent variant files
under `specific_instructions/<agent>/notebook_walkthrough.md` set the persona
spin and reference this document for the protocol.

The walkthrough lets the agent guide the user through a Jupyter notebook
**cell by cell**: execute the cell against a live kernel, explain it in chat,
take questions, and (when asked) edit, insert, or delete cells and re-run
downstream. It is **not** a Phase 0+ project workflow — there is no
project-specs.md, no gate sequence, and no Syn final review. It is a live,
read-and-react session.

---

## Architecture

Three pieces:

1. **The notebook on disk** (`.ipynb`) — the source of truth for cell source
   and cell outputs. Mutated only via `NotebookEdit` (for source) or via the
   kernel helper's `exec` subcommand (for outputs after execution).
2. **The walkthrough state JSON** — the agent's view of the walkthrough
   (current cell, which cells are stale, transcript of explanations and
   user questions). Lives at:
   `<project_root>/.shards/notebook-walkthrough.json`
   The Shards UI watches this file via the panel's `--source` flag and
   re-renders on every change.
3. **The kernel helper** — `python .shards/ui/notebook-kernel.py` keeps a
   persistent Jupyter kernel alive between agent invocations. Connection
   files live under `.shards/notebooks/<session_id>/`.

The agent owns the choreography between the three. The UI is read-mostly:
it shows the current state and dispatches user actions back as chat messages.

---

## Bootstrap sequence (on activation)

1. **Ask** the user for the notebook path. Validate it exists and ends in
   `.ipynb`. (If invoked via `/notebook-walkthrough` slash command, the path
   may already be in the user's first message.)

2. **Generate a session id**:
   ```bash
   python .shards/ui/notebook-kernel.py new-session
   ```
   The helper prints `{"ok": true, "sessionId": "<uuid>"}`. Capture the
   sessionId — every subsequent helper call needs it.

3. **Start the kernel**:
   ```bash
   python .shards/ui/notebook-kernel.py start <session_id> <notebook_path>
   ```
   Helper writes the connection file, spawns ipykernel, and creates the
   initial walkthrough state at `.shards/notebooks/<session_id>/state.json`.
   On success the response includes `cellCount` and `stateFile`.

4. **Read** the notebook from disk so you have the cell sources in
   memory. Read both `<notebook_path>` and the helper's `state.json`.

5. **Compose** the UI-facing walkthrough state JSON. Required shape:
   ```json
   {
     "sessionId": "<uuid>",
     "notebookPath": "<absolute or project-relative path>",
     "currentCellIndex": 0,
     "status": "ready",
     "cells": [
       {
         "index": 0,
         "type": "code|markdown",
         "executed": false,
         "stale": false,
         "explained": false,
         "lastRunAt": null,
         "explanation": null,
         "outputSummary": null
       }
     ],
     "notebookCells": [
       { "cell_type": "code|markdown", "source": "...", "outputs": [] }
     ],
     "transcript": []
   }
   ```
   - `cells[].*` is per-cell walkthrough state (the helper's `state.json`
     already gives you this — copy it forward).
   - `notebookCells` is a flat snapshot of the on-disk `.ipynb` cells. The
     UI uses this to render cell source and existing outputs without making
     a separate file fetch.
   - `transcript` accumulates `{ role, kind, cellIndex, text }` entries.

   Write this JSON to `<project_root>/.shards/notebook-walkthrough.json`.

6. **Push the panel** to the UI:
   ```bash
   node .shards/ui/ui-push.js notebook-walkthrough \
     --title "Walkthrough: <notebook_basename>" \
     --agent "<agent-name>" \
     --panel-id "nw-<session_id>" \
     --source "<project_root>/.shards/notebook-walkthrough.json"
   ```
   The `--source` flag tells the server to watch the file. Subsequent state
   updates need only re-write the file — no further pushes required.

7. **Explain cell 0** to the user in chat. Set `cells[0].explained = true`
   and append an entry to `transcript`. Update the state JSON.

8. **Wait** for the user to send a `[NOTEBOOK-WALKTHROUGH] ...` message or
   to reply in chat.

If the UI is not running, the `ui-push.js` call exits silently — that is
fine, the walkthrough still works in chat-only mode (the user just won't
see the panel; they can still read explanations and request actions in plain
chat).

---

## Message protocol

The UI dispatches user actions as chat messages prefixed with
`[NOTEBOOK-WALKTHROUGH]`. Recognize and handle:

| Pattern | Action |
|---|---|
| `Run cell <N>` | Execute cell N via the kernel helper, update state |
| `Next cell` | Advance `currentCellIndex` by 1, explain the new cell |
| `Re-explain cell <N>` | Generate a fresh explanation for cell N |
| `Question on cell <N>: <text>` | Answer in chat; record in transcript; do not advance |
| `Edit cell <N>: <new content>` | Mutate cell source via NotebookEdit, mark stale, re-run if user asked |
| `Insert cell after <N> (<type>): <content>` | Insert a cell, shift indices, update state |
| `Delete cell <N>` | Delete via NotebookEdit, shift indices, mark downstream stale |
| `Re-run from cell <N>` | Execute cells N..end, clearing stale flags as you go |
| `Restart kernel` | Call helper `restart`; mark all executed cells stale |
| `Restart & run all` | Call helper `run-all`; fresh-kernel top-to-bottom reproducibility check; report per-cell pass/fail and the first error |
| `End walkthrough` | Call helper `stop`; finalize transcript; offer summary |

In `Insert` and `Edit` payloads, `\n` is the literal escape sequence — replace
`\n` with newline before applying.

User messages **without** the `[NOTEBOOK-WALKTHROUGH]` prefix are normal
chat: treat them as questions or instructions, answer in chat, and record
relevant ones in the transcript with `kind: "question"`.

---

## Cell execution

Always go through the helper:

```bash
python .shards/ui/notebook-kernel.py exec <session_id> <cell_index>
```

The helper:
- Reads cell source from the `.ipynb` on disk (so any prior `NotebookEdit`
  is picked up automatically).
- Sends the source to the live kernel.
- Captures stream/result/error outputs.
- Writes outputs back into the `.ipynb` file (so the file pane reflects the
  fresh outputs).
- Updates the helper's `state.json` with `executed`, `lastRunAt`, and
  `outputSummary` for that cell.

After every `exec` call:
1. Re-read the helper's `state.json` (or just the relevant cell entry).
2. Re-read the relevant `.ipynb` cell so `notebookCells` in the UI state JSON
   reflects the new outputs.
3. Update `<project_root>/.shards/notebook-walkthrough.json`. Set
   `currentCellIndex` to the cell that just ran.
4. Explain the result in chat — what the cell did, what to read in the
   output, anything surprising.

If `status` in the helper response is `"error"`, do not advance to the next
cell. Explain the error in business/methodology terms and ask the user how
to proceed.

---

## Cell mutation (edit / insert / delete)

All cell mutations go through the **NotebookEdit** tool — never write the
`.ipynb` directly.

After any mutation:
1. **Reload** the `.ipynb` from disk. Cell indices may have shifted.
2. **Recompute the staleness pass**:
   - Find the smallest index `K` that was mutated.
   - Every cell at index `≥ K` that was previously executed gets
     `stale: true` in walkthrough state.
   - The mutated cell itself becomes `stale: true` and `executed: false`
     (its old execution count is no longer meaningful).
3. **Update `notebookCells`** in the walkthrough state JSON to mirror the
   new cell list, and update `cells[]` so length matches.
4. If the user asked for "Edit and re-run" (edit followed immediately by a
   run), call `exec` for that cell now; otherwise leave it stale and tell
   the user it is staged for re-run.
5. Save the walkthrough state JSON.

When inserting a cell, decide whether to insert with empty source (and let
the user fill it later) or generate plausible code/markdown. **Default: ask
the user.** Never invent analysis code without confirmation — this is the
"facilitate, don't generate" rule still in force, even in walkthrough mode.

---

## Re-run from cell N

When the user sends `Re-run from cell N`:

1. Iterate `i` from `N` through the last executed-or-stale cell.
2. For each `i`, call `exec <session_id> <i>`.
3. After each successful run, clear `stale` and update `lastRunAt` /
   `outputSummary`. Save the walkthrough state JSON between iterations so
   the UI shows progress.
4. If any cell errors, **stop** the loop, leave subsequent stale flags
   intact, explain the error, and ask the user.

---

## Restart & run all

When the user sends `Restart & run all` (the final reproducibility check —
does the notebook run clean top-to-bottom on a *fresh* kernel?):

1. Call the helper once:
   ```bash
   python .shards/ui/notebook-kernel.py run-all <session_id>
   ```
   It restarts the kernel, executes every code cell in order on the fresh
   kernel, writes outputs back into the `.ipynb`, updates `state.json` per
   cell, and stops at the first failing cell.
2. Parse the roll-up: `cellsTotal`, `cellsRun`, `cellsPassed`, `perCell`
   (`[{index, status}]`), and `firstError` (`{cellIndex, ename, evalue}` or
   `null`).
3. Re-read `state.json` and the `.ipynb`, then update
   `<project_root>/.shards/notebook-walkthrough.json` to mirror the fresh
   run — every passing cell `executed: true`, `stale: false`.
4. Report the outcome in chat:
   - **All passed** (`firstError == null`): say so plainly — the notebook is
     reproducible from a cold start. This is the evidence DS-11 wants.
   - **Failed**: name the failing cell, translate `ename`/`evalue` into
     business/methodology terms, and **stop** (honoring "kernel errors halt
     progress"). Every cell after `firstError.cellIndex` did not run.
5. This is an *offer-and-run on request* action — never trigger it on your
   own; the user clicks "Run All" or types the command.

---

## Explanations — how to write them

Carried over from the existing Explain mode:

- **Explain intent and logic, not syntax.** "We're imputing missing income
  with the median because the column is right-skewed and the mean would be
  dragged by outliers." Not: "We call `df['income'].median()` and pass it
  to `fillna()`."
- **Tie to the question.** Every cell either gathers data, transforms it,
  models it, evaluates it, or visualizes it — name the role.
- **Flag what to look at in the output.** "The KS statistic of 0.31 is what
  matters here — anything above 0.2 is a meaningful distributional shift."
- **Be honest about gaps.** If a cell's logic seems off, say so —
  walkthrough mode is also implicit review.
- Keep each explanation short — 2–4 sentences, occasionally a small list.
  The user can ask for more.

After explaining a cell, set `cells[N].explained = true` and append the
explanation to `transcript`:

```json
{ "role": "agent", "kind": "explanation", "cellIndex": N, "text": "..." }
```

---

## Question handling

When the user asks a question (either with `[NOTEBOOK-WALKTHROUGH] Question
on cell N: ...` or as a free-form chat message):

1. Answer in chat. Reference the cell by index when relevant.
2. Append to `transcript`:
   ```json
   { "role": "user", "kind": "question", "cellIndex": N, "text": "..." }
   { "role": "agent", "kind": "answer", "cellIndex": N, "text": "..." }
   ```
3. Save the walkthrough state JSON.
4. Do **not** advance `currentCellIndex`. The user is on this cell.

If the question implies a code change ("could you also compute the median
imputation?"), confirm the change in chat first, then apply it via the Edit
flow above.

---

## End walkthrough

When the user sends `End walkthrough` or otherwise signals completion:

1. **Optional reproducibility check:** if cells were edited or run during the
   walkthrough, offer to run `Restart & run all` once before ending — the
   fresh-kernel top-to-bottom check that proves the notebook still works as a
   whole. If the user accepts and an artifact is written (step 4), fold the
   roll-up (`cellsPassed / cellsTotal`, first error if any) into the summary.
   Offer only — never run it without confirmation.
2. Call `python .shards/ui/notebook-kernel.py stop <session_id>`.
3. Set walkthrough state `status = "ended"` and save.
4. **Optional artifact:** if the notebook lives under `studies/` (Data
   Scientist) or `models/` / `services/` / `research/` (ML Engineer / Syn),
   offer to write a brief transcript summary to
   `<project_dir>/walkthroughs/<session_id>.md` — list of cells walked
   through, key explanations, user questions, and any edits applied.
   Do not write this without explicit user confirmation.
5. Close the panel:
   ```bash
   node .shards/ui/ui-push.js close --panel-id "nw-<session_id>"
   ```

---

## Behavioral rules

- **Never auto-run cells the user did not ask to run.** The user clicks Run
  or types `Run cell N` / `Next cell`. Even when the kernel is fresh and
  the notebook obviously needs all cells executed in order, ask before
  running through.
- **Never edit cells without confirmation**, even if the user is clearly
  hinting. Confirm the change first.
- **Never silently skip a stale cell.** If the user asks to advance past
  a stale cell, point it out and ask whether to re-run it first.
- **Save the walkthrough state JSON after every state-changing action.**
  The UI is read-only — if you forget to write, the UI goes stale and the
  user sees stale info.
- **One action at a time.** Don't batch. The walkthrough is conversational.
- **Kernel errors halt progress** — surface them and wait for the user.
- **Keep outputs clean.** Every `exec` writes the cell's output back into the
  `.ipynb` *and* into your context. Before running a cell that would print a
  secret/token or dump a full DataFrame, suggest a `.head()` / `.shape` /
  summary edit first — full dumps bloat the notebook and burn context on every
  state read.
- **Persona stays in character.** Use the per-agent variant's voice for
  explanations and confirmations. The protocol mechanics here apply
  unchanged across all three agents.

---

## Resume

If `<project_root>/.shards/notebook-walkthrough.json` already exists when
the agent activates:

1. Offer to **resume** the existing session, with the same notebook and
   `currentCellIndex`. State which cell you'd resume on and how many cells
   are stale.
2. If the user agrees, check the kernel:
   ```bash
   python .shards/ui/notebook-kernel.py status <session_id>
   ```
   - If `alive`: re-push the panel pointed at the existing state JSON,
     re-explain the current cell, wait.
   - If `dead` or `missing`: ask whether to **restart** (fresh kernel, all
     executed cells become stale) or **start over** (new session id, drop
     existing state).
3. If the user prefers a fresh walkthrough, run the bootstrap sequence
   from scratch — pick a new session id and overwrite the state JSON.
