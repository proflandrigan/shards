> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Phase 3 — Data and Feature Discovery

Goal: Understand what data is available for features and labels.

**If productionization from study:** The Data Scientist has already completed feature
discovery. Start by reading the study's Phase 2 (Data Discovery) and Phase 4 (Modeling
Approach) from the study's `project-specs.md`. Present the inherited feature set to the
user, then focus this phase on the **production-specific gap**:
- Which study features are available at the required inference latency?
- Which features need real-time alternatives or pre-computation?
- Are there features the study used that cannot be productionized?
Still consult the Data Modeller, but scope the consultation to serving-time data
availability rather than full discovery.

**Otherwise (greenfield or iteration):** proceed as below.

**Consult the Data Modeller:**

Tell the user: "Pulling in the Data Modeller. Feature definitions have to be grounded in actual data models, not what we hope exists."

```
Task(
  subagent_type="data-modeller",
  description="Explore data model for ML features",
  prompt="I am the ML Engineer shard building an ML system for [purpose]. I need to
  understand the data models that could source features for this system. Specifically:
  1. What tables capture [relevant entities and events]?
  2. What's the grain and freshness of each?
  3. How do they relate to each other (join keys, cardinality)?
  4. Any data quality concerns?
  5. Which tables are available in real-time vs. batch only?
  Focus on: [specific entities, events, or business concepts].
  Since I'll be building feature extraction queries against these tables, please run
  grain validation (PK uniqueness checks) and freshness checks on the key tables."
)
```

**Greenfield handling:** Applies to greenfield and iteration projects only. If this is
a productionization from a study, skip — the study is the data source.

For greenfield and iteration: check whether the Data Modeller's response contains
"NO DATA ENVIRONMENT DETECTED".

If it does:
1. Present the Data Modeller's response to the user.
2. Ask:
   "The Data Modeller found no data assets in this project. For an ML system, data
   is the foundation of every feature and training decision.
   - (a) Feature data exists in your warehouse — tell me what entities and events
     are available. I'll design feature extraction from there.
   - (b) Data exists but schema details aren't available right now — I can design
     the feature architecture and model approach; actual queries and training will wait.
   - (c) No data exists yet — I can produce a full ML architecture design, but
     nothing will train or serve real predictions until data is available.
   Which situation are we in?"
3. Wait for the user's response before proceeding.
   - (a): proceed with provided context.
   - (b): proceed with caveats. Flag feature availability column in Phase 3 docs as
     "Unverified — user-described." Add:
     `**Data environment:** Feature data exists but inaccessible — candidates user-described, not verified.`
   - (c): tell the user: "This will be an ML architecture design document. I can
     define feature requirements, label definition, model architecture, and
     infrastructure design — but the model cannot train and feature queries cannot
     run until data exists. All feature candidates will be flagged
     [THEORETICAL — DATA NOT AVAILABLE]. Do you want to proceed on that basis?"
     Wait for confirmation. Add:
     `**Data environment:** GREENFIELD — No data assets detected. Theoretical ML design only.`

Present findings, then ask:
- **Label definition:** How is the target variable defined? Where does ground truth come from?
  Is there label delay (e.g., churn only observable 90 days later)?
- **Feature candidates:** What signals could predict the target? Group by:
  - User/entity attributes (demographic, account-level)
  - Behavioral features (engagement, usage patterns, recency/frequency/monetary)
  - Contextual features (time of day, device, location)
  - Interaction features (user x item, user x content)

  For each group, also propose 1-2 **novel derived candidates** — e.g., ratios between signals, recency-weighted aggregations, behavioral sequences, or domain-specific composites not available as raw columns. These should be presented alongside standard features with a note on engineering cost.
- **Feature availability at inference:** For each feature group, is it available
  at the latency required for serving?
- **Historical depth:** How far back does the data go? Is it sufficient for training?
- **Known biases:** Selection bias, survivorship bias, feedback loops

### Document Phase 3

```markdown
---

## Phase 3: Data and Feature Discovery (ML Engineer)
- **Data Modeller consultation:**
  - <summary of data model findings>
- **Label definition:**
  - Target: <variable name and definition>
  - Ground truth source: <table or event>
  - Label delay: <duration or "none">
  - Label quality concerns: <issues or "none">
- **Feature candidates:**
  | Feature Group | Examples | Source Table(s) | Available at Inference? |
  |--------------|---------|-----------------|----------------------|
  | Entity attributes | <examples> | <tables> | Yes — batch | Yes — real-time | No |
  | Behavioral | <examples> | <tables> | Yes — batch | Yes — real-time | No |
  | Contextual | <examples> | <tables> | Yes — real-time | No |
  | Interaction | <examples> | <tables> | Yes — batch | No |
- **Historical depth:** <time range available>
- **Known biases:**
  - <bias type>: <description and mitigation>
- **Feature-serving gap:** <features available in batch but not real-time, and impact>
- **Data environment:** <not greenfield | Feature data exists but inaccessible — candidates user-described, not verified | GREENFIELD — No data assets detected. Theoretical ML design only>
```

::GATE:: id=ml-engineer-phase-3 phase=3 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ml_engineer/phases/phase-4.md` in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
