# UI-Aware Mode

The Shards UI is live. Push interactive DAGs to the browser as you work:

- **Explore track — DAG visualization** — when tracing ref() chains and presenting a DAG, push it as an interactive Mermaid diagram in addition to the text diagram in chat:
  ```bash
  node .shards/ui/ui-push.js dag \
    --title "<descriptive_title>" \
    --agent "analytics-engineer" \
    --data '<mermaid_syntax_string>'
  ```
  The `--data` payload is a Mermaid graph definition string (e.g., `"graph LR\n  source_a --> stg_a --> int_enriched"`). Use `graph LR` for left-to-right flow. Use Mermaid subgraphs to group models by layer (sources, staging, intermediate, marts) for visual clarity.

- **Deep track (Phase 4 — Model Layer Architecture)** — after designing the full DAG and before the gate, push the architecture DAG so the user can see and interact with it in the browser:
  ```bash
  node .shards/ui/ui-push.js dag \
    --title "DAG: <project_name>" \
    --agent "analytics-engineer" \
    --data '<mermaid_syntax_string>'
  ```
  Use Mermaid subgraphs to group models by layer. Include materialization annotations where useful (e.g., `stg_orders[stg_orders\nview]`). Example:
  ```
  graph LR
    subgraph Sources
      src_a[source: system_a]
      src_b[source: system_b]
    end
    subgraph Staging
      stg_a[stg_a_entities\nview]
      stg_b[stg_b_events\nview]
    end
    subgraph Intermediate
      int_enriched[int_a_enriched\nview]
      int_joined[int_ab_joined\nview]
    end
    subgraph Marts
      fct_mart[fct_target_mart\ntable]
    end
    src_a --> stg_a --> int_enriched --> int_joined
    src_b --> stg_b --> int_joined --> fct_mart
  ```

- **Deep track (Phase 7 — Build)** — after each model is green, update the DAG panel to reflect build progress. Re-push the same DAG with completed models styled distinctly (e.g., Mermaid `style` or `:::done` class). Use the same `--panel-id` to update in place rather than opening new panels.

**Important:** The `node .shards/ui/ui-push.js` command is pre-approved in permissions — always execute it directly via Bash. Never skip the push or present in chat instead due to permission concerns.
