# Data Modeller Validation Checklist

Applied at the end of any phase that produces or modifies a logical or physical data model — entity-relationship diagrams, grain specifications, key designs, SCD strategies, conformed dimensions. Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Data Modeller validation is **structural**, not executable. Most evidence takes the form of "I walked through the design with X and confirmed Y" rather than numeric measurements. Record the walkthroughs explicitly — they are the evidence.

## DM-01 — Grain Declared Per Entity

Every entity in the model has a single, documented grain.

- For each fact/event: "one row per <entity>".
- For each dimension: "one row per <entity>, current value" or "one row per <entity>-version" for SCD-2.
- Bridge/link tables: "one row per <association>".

**Observed format:** `8 entities | all have declared grain (see data_models/<project>/entities.md) | fct_order: one row per order_id | dim_customer: SCD-2, one row per customer_id × valid_from ✓`

## DM-02 — Cardinality Explicit on Every Relationship

Every relationship between entities declares its cardinality (1:1, 1:M, M:1, M:M).

- M:M relationships modeled via an explicit bridge entity, not left implicit.
- Optional relationships (0..1, 0..M) distinguished from mandatory (1..1, 1..M) where it affects join logic.
- For each relationship, the FK side and PK side are named.

**Observed format:** `14 relationships documented | 2 M:M resolved via bridge (order_items, user_roles) | 0 implicit M:M remain | diagram: data_models/<project>/erd.png`

## DM-03 — Key Design Coherent

Primary keys, foreign keys, and surrogate keys are deliberate.

- Natural vs surrogate key decision is intentional per entity (not inherited by default).
- Composite PKs named and documented where used.
- FK columns have consistent types and nullability with their referenced PKs.
- Surrogate key generation strategy (hash, sequence, UUID) chosen deliberately.

**Observed format:** `PK strategy: surrogate hash for fact tables (for idempotent re-ingestion), natural for dimensions | 8 entities, 8 PKs declared | 12 FKs, all type-matched to referenced PKs | sequence vs hash decision: docs §3.1`

## DM-04 — Normalization Appropriate for Workload

The level of normalization matches the intended workload (OLTP vs OLAP, transactional vs analytical).

- OLAP/warehouse marts: denormalized dimensional model (star/snowflake), reasonable redundancy.
- OLTP/application: normalized to 3NF unless there's a profiled reason otherwise.
- Decision recorded per entity or layer, with rationale.

**Observed format:** `workload: analytical warehouse | strategy: star schema for marts, 3NF for staging | 4 conformed dimensions identified (customer, product, date, geography) | docs §2`

## DM-05 — Historical Strategy (SCD) Documented

For each dimension, the change-tracking strategy is explicit.

- Type 0 (immutable), Type 1 (overwrite), Type 2 (versioned with effective dates), Type 3 (previous value column), or hybrid.
- Effective-date columns named consistently across SCD-2 dimensions.
- "Current row" convention documented (flag column vs MAX(valid_from)).

**Observed format:** `5 dimensions | SCD: customer=Type-2, product=Type-2, geography=Type-1, date=Type-0, campaign=Type-1 | current-row convention: is_current=true flag | docs §4`

## DM-06 — Conformed Dimensions Identified

Dimensions shared across multiple facts are explicitly conformed — same grain, same surrogate key, same attributes.

- List of conformed dimensions.
- For each, the facts that share it.
- Any near-conformed dimensions (nearly identical but slightly divergent) flagged for reconciliation.

**Observed format:** `4 conformed dimensions (customer, product, date, geography) shared across 7 facts | 1 near-conformed case flagged: campaign dim differs between marketing and revenue marts — reconciliation plan in docs §5`

## DM-07 — Naming Conventions Consistent

Entity, column, and relationship names follow a documented convention.

- Prefix/suffix rules (e.g., `dim_` / `fct_`, `_id` / `_sk` / `_nk`, `_at` for timestamps).
- Case convention (snake_case) consistent across all names.
- Abbreviations explained (e.g., `clv` = customer lifetime value) in a glossary if used.

**Observed format:** `convention: snake_case, dim_/fct_/bridge_ prefixes, _id for natural key, _sk for surrogate, _at for timestamps | 87 columns across 8 entities audited | 0 violations | glossary: data_models/<project>/glossary.md`

## DM-08 — Stakeholder Walkthrough

The model has been walked through with the teams that will consume it.

- For each consumer team (analytics, ML, BI, data engineering): walkthrough held, feedback incorporated.
- Open questions from consumers resolved or surfaced to Open Issues.
- For greenfield models feeding downstream specialists, this walkthrough is the handoff.

**Observed format:** `walkthroughs: AE team (2026-04-18, signed off), DS team (2026-04-19, 2 revisions applied), BI team (2026-04-20, pending re: dashboard grain question) | feedback log: data_models/<project>/feedback.md`

---

## Track Calibration

Rows are indexed by `(Track, Mode)` per `shared/validation_protocol.md`.

| Track | Mode | Required | Recommended | Skippable |
|-------|------|----------|-------------|-----------|
| **deep** | `greenfield` (full new domain) | DM-01, DM-02, DM-03, DM-04, DM-05, DM-06, DM-07, DM-08 | — | — |
| **deep** | `iteration` (modify existing model) | DM-01, DM-02, DM-03 (for changed entities), DM-07, DM-08 | DM-05, DM-06 | DM-04 (if workload unchanged) |
| **quick** | `explore` (read-only exploration for handoff) | DM-01, DM-02 (document what exists) | — | rest (no new model produced) |
| **quick** | `schema-change` (small addition) | DM-01, DM-03, DM-07 + DM-08 for affected consumer | DM-02 | rest |
| **fixer** | (Mode omitted) | DM-08 mini-walkthrough with the one affected consumer | — | rest |

Note: quick `explore` Mode is **not** validation-eligible in the artifact sense — it produces handoff context, not a model. Use `Pass/Fail: n/a (mode=explore, no new artifacts)` where needed.

Any skipped or inapplicable check must still appear as a row with `Pass/Fail: n/a` and a Notes cell giving the reason.

## Artifacts Expected

- `data_models/<project>/entities.md` — grain declarations per entity (DM-01)
- `data_models/<project>/erd.png` or equivalent ERD diagram — DM-02
- `data_models/<project>/glossary.md` — naming and abbreviations (DM-07)
- `data_models/<project>/feedback.md` — stakeholder walkthrough log (DM-08)
- For physical model: `schema.yml` entries with grain and key documentation — propagate to DE's DE-01

## Downstream Impact — What to Cover

- **Every downstream specialist** consuming the model: AE for marts, DE for pipelines, DS for analysis, ML for features, BI for dashboards. Each consumer named and signed off.
- **Query patterns** the model is optimized for — if a consumer needs a pattern not supported, surface it before closing.

## When to Escalate

- **DM-02 M:M relationships that resist resolution** — the domain itself may be modeled wrong; consult Syn for re-framing.
- **DM-06 near-conformed dimensions that can't be reconciled** — escalate to Analytics Engineer and the owning consumer teams before proceeding.
- **DM-08 stakeholder disagreement that can't be resolved in-session** — do not close; hold the gate until the disagreement is surfaced to the user.
- **Any check produces a result the agent cannot explain.** Record as `✗` and surface in Open Issues.
