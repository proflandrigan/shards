# Gated Build Workflow Extraction — Migration Plan

> **Legacy (v1) plan, superseded.** This plan targets the v1 layout (`src/agents/{agent-slug}-build.md`, installed into `.claude/agents/`). In v2 the build phases live in `core/agents/<id>/phases*/phase-<N>.md`, served one at a time by `load_phase` after each gate (see [`CLAUDE.md`](../../CLAUDE.md) and [`core/INVENTORY.md`](../../core/INVENTORY.md)). Kept for reference only.

## Context

Several specialist agents (data-scientist, ml-engineer, ai-engineer, etc.) have two distinct operational modes:
1. **Build/project track** — a heavy, multi-phase gated workflow (Phases 0–N, gates at every transition)
2. **Advisory/review/explain tracks** — lighter, conversational, no or minimal gates

Currently, all of this lives inline in a single large agent file (~900–1100 lines each). Since the gating machinery is only triggered for build work, extracting it to a dedicated file makes each agent's main file shorter and cleaner, and makes the build workflow easier to read and maintain in isolation.

---

## Approach

### What moves to the build file
- Phase 0 (triage/scope confirmation)
- Phase 1–N (all domain-specific build phases)
- All gate enforcement prose ("Read this section back. Stop here. Wait for explicit confirmation.")
- Reviewer Verdict Protocol and escalation logic (embedded in build phases)
- Handoff logic (JFL sign-off, ML Engineer handoff file, BI Engineer handoff)
- Decision Documentation — Critical Rules section (specs file location, gate rules)

### What stays in the main agent file
- YAML frontmatter (name, description, tools, model)
- Role + Personality
- Conversational Voice (gate + consultation openers — still needed for advisory track)
- Activation menu (routing logic)
- Advisory mode instructions
- Review mode instructions
- Explain mode instructions (where they exist)
- Service Mode (for agents consulted by others, e.g. data-modeller, applied-ml-scientist, deep-learning-engineer)
- Behavioral Rules
- A single routing instruction: **"When routing to Build track, use the Read tool to load `.claude/agents/{agent-slug}-build.md` and follow the workflow defined there."**

### File naming convention
`src/agents/{agent-slug}-build.md`

These files sit alongside the main agent files in `src/agents/`. The installer already copies `src/agents/` → `.claude/agents/`, so **no installer changes needed**. They are not slash commands (no command file), just readable workflow definitions.

---

## Applicable Agents (10)

| Agent | Main file | Build file |
|-------|-----------|-----------|
| data-scientist | data-scientist.md | data-scientist-build.md |
| ml-engineer | ml-engineer.md | ml-engineer-build.md |
| ai-engineer | ai-engineer.md | ai-engineer-build.md |
| data-engineer | data-engineer.md | data-engineer-build.md |
| analytics-engineer | analytics-engineer.md | analytics-engineer-build.md |
| data-modeller | data-modeller.md | data-modeller-build.md |
| applied-ml-scientist | applied-ml-scientist.md | applied-ml-scientist-build.md |
| deep-learning-engineer | deep-learning-engineer.md | deep-learning-engineer-build.md |
| bi-engineer | bi-engineer.md | bi-engineer-build.md |
| mlops-engineer | mlops-engineer.md | mlops-engineer-build.md |

**Not applicable:**
- `jfl` — orchestrator, no build phases of its own
- `researcher` — review-only, no build track
- `academic` — review-only, no build track
- `backend-engineer` — review-only, no build track
- `data-analyst` — no deep build track

---

## Per-Agent Split Guide

### data-scientist
**Remove from main file:**
- Decision Documentation — Critical Rules section
- Phase 0 — Triage through final Phase (Review and Handoff), including all gate enforcement lines
- Reviewer Verdict Protocol

**Add to main file (routing line):**
```
When the user selects the Build track, use the Read tool to load
`.claude/agents/data-scientist-build.md` and follow the workflow defined there.
```

---

### ml-engineer
**Remove from main file:**
- Decision Documentation — Critical Rules section
- Phase 0 — Triage through final Phase (Review and Handoff), including all gate enforcement lines
- Reviewer Verdict Protocol
- ML Engineer Handoff File section (if embedded in phases)

**Add to main file (routing line):**
```
When the user selects the Build track, use the Read tool to load
`.claude/agents/ml-engineer-build.md` and follow the workflow defined there.
```

---

### ai-engineer
**Remove from main file:**
- Decision Documentation — Critical Rules section
- Phase 0 — Triage through final Phase (Review and Handoff), including all gate enforcement lines
- Reviewer Verdict Protocol

**Add to main file (routing line):**
```
When the user selects the Build track, use the Read tool to load
`.claude/agents/ai-engineer-build.md` and follow the workflow defined there.
```

---

### data-engineer
**Remove from main file:**
- Decision Documentation — Critical Rules section
- Phase 0 — Triage through Deep Phase 7 (Review and Handoff) and Quick Track phases, including all gate enforcement lines
- Reviewer Verdict Protocol (currently in Behavioral Rules — move to build file)

**Add to main file (routing line):**
```
When the user selects [T] Triage or any build track option, use the Read tool to load
`.claude/agents/data-engineer-build.md` and follow the workflow defined there.
```

**Note:** The Behavioral Rules section stays in the main file. Only the Reviewer Verdict Protocol block moves to the build file (it lives within build phase logic).

---

### analytics-engineer
**Remove from main file:**
- Decision Documentation — Critical Rules section
- Phase 0 — Triage through final Phase (Review and Handoff), including all gate enforcement lines
- Reviewer Verdict Protocol

**Add to main file (routing line):**
```
When the user selects the Build track, use the Read tool to load
`.claude/agents/analytics-engineer-build.md` and follow the workflow defined there.
```

---

### data-modeller
**Remove from main file:**
- Decision Documentation — Critical Rules section (note: the Explore track exception stays as a note in the routing line)
- Phase 0 through Deep Phase 7 and Quick Track phases, including all gate enforcement lines
- Reviewer Verdict Protocol (currently in Behavioral Rules — move to build file, keep verdict vocabulary in Behavioral Rules since it's used in service mode)

**Keep in main file:**
- Service Mode (used when other agents call data-modeller via Task)
- Explore Track (no gates, conversational)
- Behavioral Rules (verdict vocabulary stays — it's needed for service mode responses)

**Add to main file (routing line):**
```
When the user selects [SC] Scope or [BC]/[ED]/[RM]/[CS]/[PD]/[B]/[H] (Quick or Deep track),
use the Read tool to load `.claude/agents/data-modeller-build.md` and follow the
workflow defined there.
```

---

### applied-ml-scientist
**Remove from main file:**
- Create Mode — Phase 0 through Phase 5 (Review & Handoff), including all gate enforcement lines
- Decision Documentation — Critical Rules section (if present)

**Keep in main file:**
- Advisory Mode (all [A][F][L][T][R] topics — conversational, no gates)
- Service Mode (called by ML Engineer via Task)
- Review Mode routing instruction

**Add to main file (routing line):**
```
When the user selects [C] Create, use the Read tool to load
`.claude/agents/applied-ml-scientist-build.md` and follow the workflow defined there.
```

---

### deep-learning-engineer
**Remove from main file:**
- Create Mode — Phase 0 through Phase 5 (Review and Handoff), including all gate enforcement lines

**Keep in main file:**
- Advisory Mode (all [A][T][R][F][D] topics — conversational, no gates)
- Service Mode (called by ML Engineer and Applied ML Scientist via Task)
- Review Mode routing instruction

**Add to main file (routing line):**
```
When the user selects [C] Create, use the Read tool to load
`.claude/agents/deep-learning-engineer-build.md` and follow the workflow defined there.
```

---

### bi-engineer
**Remove from main file:**
- Decision Documentation — Critical Rules section
- Phase 0 — Triage through Phase 4 (Final Review), including all gate enforcement lines
- Reviewer Verdict Protocol (if present)
- AE intake file writing logic (embedded in Phase 1 — moves with Phase 1)

**Keep in main file:**
- Scope and Escalation section
- Technology Guidance section
- Notes on Data Usage section
- Activation menu (including JFL handoff and bi-engineer-handoff.md handling logic — this is routing/activation logic, not a build phase)

**Note on bi-engineer handoff handling:** The `bi-engineer-handoff.md` reading logic in Activation is activation/routing logic (it determines how Phase 0 is populated), not a build phase itself. It stays in the main file but references the build file for Phase 1 onwards.

**Add to main file (routing line):**
```
When entering the build workflow (after triage and activation), use the Read tool to load
`.claude/agents/bi-engineer-build.md` and follow the workflow defined there.
```

---

### mlops-engineer
**Remove from main file:**
- Decision Documentation — Critical Rules section
- Phase 0 — Triage through final Phase (Review and Handoff), including all gate enforcement lines
- Reviewer Verdict Protocol

**Add to main file (routing line):**
```
When the user selects the Build track, use the Read tool to load
`.claude/agents/mlops-engineer-build.md` and follow the workflow defined there.
```

---

## Files Modified

For each of the 10 applicable agents:
1. `src/agents/{agent-slug}.md` — remove Phase 0–N sections + Decision Documentation + Reviewer Verdict Protocol; add one routing line pointing to the build file
2. `src/agents/{agent-slug}-build.md` — **new file** containing the extracted phases + gate logic

Total: 10 files modified + 10 new files created = 20 file operations.

---

## Execution Order

1. `data-scientist` — reference implementation (best understood)
2. `ml-engineer`
3. `ai-engineer`
4. `data-engineer`
5. `analytics-engineer`
6. `data-modeller` (most complex — has Explore + Quick + Deep tracks; Service Mode stays)
7. `applied-ml-scientist` (advisory mode stays; only Create Mode phases move)
8. `deep-learning-engineer` (advisory mode stays; only Create Mode phases move)
9. `bi-engineer`
10. `mlops-engineer`
11. Run `node tools/install.js` from repo root to copy all new and modified files into `.claude/agents/`

---

## Verification Checklist (per agent)

- [ ] Main file: activation menu intact
- [ ] Main file: conversational voice intact
- [ ] Main file: advisory/review/explain modes intact
- [ ] Main file: service mode intact (where applicable)
- [ ] Main file: behavioral rules intact
- [ ] Main file: routing line present and references correct build file path
- [ ] Main file: no Phase 0–N content remaining
- [ ] Build file: all phases present and complete
- [ ] Build file: all gate enforcement lines present ("Read this section back. Stop here.")
- [ ] Build file: Reviewer Verdict Protocol present (where applicable)
- [ ] Build file: JFL sign-off Task call present in final phase
- [ ] Build file: context checkpoint (compact/clear prompt before build phase) present
- [ ] `node tools/install.js` copies new build files into `.claude/agents/`
- [ ] Spot-check: `.claude/agents/{agent-slug}-build.md` exists after install

---

## Notes and Edge Cases

**data-modeller Explore track:** The Explore track has no gates and produces no spec file. It is conversational and stays in the main agent file alongside Service Mode. Only the Quick and Deep gated tracks move to the build file.

**applied-ml-scientist and deep-learning-engineer:** These agents have three modes — advisory (conversational), service (Task-invoked), and create (phased/gated). Only the Create Mode phases move to the build file. Advisory and service modes stay in the main file.

**bi-engineer handoff handling:** The activation section contains special handling for `bi-engineer-handoff.md` files (written by other agents to hand off to BI). This is activation/routing logic, not a build phase. It stays in the main file. The build file begins at Phase 1.

**Reviewer Verdict Protocol:** For agents where it appears in a Behavioral Rules section (e.g., data-engineer), move the protocol block to the build file. The surrounding behavioral rules (triage first, document before advancing, etc.) stay in the main file.

**Specific instructions files:** The `src/agents/specific_instructions/` directory is unaffected. No changes to BI handoff variants, DA handoff variants, or explain variants.
