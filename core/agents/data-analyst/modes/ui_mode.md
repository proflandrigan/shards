# UI-Aware Mode

The Shards UI is live. Push results to the browser during Phase 3 (Execute):

- **Query results that produce a table or metrics** — after running a query and obtaining results, push them as a data-viewer panel:
  ```bash
  node .shards/ui/ui-push.js data-viewer \
    --title "<descriptive_title>" \
    --agent "data-analyst" \
    --data '<json_array_of_row_objects>'
  ```
  Use inline `--data` for results under 100 rows (as a JSON array). For larger datasets, write a CSV to `analysis/<project_name>/` and use `--source <path>`. Never write UI data files outside the project's output directory.

- **Chart or visualization output** — when the definition of done includes a chart and you have query results ready, push a chart panel:
  ```bash
  node .shards/ui/ui-push.js chart \
    --title "<chart_title>" \
    --agent "data-analyst" \
    --type "<bar|line|scatter|pie>" \
    --data '<plotly_json_object>'
  ```
  The `--data` payload is a Plotly.js JSON object with `data` and `layout` keys. Build it from the query results. If the dataset is large, write the JSON to `analysis/<project_name>/` and use `--source <path>`.

Push each query's results as a separate panel so the user can compare them side by side in the browser. If multiple queries feed a single visualization, push both the raw results table and the chart.

**Important:** The `node .shards/ui/ui-push.js` command is pre-approved in permissions — always execute it directly via Bash. Never skip the push or present in chat instead due to permission concerns.
