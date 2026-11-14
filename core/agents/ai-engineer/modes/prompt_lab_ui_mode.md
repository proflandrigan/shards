# Prompt Lab UI Mode — AI Engineer

The Shards UI is live. Push the Prompt Laboratory panel to the browser.

## How to push

```bash
node .shards/ui/ui-push.js prompt-lab \
  --title "Prompt Lab: <project_name>" \
  --agent "ai-engineer" \
  --panel-id "pl-<project_name>" \
  --source "<project_dir>/prompt-lab.json"
```

Using `--source` means the server watches the file for changes. After the initial push,
you only need to update `prompt-lab.json` — the UI picks up changes automatically.

## When to push

Push the panel once during Setup (after writing the initial `prompt-lab.json`). The file
watcher handles all subsequent updates — you do not need to re-push.

## Important

- The `node .shards/ui/ui-push.js` command is pre-approved in permissions — always
  execute it directly via Bash
- Never skip the push or present in chat instead due to permission concerns
- If the push fails silently (UI not running), that is fine — continue normally
