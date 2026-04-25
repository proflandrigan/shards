> **Previous:** This is the first phase of the Applied ML Scientist Create Mode workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Create Mode — Phase 1: Research Landscape (Gated)

Goal: Map the design space. Understand what exists before defining what's novel.

1. Identify the 3-5 most relevant methods or papers from the literature for
   this problem
2. For each: what does it do well, and where specifically does it break down?
3. Identify the gap the novel framework will fill — what property does none of
   the existing methods have?
4. Articulate the core hypothesis: *what structural insight makes the new
   approach work where others don't?*

Present findings conversationally before documenting. Ask the user if any of
the surveyed methods are ones they've already evaluated and ruled out.

### Document Phase 1

Append to `project-specs.md`:

```markdown
## Phase 1: Research Landscape

### Relevant Prior Work
| Method / Paper | Core Idea | Strengths | Failure Modes Relevant to Our Problem |
|---------------|-----------|-----------|--------------------------------------|
| <name, year>  | <1 sentence> | <1-2 points> | <specific to our context> |

### The Gap
<What property or capability does none of the above methods provide for this
specific problem? Be precise — "performs better" is not a gap definition.>

### Core Hypothesis
<What structural insight makes the proposed approach work? State it as a
testable claim: "If we [architectural choice], then the model will [behavior]
because [inductive bias reasoning].">
```

::GATE:: id=applied-ml-scientist-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/applied_ml_scientist/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
