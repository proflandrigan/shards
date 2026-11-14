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
    .claude/agents/specific_instructions/shared/validation_protocol.md
  and the agent's own:
    .claude/agents/specific_instructions/<agent>/validation_checklist.md

  The schema the gate hook expects:

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
  the gate hook uses the last ## Validation section in the file.

  Incremental testing (build phases only):
  Notebook- and pipeline-producing specialists emit a `kind=checkpoint` gate
  between each component they write. See:
    .claude/agents/specific_instructions/shared/incremental_testing.md

  Optional record inside the build-phase section for auditability:

    ### Checkpoint Log
    | Component | Test command | Evidence | Status |
    |-----------|--------------|----------|--------|
    | <name>    | <cmd>        | <facts>  | PASS / FAIL |

  This table mirrors what the gate hook already records in
  `.shards/gates/gates.jsonl` — including it in project-specs is optional but
  useful when the user wants the audit trail alongside the rest of the spec.
-->
