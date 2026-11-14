---
name: experiment-versioning
description: >
  Versioning protocol for experiment mode. Detects DVC or git availability
  and creates checkpoints after each experiment result. Referenced by all
  experiment-capable agents during their Phase 2 loop.
type: reference
---

# Experiment Versioning Protocol

This protocol governs artifact versioning during experiment mode. It is
referenced by all experiment-capable agents (ML Engineer, AI Engineer, Data
Scientist) at specific points in their experiment workflow.

---

## Section A — Detection

Run this section once during Setup, after establishing the `experiments/`
subdirectory and before agreeing on experiment parameters with the user.

1. Run `dvc version` via Bash. If it succeeds, check whether `.dvc/` exists at
   the repository root (`ls -d .dvc/ 2>/dev/null`).
   - If both succeed: versioning mode is **dvc**.
   - If `dvc version` fails or `.dvc/` does not exist: proceed to step 2.

2. Run `git rev-parse --is-inside-work-tree` via Bash.
   - If it succeeds: versioning mode is **git**.
   - If it fails: versioning mode is **none**.

3. Announce the result to the user:
   - **dvc:** "Experiment versioning enabled via DVC. Checkpoints will be
     created after each experiment — you can restore any previous state."
   - **git:** "Experiment versioning enabled via git. Tags and commits will be
     created after each experiment — you can restore any previous state with
     `git checkout <tag>`."
   - **none:** "No DVC or git detected. Experiment versioning is disabled —
     results will be tracked in markdown and JSON only. To enable versioning,
     initialize a git repo (`git init`) before running experiments."

4. If versioning mode is **dvc** or **git**: run `git status --porcelain` and
   check for uncommitted changes outside the experiment directory. If there are
   uncommitted changes, warn the user:
   "There are uncommitted changes in this repo. Experiment checkpoints will
   commit experiment files only — your other changes will remain unstaged.
   Consider committing or stashing your work before starting experiments."

Record the versioning mode internally — you will reference it in Section B
and Section E.

---

## Section B — Checkpoint Creation

Run this section after each experiment's results are written (after updating
`experiments/results.json` and writing the experiment result file), and before
consulting the reviewer (Data Scientist or Researcher).

### If versioning mode is `none`:

Skip this section silently. Do not print anything.

### If versioning mode is `git`:

Run the following commands via Bash. If any command fails, follow Section C
(Error Handling) and continue.

```bash
# Stage experiment files and any files modified during this experiment
git add experiments/

# Also stage any other files you modified during this experiment's
# implementation step (Step 2). You know which files you changed —
# add them explicitly by path.
git add <paths of files modified in Step 2>

# Commit with standardized message
git commit -m "experiment: <N> <name> — <outcome_metric> delta: <delta>"

# Create annotated tag with metrics in the message
git tag -a "exp/<project_name>/<N>-<name>" \
  -m "Experiment <N>: <name> | <outcome_metric>: <before> -> <after> (delta: <delta>)"
```

After a successful checkpoint, capture the commit SHA:
```bash
git rev-parse HEAD
```

Record the tag name and commit SHA — you will write them to `results.json`.

### If versioning mode is `dvc`:

Run the same git commands as above (stage, commit, tag). Additionally, before
staging:

1. Check if any large artifacts were produced by this experiment (model files,
   serialized objects, datasets > 10MB). If so, run `dvc add <artifact_path>`
   for each large artifact before `git add`.

2. After the git commit and tag, attempt `dvc push` via Bash. If it fails
   (no remote configured), print a one-line note: "DVC push skipped — no
   remote configured." Do not treat this as an error.

Record the tag name and commit SHA as with git mode.

---

## Section C — Error Handling

If any git or dvc command fails during checkpoint creation:

1. Print a warning: "Checkpoint creation failed: `<error message>`.
   Continuing without versioning for this experiment."
2. Do **NOT** stop the experiment loop.
3. Do **NOT** retry the failed command.
4. In the experiment result file (`experiments/experiment_<N>_<name>.md`),
   append a section:

```markdown
## Versioning
- **Status:** Failed
- **Reason:** <error message>
```

5. Set the `checkpoint` field in `results.json` to:
```json
{
  "type": null,
  "tag": null,
  "commit": null,
  "error": "<error message>"
}
```

---

## Section D — JSON Schema Additions

### Top-level field (add during results.json initialization in Phase 1)

Add this field to the root of `results.json`:

```json
"versioningMode": "dvc" | "git" | "none"
```

### Per-experiment field (add to each experiment entry in Phase 2 Step 5)

Add this field to each experiment object in the `experiments` array:

```json
"checkpoint": {
  "type": "git" | "dvc" | null,
  "tag": "exp/<project_name>/<N>-<name>" | null,
  "commit": "<sha>" | null
}
```

If versioning mode is `none`, set the entire `checkpoint` object to:
```json
"checkpoint": { "type": null, "tag": null, "commit": null }
```

---

## Section E — Summary Enhancement

In Phase 3, after writing `experiments/experiment_summary.md`, append this
section if versioning mode is not `none`:

```markdown
## Versioning

- **Mode:** <DVC | git>
- **Checkpoints created:** <count of experiments with successful checkpoints>
- **Failed checkpoints:** <count, or "none">
- **Tag prefix:** `exp/<project_name>/`
- **To restore experiment N:** `git checkout exp/<project_name>/<N>-<name>`
- **To list all experiment tags:** `git tag -l "exp/<project_name>/*" -n1`
```

If versioning mode is `none`, do not append this section.
