# Project: {{PROJECT_NAME}}
- **Created:** {{DATE}}
- **Initiated by:** {{INITIATING_AGENT}}
- **Assigned to:** {{SPECIALIST_AGENT}}
- **Track:** {{TRACK}}
- **Status:** In Progress
- **Directory:** {{PROJECT_DIR}}
- **Dependencies:** {{DEPENDENCIES}}
- **Brainstorm origin:** {{BRAINSTORM_ORIGIN}}
- **PM project:** {{PM_PROJECT}}
- **Workstream:** {{WORKSTREAM}}

---

<!--
  This file is the central decision document for the project. Every agent
  involved writes to this file as they complete each phase.

  How it works:
  1. The agent completes a phase and appends a new section below
  2. The agent reads the section back to you in chat
  3. You confirm (or correct) before the agent advances
  4. Cross-agent reviews are also documented here

  No phase can be skipped. No section can be left undocumented.
  This is the gate pattern — documentation IS the gate.

  Validation:
  Any phase that produces a durable artifact (mart, model, notebook, service,
  pipeline, dashboard, data model) must populate a ## Validation section
  before its gate closes. See:
    [`protocols/validation.md`](../protocols/validation.md)
  and the agent's own:
    the agent's modes/validation_checklist.md

  The schema `gate_request` validates against:

    ## Validation

    **Track:** quick | deep | fixer
    **Mode:** <agent-specific — optional, omit the line if not meaningful>
    **Checklist:** <agent_name>/validation_checklist.md
    **Applied at:** Phase <N> — <phase name>

    ### Evidence

    | Check | Expected | Observed | Pass/Fail | Notes |
    |-------|----------|----------|-----------|-------|
    | <id> | <predicted> | <measured value> | ✓ / ✗ / n/a | <required if n/a> |

    ### Artifacts
    - `<path/to/evidence-file>` — <what it shows>

    ### Downstream Impact
    - `<consumer>` — verified intact | not applicable | broken → fixed in <ref>

    ### Open Issues
    - <issue> | none

    ### Summary
    <2-4 sentences on what was validated, what failed and was fixed, residual risk>

  If multiple phases produce validation sections, overwrite rather than append —
  validation uses the last ## Validation section in the file.

  Task evidence (build phases only):
  Build phases run as a lead loop over the approved task list (### Task list in
  the plan phase section, tasks.yaml in the output directory). Each task is one
  tested component; the lead writes one evidence row per task in the
  ## Validation Evidence table. See:
    [`protocols/delegated_build.md`](../protocols/delegated_build.md)
    [`protocols/incremental_testing.md`](../protocols/incremental_testing.md)

  Placement (plan phase, before the plan gate):
    ## Placement
    | Deliverable | Target path | New or existing | Pattern followed |
  The target paths are passed as `targets` on the plan gate_request. See:
    [`protocols/placement.md`](../protocols/placement.md)

  Plan phase section, before the plan gate:

    ### Task list
    | id | goal | owned paths | acceptance | depends_on |
    |----|------|-------------|------------|------------|
    | <id> | <goal> | <paths> | <command -> expected> | <ids> |
-->
