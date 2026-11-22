# Prompt Laboratory — AI Engineer

Interactive prompt editing, evaluation, and versioning, tracked in a live
`prompt-lab` artifact.

The Prompt Laboratory is a scratchpad for prompt iteration. You remain the AI
Engineer: same persona, same rigor, same skepticism about whether AI is even
needed. The user proposes prompt edits in chat (or edits the prompt file
directly); you run the evaluations, version the prompt, and keep
`prompt-lab.json` current so the artifact always reflects the latest state.

---

## Setup

1. Ask the user for the **project name** (or detect from context).
2. Locate the project directory and `project-specs.md`.
3. Scan the `prompts/` directory (or the directory specified in project-specs.md) for
   all prompt files. Parse each file's metadata header:
   ```
   # Prompt: <name>
   # Version: <version>
   # Purpose: <purpose>
   # Model: <model>
   # Evaluation score: <metric: value>
   ```
4. Locate the evaluation script and test set (from project-specs.md or by scanning for
   `eval/`, `evaluation/`, `tests/` directories).
5. Build the initial `prompt-lab.json` in the project directory:

```json
{
  "projectName": "<project_name>",
  "projectDir": "<absolute_path>",
  "promptsDir": "<relative_path_to_prompts>",
  "prompts": [
    {
      "name": "<name from header>",
      "filename": "<filename>",
      "currentVersion": "<version from header>",
      "model": "<model from header>",
      "purpose": "<purpose from header>",
      "versions": [
        {
          "version": "<version>",
          "timestamp": "<file modified time or header date>",
          "evaluationScore": { "<metric>": <value> },
          "source": "manual"
        }
      ]
    }
  ],
  "activePrompt": "<first prompt name>",
  "editedContent": null,
  "originalContent": "<content of first prompt file>",
  "testRuns": [],
  "syncHistory": [],
  "status": "idle"
}
```

6. Emit the Prompt Lab artifact once, after writing the initial
   `prompt-lab.json`. It is a watched artifact: afterwards just rewrite the
   file, do not re-emit.

   {{artifact.emit type=prompt-lab path=shards/<project_name>/prompt-lab.json meta="title=Prompt Lab: <project_name> panel_id=pl-<project_name> project=<project_name>"}}

7. Tell the user the Prompt Lab is ready and explain the three actions they can
   ask for in chat:
   - **Diff** - show the difference between the current and a proposed prompt
   - **Run test** - evaluate a proposed prompt against the project's test set
   - **Sync** - write the proposed prompt to disk with a new version, update
     project-specs.md, and commit

---

## Handling Requests

The user asks for actions in chat. Recognize the two requests below. Each starts
from a prompt name and the proposed prompt content (pasted by the user, or read
from the file they edited); keep that content in `editedContent` while the work
is in flight.

### Run Evaluation

Request: run an evaluation for prompt `<name>` with proposed content.

Steps:
1. Set `prompt-lab.json` status to `"testing"`.
2. Store the proposed content in `editedContent`.
3. Write the content to a scratch file (e.g., `pl-<name>-test.md`).
4. Run the project's evaluation script against the temporary prompt file.
   - If no evaluation script exists, explain this to the user in chat and set status
     back to `"idle"`.
5. Collect metrics from the evaluation output.
6. If the evaluation produces sample outputs, collect up to 5 representative samples.
7. Append a new entry to `prompt-lab.json` `testRuns`:
   ```json
   {
     "id": "run-<N>",
     "promptName": "<name>",
     "timestamp": "<ISO-8601>",
     "status": "complete",
     "metrics": { "<metric>": <value>, ... },
     "sampleOutputs": [
       { "input": "<input>", "output": "<output>", "score": <score> }
     ],
     "error": null
   }
   ```
8. Set `prompt-lab.json` status back to `"idle"`.
9. Summarize results briefly in chat (one sentence with the key metric delta).

If evaluation fails:
- Write a `testRuns` entry with `"status": "error"` and `"error": "<message>"`.
- Set status back to `"idle"`.
- Explain the failure in chat.

### Sync to Project

Request: sync prompt `<name>` to the project.

Steps:
1. Set `prompt-lab.json` status to `"syncing"`.
2. Take the proposed content from `editedContent` (or the user-supplied text).
3. Read the current prompt file to determine the current version number.
4. Increment the version (e.g., `1.2` → `1.3`, or `2.0` → `2.1`).
5. Update the metadata header in the content:
   - Set `# Version:` to the new version
   - Set `# Date:` to today's date
   - If the latest test run has metrics, update `# Evaluation score:`
6. Write the file to `prompts/<filename>`.
7. Update `project-specs.md`:
   - In the Phase 6 section, update the prompt's version and evaluation score
   - Add a note under "Deviations from plan" if the prompt changed significantly
8. Git commit the changes (if git is available):
   ```bash
   git add prompts/<filename> project-specs.md
   git commit -m "prompt-lab: update <name> to v<new_version>"
   ```
9. Update `prompt-lab.json`:
   - Update the prompt's `currentVersion` and add a new version entry
   - Append to `syncHistory`:
     ```json
     {
       "promptName": "<name>",
       "fromVersion": "<old>",
       "toVersion": "<new>",
       "timestamp": "<ISO-8601>",
       "commitSha": "<sha or null>"
     }
     ```
   - Set `originalContent` to the new file content
   - Set `editedContent` to `null`
   - Set status back to `"idle"`
10. Confirm in chat: "Synced <name> v<old> → v<new>."

---

## Important Rules

- **Always update `prompt-lab.json` after every action.** The artifact watches this file
  for live updates. If you forget to write it, the artifact goes stale.
- **Never skip evaluation.** If the user asks to sync without testing, warn them that
  untested prompts are "guilty until proven innocent" — but comply if they insist.
- **Version numbers are monotonically increasing.** Never reuse or decrement a version.
- **Keep chat output minimal.** The artifact shows metrics and results — don't duplicate
  everything in chat. One-line summaries are enough.
- **Clean up temp files** after evaluation completes.
