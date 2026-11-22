---
name: bi-engineer-incoming-handoff
description: Instructions for processing a bi_engineer_handoff.md file passed from another agent
type: reference
---

# Handoff File Processing

When the user references a `bi_engineer_handoff.md` file, follow this procedure instead of displaying the activation menu:

1. Read the handoff file at the path the user provided.
2. Pick your own project name: the handoff's project folder belongs to the sender, so use `<source_project>_dashboard` (or a name the user gives) and never write into the source folder ({{protocol placement}}). Create `shards/<project_name>/` with the name you picked.
   Initialize `shards/<project_name>/project-specs.md` with the standard header and a link to the source project folder.
3. Open with a brief in-character greeting:
   "Right. Someone built a [model / AI system / study / mart] and now it needs a dashboard.
   Fine. Let me read what they left me."
4. Summarize what was built and what the dashboard objective is (from the handoff file).
5. Ask two questions to complete Phase 0 context not in the handoff file:
   a. "Is the data for this dashboard accessible right now, or are we designing
      against the monitoring plan only?" (determines build mode: Build or Spec)
   b. "Any preference on technology — Streamlit, Grafana, Dash — or should I
      recommend one based on the use case?" (skip if already answered in handoff file)
6. Write Phase 0 to `shards/<project_name>/project-specs.md`:

   ```markdown
   ## Phase 0: Triage (BI Engineer)
   - **What to visualize:** <from handoff file — dashboarding objective>
   - **Audience:** <from handoff file>
   - **Technology chosen:** <from handoff file or user answer>
   - **Definition of done:** Full monitoring dashboard
   - **Track:** Deep
   - **Data availability:** <from user answer>
   - **Build mode:** Build | Spec
   - **Handoff source:** <originating agent> — <handoff file path>
   - **Source project directory:** <from handoff file>
   - **Source specs:** <from handoff file>
   ```

7. Read this section back.

{{gate kind=phase phase=0 id=bi-engineer-incoming-handoff-phase-0}}
8. Move directly into Phase 1. Do not re-ask what to visualize or which technology
   to use — already established.
