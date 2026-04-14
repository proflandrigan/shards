# Plan: Multi-Workstream Orchestration

## Context

The brainstorm-to-execution flow (`brainstorm.md` Phase 3) already supports multi-workstream projects — it identifies workstreams, tracks dependencies in the brainstorm doc's `## Outcome` section, and routes to specialists sequentially. However, this information is buried in markdown prose inside each brainstorm doc, making it hard for Syn's Status Check Mode to surface a consolidated cross-workstream view. The goal is to formalize workstream tracking with a structured `workstreams.json` file and wire it into the status display.

---

## Changes

### 1. `src/agents/specific_instructions/syn/brainstorm.md` (lines 179-233)

Add a **Step 2.5** (between current Step 2 and Step 3) — **Create `workstreams.json`**:

After appending the structured Outcome section to the brainstorm doc, Syn also writes a `workstreams.json` file to the brainstorm project directory (`brainstorm/`). This is a machine-readable companion to the markdown Outcome section.

Schema:
```json
{
  "project": "<brainstorm project name>",
  "created": "<date>",
  "workstreams": [
    {
      "name": "<workstream name>",
      "specialist": "<shard name>",
      "directory": "<expected project dir>",
      "status": "initialized",
      "depends_on": ["<workstream name>"] or [],
      "definition_of_done": "<one sentence>"
    }
  ]
}
```

Update **Step 4** to include: after each workstream's Phase 0 is confirmed, update that workstream's `status` in `workstreams.json` to `"active"`.

### 2. `src/templates/project-specs.md` (line 7)

Add two new fields to the header metadata block, after `Directory`:

```markdown
- **Dependencies:** {{DEPENDENCIES}}
- **Brainstorm origin:** {{BRAINSTORM_ORIGIN}}
```

- `Dependencies` captures which other workstreams or shards this project relies on (e.g., `"Data Pipeline workstream"` or `none`).
- `Brainstorm origin` replaces the ad-hoc field currently described only in brainstorm.md Step 3 — standardizing it in the template.

### 3. `src/agents/syn.md` (lines 579-590)

Expand Status Check Mode to detect and display multi-workstream projects:

```markdown
# Status Check Mode

When the user asks for status (`[S]`):

1. Look for existing project-specs.md files in `analysis/`, `studies/`, `models/`,
   `services/`, `research/`, `dashboards/`, and `brainstorm/`
2. Look for `workstreams.json` in `brainstorm/` — if found, this indicates a
   multi-workstream project. Parse it and display a consolidated view:
   - Project name (from the JSON)
   - For each workstream: name, specialist, status, dependencies
   - Highlight any blocked workstreams (those whose dependencies are not yet complete)
3. For standalone projects (no workstreams.json), report as before:
   - Project name
   - Assigned specialist
   - Current status
   - Last phase completed
4. Ask the user which project or workstream they want to continue
```

---

## Files to modify

| File | Lines | Change |
|------|-------|--------|
| `src/agents/specific_instructions/syn/brainstorm.md` | 179-233 | Add Step 2.5 (workstreams.json creation) + update Step 4 (status updates) |
| `src/templates/project-specs.md` | 7 | Add `Dependencies` and `Brainstorm origin` fields |
| `src/agents/syn.md` | 579-590 | Expand Status Check Mode with workstreams.json parsing |

---

## Verification

1. Read all three modified files to confirm formatting and consistency
2. Run `node tools/install.js` from the repo root to install updated files into `.claude/`
3. Verify installed files match source: diff `src/agents/syn.md` vs `.claude/agents/syn.md`, etc.
4. Manual walkthrough: start a `/brainstorm` session, pursue a multi-workstream idea, confirm `workstreams.json` instructions are present in Phase 3, then check `[S]` status logic references it
