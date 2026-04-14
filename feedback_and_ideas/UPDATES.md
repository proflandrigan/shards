  3. Resource & Compute Awareness (Infrastructure)
  Nothing kills an ML workflow like an OOM (Out of Memory) error halfway through a training run or a massive cloud bill from an unoptimized prompt chain.
   * Compute Guardrails: The MLOps Engineer or Backend Engineer should have a "Resource Watcher" in the UI. I want to see my local GPU/CPU/Memory usage pinned to the dashboard so I know if
     the agent is about to try something that will hang my machine.
   * Token Budgeting: I want to set a "Hard Cap" for a project session. If the AI Engineer starts a multi-agent swarm that's going to cost $50 in Claude API credits, I want a "Stop-Loss"
     notification in the UI before it executes.

  5. Automated Bias & Robustness Testing (The Skeptic Shard)
  You’re planning a Skeptic shard—this is the killer feature.
   * Adversarial Data Generation: The Skeptic shouldn't just review code; it should generate "poisoned" or "edge-case" datasets to test the Deep Learning Engineer's model. 
   * PII Leakage Scans: For the AI Engineer, the Skeptic should automatically scan prompt outputs for accidental PII (Personally Identifiable Information) or system prompt leakage before any
     "Done" gate is passed.



 ---
 2.4 Broaden Academic Consultation Network

 Problem: Academic is consulted only by AI Engineer. Data Scientist (user behavior models), ML Engineer (recommenders/ranking),
 and BI Engineer (decision-influencing dashboards) could all benefit.

 Change: Add conditional Academic consultation: "If the system will influence user behavior, make recommendations to users, or
 involve vulnerable populations, consult the Academic shard."

 Files:
 - src/agents/specific_instructions/data_scientist/phases.md
 - src/agents/specific_instructions/ml_engineer/phases.md
 - src/agents/specific_instructions/bi_engineer/phases.md

 Impact: The Academic shard's expertise reaches the agents where it's most relevant.


## 1. Agent Swarms (Robust Multi-Agent Reviews)
**Objective:** Transition from single-agent reviews to a multi-specialist "Review Swarm" for complex plans, providing a synthesized, multi-dimensional perspective (e.g., code quality + data grain + methodology).

### Implementation Details:
*   **New File:** `src/agents/specific_instructions/syn/review_swarm.md`
    *   Instructions for Syn to identify relevant reviewers based on the project track and domain (e.g., Deep track ML project → Data Scientist + MLOps + Backend Engineer).
    *   Synthesis protocol: Syn reads all reviewer outputs and produces a single, consolidated verdict (APPROVED / NEEDS REVISION / BLOCKED).
*   **Update:** `src/agents/syn.md`
    *   Add `[RS] Review Swarm` to the activation menu.
    *   Add logic to Phase 3 (Review) to offer a Swarm Review for complex projects.
*   **Update:** `src/agents/specific_instructions/shared/reviewer_verdict_protocol.md`
    *   Add multi-agent arbitration rules: how to handle conflicting verdicts between different specialists in the same swarm.

## 2. Adversarial Reviews (The Skeptic Shard)
**Objective:** Introduce a **Skeptic** shard specifically designed to find failure modes, security risks, bias, and edge cases that "helpful" agents might overlook.

### Implementation Details:
*   **New File:** `src/agents/skeptic.md`
    *   Persona: Critical, cautious, detail-oriented, and intentionally skeptical.
    *   Role: Review-only agent (no project phases).
*   **New File:** `src/agents/specific_instructions/skeptic/checklist.md`
    *   Specific checklists for:
        *   **Edge Cases:** Null handling, volume spikes, missing data.
        *   **Security:** SQL injection, hardcoded secrets, PII exposure.
        *   **Scale:** Memory constraints, latency, N+1 query patterns.
        *   **Bias/Ethics:** Sample bias, model fairness, unintended consequences.
*   **Update:** `src/agents/syn.md`
    *   Include the Skeptic in the default list of agents for Review Swarms.

## 3. Execution Guardrails (Auto-Fixer Loop)
**Objective:** Implement an "Auto-Fixer" loop that automatically diagnoses and retries failed shell commands before escalating to the user.

### Implementation Details:
*   **Update:** `src/agents/specific_instructions/shared/behavioral_rules.md`
    *   Add a new section: **Execution Guardrail Protocol**.
    *   Protocol: On shell failure (exit code != 0), the agent MUST NOT report failure immediately. Instead:
        1. Capture `stderr`.
        2. Spwan a `Task(subagent_type="syn", mode="fixer")` to diagnose the error.
        3. Propose a specific fix (e.g., "Install missing package", "Fix typo in path").
        4. Retry the command once.
        5. Escalate to the user only if the retry fails.
*   **Update:** `src/agents/specific_instructions/syn/fixer.md`
    *   Add a specific mode for **Execution Troubleshooting** to handle automated diagnosis.




----------------------------------------------------------------------------------------------


1. The "Live Trace" DAG (Observability)
  When an agent is performing a complex task (e.g., a multi-step refactor), the chat interface is too linear. I want a visual execution graph that updates in real-time.
   * The Stickiness: Instead of reading lines of text, I can see the agent branching: "Grep Search" → "Found 3 Files" → "Reading File A" → "Calling Sub-agent". If it goes down a rabbit hole,
     I can click a node in the graph and "Prune" or "Redirect" it immediately. It turns a black box into a glass box.

  2. "One-Click to Eval" (Automated Feedback Loops)
  AI engineers are obsessed with regression. Every time the agent gives a perfect (or perfectly wrong) answer, there should be a button: "Add to Eval Set."
   * The Stickiness: This automatically saves the prompt, context, and response into a local JSONL dataset. Later, I can run a "Shards Eval" command to see if my recent changes to the
     agent's system prompt or tool definitions improved or degraded performance across all my saved scenarios.

  3. Semantic "Context Proposer" (Proactive RAG)
  The Pinboard is great, but I shouldn't have to manualy find every file.
   * The Stickiness: As I type "Fix the websocket leak in the relay," the UI should show a small "Suggested Context" shelf with src/ui/relay.js and src/ui/server.js based on a local semantic
     index. One click to "Pin All." It removes the cognitive load of navigating the file tree.

  4. Inline "Agent Diff" in the Editor
  The transition from Chat to Monaco Editor should be seamless.
   * The Stickiness: Highlight a block of code in the UI's editor, hit Cmd+K, and type "Make this more robust." The agent generates a diff inline with a "Accept/Reject" UI. This brings the
     agent's intelligence directly into the code-writing flow without the "copy-paste dance."

  5. "Prompt Lab" Side-by-Side
  Prompt engineering is still experimental.
   * The Stickiness: A mode where I can send the same request to two different agent personas (e.g., ai-engineer vs. backend-engineer) or two versions of a system prompt, and see the results
     side-by-side with a "Diff" view. This makes "vibes-based" testing rigorous and fast.

  6. Automated "Data-to-Viz" Detectors
  Since Shards is data-focused (using Tabulator and Plotly), it should be proactive.
   * The Stickiness: If an agent outputs a JSON array or a CSV-formatted block, the UI should automatically render a "Visualize" button. Clicking it instantly pops open a Plotly
     configurator. It turns the agent from a "coder" into a "data analyst" with zero friction.


  4. Agent "Handoff" Timeline
  Concept: A horizontal timeline at the top of the chat pane showing which "Shard" (agent) was active during the session.
   - Why: In complex workflows (e.g., Researcher → Architect → Engineer), it's easy to lose track of context.
   - Visuals: A color-coded "ruler" (Gold for Syn, Teal for AI Engineer). Clicking a segment instantly scrolls the chat to that agent's contribution.


  7. "Session Branching" (Time Travel)
  Concept: A "Snapshot" button that allows you to "Save State" and try a risky refactor. If it fails, you "Rewind" the entire workspace (files + chat) to that snapshot.
   - Why: Gives developers the "undo" confidence needed to let agents perform destructive or wide-reaching changes.
   - Visuals: A vertical timeline on the far right showing snapshots with descriptions (e.g., "Before Auth Refactor").

  8. "Interactive REPL" Tab
  Concept: A dedicated tab for a live Node/Python/SQL REPL that shares the project root.
   - Why: Quickly testing a snippet the agent just generated without leaving the UI or creating a temp file.
   - Visuals: A standard terminal interface (xterm.js) styled with the Shards "Glassmorphic" theme.
