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

**Path convention.** `experiments/` in this protocol always means
`<output_dir>/experiments/` (the agent's output directory), as set by
`experiment_framework.md`. Never create or stage a bare repo-root `experiments/`.

**Git policy (ADR 0005, `bindings/git.md`).** Git is the source of truth and the
runtime owns gate commits. The checkpoint commits below are the only commits an
agent makes itself, and only for the experiment loop. They are governed by the
resolved `git.commit` and `git.denylist` settings (`docs/config.md`):

- If `git.commit` is `false`, versioning mode is **none**. Make no commits and
  no tags.
- Stage and commit only files under `<output_dir>/` plus the mutable paths the
  experiment changed, and never a path matching `git.denylist.globs` or larger
  than `git.denylist.max_file_size_bytes`. Say which files were left out.
- Commit on the current branch with `git commit --only <paths>` so anything the
  user staged is not swept in. Never switch branches and never push.

---

## Section A — Detection

Run this section once during Setup, after establishing the `<output_dir>/experiments/`
subdirectory and before agreeing on experiment parameters with the user.

0. Read `git.commit` from the resolved config. If it is `false`, versioning
   mode is **none**; skip steps 1-2 and announce it in step 3.

1. DVC is optional. Run `dvc version` via Bash. If it succeeds, check whether
   `.dvc/` exists at the repository root (`ls -d .dvc/ 2>/dev/null`).
   - If both succeed: versioning mode is **dvc** (git checkpoints plus DVC for
     large artifacts, subject to the consent rule in Section B).
   - If `dvc version` fails or `.dvc/` does not exist: proceed to step 2.

2. Run `git rev-parse --is-inside-work-tree` via Bash.
   - If it succeeds: versioning mode is **git**.
   - If it fails: versioning mode is **none**.

3. Announce the result to the user:
   - **dvc:** "Experiment versioning enabled via DVC. Checkpoints will be
     created after each experiment — you can restore any previous state. DVC
     will not be used for `dvc add` or `dvc push` until you agree."
   - **git:** "Experiment versioning enabled via git. Tags and commits will be
     created after each experiment — you can restore any previous state with
     `git checkout <tag>`."
   - **none:** "Experiment versioning is disabled (no git repo, or
     `git.commit` is off) — results will be tracked in markdown and JSON only.
     To enable it, initialize a git repo and set `git.commit: true`."

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
`<output_dir>/experiments/results.json` and writing the experiment result file), and before
consulting the reviewer (Data Scientist or Researcher).

### If versioning mode is `none`:

Skip this section silently. Do not print anything.

### If versioning mode is `git`:

Run the following commands via Bash. If any command fails, follow Section C
(Error Handling) and continue.

```bash
# Stage experiment files and any files modified during this experiment.
# Skip anything matching git.denylist.globs or over max_file_size_bytes.
git add <output_dir>/experiments/

# Also stage any other files you modified during this experiment's
# implementation step (Step 2). You know which files you changed —
# add them explicitly by path.
git add <paths of files modified in Step 2>

# Commit only the staged paths, with a standardized message
git commit --only <staged paths> -m "experiment: <N> <name> — <outcome_metric> delta: <delta>"

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

Run the same git commands as above (stage, commit, tag). DVC stores artifacts
outside git, and Shards owns no storage (ADR 0003), so DVC steps need the
user's consent:

1. The first time an experiment produces a large artifact (model files,
   serialized objects, datasets > 10MB), ask the user before running any DVC
   command: "This experiment produced `<artifact>`. Run `dvc add` (and later
   `dvc push` to your configured remote)? [yes / no / always for this
   project]". Record the answer in `results.json` and do not ask again after
   "always" or "no".
2. On yes: run `dvc add <artifact_path>` for each large artifact before
   `git add`. Artifacts matching the denylist stay out of git either way; the
   `.dvc` pointer file is what gets committed.
3. After the git commit and tag, and only if the user approved pushing, attempt
   `dvc push` via Bash. If it fails (no remote configured), print a one-line
   note: "DVC push skipped — no remote configured." Do not treat this as an
   error.
4. On no: treat the run as versioning mode `git` for artifacts and leave the
   large files untracked.

Record the tag name and commit SHA as with git mode.

---

## Section C — Error Handling

If any git or dvc command fails during checkpoint creation:

1. Print a warning: "Checkpoint creation failed: `<error message>`.
   Continuing without versioning for this experiment."
2. Do **NOT** stop the experiment loop.
3. Do **NOT** retry the failed command.
4. In the experiment result file (`<output_dir>/experiments/experiment_<N>_<name>.md`),
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

In Phase 3, after writing `<output_dir>/experiments/experiment_summary.md`, append this
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
