# BI Engineer Validation Checklist

Applied at the end of any phase that creates or modifies a dashboard, report, or interactive visualization (Streamlit, Dash, Altair, Plotly, Superset, Grafana, Metabase, etc.). Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Check IDs (BI-01 through BI-08) are stable. BI validation centers on one question: **does what the user sees match the underlying data, under every interaction path?** A beautiful dashboard showing subtly wrong numbers is worse than no dashboard.

## BI-01 — Chart-Data Alignment

Every chart displays what the underlying query or dataframe actually contains.

- For each chart: spot-check at least one visible data point against the source query result.
- Axis scales (linear vs log, truncated vs zero-based) chosen deliberately and not misleading.
- Aggregations in the chart match aggregations the user is told the chart shows (e.g., "Monthly Revenue" means monthly, not daily summed).
- Units and labels correct and present.

**Observed format:** `8 charts | spot-checks: bar height for APAC region in "Revenue by Region" = $3.84M (source query row: $3.84M ✓) | axis scales: revenue chart truncation called out in subtitle | units: $ where revenue, % where rates | all 8 charts verified`

## BI-02 — Filter & Selector Correctness

Every user-facing filter or selector produces the correct result across its range of values.

- For each filter: exercise at least 3 values (min, max, middle) and confirm the resulting data reflects the filter.
- Combined filters tested: applying two filters simultaneously doesn't double-count or miss records.
- Default state verified (e.g., "All" option shows all data, not an implicit subset).

**Observed format:** `4 filters (date, region, product, user_tier) | each tested at 3 values × cross-filter with one other | "All" for region = $48.2M (matches unfiltered total ✓) | combined date+region: APAC × Q1 matches the query in sql/revenue_apac_q1.sql`

## BI-03 — Cross-Filter & Drill-Down Behavior

(Skip with `n/a` if no cross-filter or drill-down.) Interactive state propagates correctly between components.

- Clicking a bar in chart A filters chart B to the selected value.
- Drill-downs return expected detail, and the "clear" / "back" action returns to the parent state.
- URL state (if used) round-trips: copying the filtered URL reproduces the view.

**Observed format:** `cross-filter: click APAC in region chart → revenue timeline filters to APAC only (verified) | drill-down: product → category → SKU path tested, each level shows correct detail | URL state: filtered URL reproduces view on paste ✓`

## BI-04 — Edge-Case Rendering

The dashboard renders acceptably when data is empty, sparse, or degenerate.

- Empty dataset (filter returns zero rows): friendly message, no crash, no misleading "0" charts that look like failure.
- Single-row dataset: charts render without error; numeric displays don't divide by zero.
- Many categories (e.g., 100+ product SKUs): charts don't become illegible; truncation or aggregation applied.
- Missing dimensions (e.g., null region): handled explicitly, not silently dropped.

**Observed format:** `empty state: filter to 2030-01-01 → "No data for selected period" message (not blank chart) ✓ | single-row state: single region selected shows summary card + trend line OK | 120-SKU case: top-20 + "Others" aggregation applied | null dimensions: bucketed as "Unknown" with tooltip`

## BI-05 — Performance

The dashboard loads and responds to interaction within the spec's budget.

- Initial load time on representative connection and hardware.
- Interaction latency: filter change → chart update.
- Query performance: each underlying query's execution time; caching strategy if relevant.

**Observed format:** `initial load: 2.1s (budget <5s) ✓ | filter change median: 340ms (budget <1s) ✓ | slowest query: retention_cohort.sql = 1.8s, cached in-app for 5min | profile: dashboards/<project>/profile.md`

## BI-06 — Accessibility Basics

Minimum accessibility standards met for common use.

- Color palettes are color-blind-safe (use viridis, ColorBrewer palettes, or equivalent; avoid red-green-only encoding for semantic meaning).
- Charts have titles, axis labels, and units — no "chart1.png" mystery plots.
- Alt-text or screen-reader descriptions provided for static-export charts (reports, PDFs).
- Font size and contrast adequate for the deployment context (boardroom screen vs phone).

**Observed format:** `palette: viridis (8-class) | all 8 charts have titles, axis labels, units | static exports include alt-text | contrast: WCAG AA on text/background | reviewed against: dashboards/<project>/a11y_checklist.md`

## BI-07 — Browser / Platform Compatibility

(Skip with `n/a` for CLI-only or non-web dashboards.) The dashboard works on the platforms stakeholders actually use.

- Tested on at least: the default corporate browser, one other evergreen browser, one mobile browser if the deployment context includes mobile.
- Display verified at the target resolution(s).
- No console errors or warnings on load.

**Observed format:** `Chrome 128 ✓, Firefox 130 ✓, Safari 17 (iOS 17) ✓ | desktop 1920×1080 ✓, MacBook 14" ✓, iPhone 15 (Safari) ✓ | 0 console errors, 0 warnings on all paths`

## BI-08 — Stakeholder Walkthrough

The target user has actually used the dashboard to answer the question it was built for.

- Walkthrough held with the named stakeholder(s) from the spec.
- Each question listed in the spec was answerable using the dashboard.
- Feedback captured (bugs, missing features, confusions) and either addressed or escalated to Open Issues.

**Observed format:** `walkthrough: Finance team lead (2026-04-21, 45min) | 5/5 spec questions answered using dashboard | 2 feedback items: (1) add quarter-over-quarter toggle — added, (2) confusion on "net vs gross revenue" label — clarified via tooltip + subtitle | feedback log: dashboards/<project>/walkthrough.md`

---

## Track Calibration

Rows are indexed by `(Track, Mode)` per `shared/validation_protocol.md`.

| Track | Mode | Required | Recommended | Skippable |
|-------|------|----------|-------------|-----------|
| **deep** | `greenfield` (new dashboard) | BI-01, BI-02, BI-04, BI-06, BI-08 | BI-03, BI-05, BI-07 | — |
| **deep** | `iteration` (modify existing) | BI-01 (for changed charts), BI-02 (for changed filters), BI-05, BI-08 | BI-04, BI-06, BI-07 | BI-03 (if cross-filter behavior unchanged) |
| **quick** | `design-only` (chart design description, no data access) | BI-01 replaced by "design intent matches spec question" | BI-06 | rest (no executable dashboard produced) |
| **fixer** | (Mode omitted) | BI-01 for the fixed chart + "what changed, what didn't break" | BI-02 if filters touched | rest |

Any skipped or inapplicable check must still appear as a row with `Pass/Fail: n/a` and a Notes cell giving the reason. See `shared/validation_protocol.md`.

## Artifacts Expected

- Dashboard code (Streamlit `app.py`, Dash `app.py`, Altair spec, etc.) under `dashboards/<project>/`
- `dashboards/<project>/walkthrough.md` — BI-08
- `dashboards/<project>/profile.md` (load/interaction benchmarks) — BI-05
- `dashboards/<project>/a11y_checklist.md` — BI-06
- Underlying SQL or data sources referenced explicitly

## Downstream Impact — What to Cover

- **Stakeholder workflows:** who is expected to use this, and does it fit their existing workflow (e.g., does it embed in a shared team space or require login)?
- **Decision cadence:** is this refreshed daily/weekly/monthly, and does the caching strategy match?
- **Breaking changes for existing viewers:** if replacing an older dashboard, confirm URL migration or include a redirect.

## When to Escalate

- **BI-01 chart-data misalignment that can't be resolved** — stop. A wrong number on a dashboard is worse than no dashboard. Consult Analytics Engineer on the underlying model.
- **BI-08 stakeholder can't answer the question with the dashboard** — fundamental design problem; reopen the design phase, do not ship.
- **BI-04 edge cases produce misleading output** (e.g., empty state renders a plausible-looking zero chart) — fix before shipping; users will act on it.
- **Any check produces a result the agent cannot explain.** Record as `✗` and surface in Open Issues.
