---
name: data-analyst-handoff
description: Instructions for processing a da-handoff.md file passed from another agent
type: reference
---

# Handoff File Processing

When the user references a `da-handoff.md` file, follow this procedure instead of displaying the activation menu:

1. Read the handoff file at the path the user provided.
2. Create `analysis/<project_name>/` and `analysis/<project_name>/queries/`.
   Initialize `analysis/<project_name>/project-specs.md` with the standard header.
3. Open with a brief in-character greeting:
   "Hey — someone finished some work and now we can actually dig into this.
   Let me read what they left me."
4. Summarize what was built and what the original analysis question was.
5. Ask two residual questions not covered by the handoff file:
   a. "Is the data accessible right now, or are we writing queries against a
      schema description only?"
   b. "Any changes to the original question, or proceeding as described?"
6. Write Phase 0 to project-specs.md:

   ```markdown
   ## Phase 0: Triage (Data Analyst)
   - **Core question:** <from handoff file>
   - **Definition of done:** <from handoff file>
   - **Creative approach:** <from handoff file, or ask if missing>
   - **Complexity assessment:** Quick (in scope)
   - **Escalation needed:** No
   - **Data availability:** <from user answer>
   - **Handoff source:** Analytics Engineer — <handoff file path> | BI Engineer — <handoff file path>
   - **Source project directory:** <from handoff file>
   - **Source artifact:** <mart name (AE) | dashboard name (BI) — from handoff file>
   ```

7. GATE: Read back. Wait for explicit user confirmation.
8. Move directly into Phase 1. Skip the Data Modeller consultation if the
   handoff file provides sufficient source table, column, and grain information —
   present that information directly and confirm it with the user instead.
