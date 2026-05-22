# Claude Code Auto Mode

Claude Code's auto mode auto-approves tool calls via a server-side classifier instead of prompting per action. It composes well with Shards: gates remain as workflow checkpoints, and auto mode eliminates the per-command friction between them.

**You do not need auto mode to get a smooth Shards experience.** The Shards installer ships narrow `permissions.allow` rules that pre-approve common specialist operations (`dbt build`, `pytest`, `jupyter nbconvert --execute`, file writes scoped to output directories, etc.) — these work in every permission mode and cover most of the friction auto mode would remove. If you're on a plan that supports auto mode it's a useful additional polish; if you're not, skip to [Without auto mode](#without-auto-mode) below and you'll have nearly the same experience.

This page documents the recommended configuration, the composition with Shards gates, and the limitations.

## What it is

Auto mode is one of Claude Code's permission modes (alongside `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`). When active, every tool call is evaluated by a classifier that auto-approves working-directory-bound operations and routes anything that looks risky (external network requests, production deploys, force pushes, irreversible destruction) back through a permission prompt. The classifier reads your `CLAUDE.md` and your `autoMode.*` settings to understand what "trusted" means for your environment.

It also nudges Claude to keep working without stopping for clarifying questions, which composes naturally with how Shards specialists run multi-step phases.

For the full reference see [Claude Code's permission modes docs](https://code.claude.com/docs/en/permission-modes) and [Configure auto mode](https://code.claude.com/docs/en/auto-mode-config).

## Why it pairs well with Shards

Two systems doing different jobs:

| Concern | Handled by |
|---------|------------|
| Should this individual tool call execute? | Claude Code's permission system + (when active) auto mode classifier |
| Should the agent advance from Phase N to Phase N+1? | Shards `::GATE::` hook |

Auto mode collapses the per-tool-call approval noise between gates. The gates themselves stay human-confirmed — the user reviews each phase's plan or output before the specialist proceeds.

A representative mid-session sequence under auto mode might look like:

1. User runs `/ml-engineer build a churn classifier`
2. Specialist completes Phase 1 (problem framing) — emits gate fence — **pauses for user review** ⚠️
3. User confirms
4. Specialist executes Phase 2 (data exploration) — runs `bq query --dry_run`, reads schemas, writes preliminary notebook — **no prompts**
5. Specialist emits Phase 2 gate fence — **pauses for user review** ⚠️
6. User confirms
7. Specialist executes Phase 3 (modelling) — trains baseline, runs `pytest`, writes model card — **no prompts**
8. ...

The classifier handles the safety floor (would refuse to run, say, a `terraform apply` against production even if the specialist tried). The Shards installer pre-approves common specialist Bash and Edit patterns so the classifier doesn't even see them.

## Plan and account requirements

Anthropic gates auto mode by plan:

- **Plan**: Max, Team, Enterprise, or API. **Not available on Pro.**
- **Model**: Claude Sonnet 4.6, Opus 4.6, or Opus 4.7
- **Provider**: Anthropic API only. Not available on Bedrock, Vertex, or Foundry.
- **Admin**: on Team and Enterprise, an admin must enable it in Claude Code admin settings

This is an Anthropic product decision, not a Shards limitation. The classifier is a second model call per tool use (cost) and the safety surface is broader when no one is watching each action. If you're on a plan that doesn't qualify, the [Without auto mode](#without-auto-mode) path below gives you nearly the same experience using `acceptEdits` mode plus the allow rules Shards ships.

## Recommended setup

### `~/.claude/settings.json`

⚠️ **Important:** `permissions.defaultMode: "auto"` only works in your **user-level** settings file (`~/.claude/settings.json`). Setting it in the project's `.claude/settings.json` is silently ignored — the project cannot grant itself auto mode.

```json
{
  "permissions": {
    "defaultMode": "auto"
  },
  "autoMode": {
    "environment": [
      "$defaults",
      "Shards workspaces: any project containing a `.shards/` directory uses the Shards agent framework. Reads from and writes to project subdirectories (analysis/, studies/, models/, services/, data_models/, dashboards/, research/, presentations/, panels/, fixes/, brainstorm/) and `.shards/` are routine specialist work.",
      "Warehouse access: dbt commands (run, build, test, show, ls, compile), bq read-only queries, and SELECT-only psql/snowsql/duckdb invocations against developer-configured (non-production) warehouses are routine validation operations.",
      "Notebook execution: `jupyter nbconvert --execute` on notebooks under analysis/, studies/, models/, research/, services/ is routine validation work."
    ]
  }
}
```

The `"$defaults"` token splices in the built-in environment entries (trusted working directory and configured git remotes). Without it, your custom entries replace the defaults entirely.

### The project-level pieces (already in place)

The Shards installer ships these so you don't have to configure them:

1. **Narrow allow rules** in `.claude/settings.json`. The installed allowlist uses narrow `Bash(<cmd>:*)` and `Edit(<dir>/**)` patterns that survive auto mode's pruning of broad rules. Anything matching these rules bypasses the classifier entirely — fastest possible path.
2. **A deny floor** that blocks force pushes, pushes to `main`/`master`, `sh -c`/`bash -c` evil-script execution, and `rm -rf --no-preserve-root`. Deny rules beat auto mode classifier approvals.
3. **`ask` rules** for production-target dbt invocations that force a prompt even under auto mode.
4. **A tool-call conventions section in `CLAUDE.md`** that primes the classifier on what counts as routine Shards work (file write scopes, routine commands, gate semantics).

Re-running `node tools/install.js` (or `npx github:proflandrigan/shards install` from a fresh project) backfills any of these that are missing without removing your customizations.

## What auto mode blocks even under Shards

The classifier still blocks the following by default — Shards conventions do not override these:

- **Production deploys and migrations** — `dbt run --target prod`, `terraform apply`, `kubectl apply`, and similar
- **Force push, or push to `main`/`master`** — also blocked by Shards' deny rules
- **Mass deletion on cloud storage**
- **Granting IAM or repo permissions**
- **Downloading and executing code** (`curl ... | bash`)
- **Sending sensitive data to external endpoints**
- **Modifying shared infrastructure**

If the classifier blocks something routine for your environment that isn't covered by the default trusted list, add it to `autoMode.environment` in your user settings. Run `claude auto-mode config` to inspect the effective rules.

## Footguns

### Boundaries you state in conversation persist until lifted

If you tell Shards "don't push to remote until I approve," the classifier picks that up from the transcript and enforces it even when the default rules would allow a push. Useful for tightening behavior mid-session. But if context compaction removes the message that stated the boundary, the boundary is lost. For a hard guarantee, add a `deny` rule to your settings instead.

### Broad allow rules get dropped

On entering auto mode, Claude Code drops `Bash(*)`, `PowerShell(*)`, wildcarded interpreters like `Bash(python*)`, package-manager run commands, and `Agent` allow rules. Narrow rules like `Bash(npm test)` carry over. The Shards installer only uses narrow rules, so this doesn't affect a stock install — but if you've added your own broad rules, they'll disappear in auto mode.

### Subagent task descriptions are read by the classifier

A full Shards session is a depth-2 Task chain: Syn spawns a specialist; the specialist spawns Syn for final review. The classifier evaluates each Task spawn against the parent's transcript. Ambiguous task descriptions ("clean up the data") may trigger a prompt; specific ones ("Build a churn classifier under `studies/churn_v2/` using the customers and events tables") usually don't. Syn's spawn prompts to specialists already reference Shards conventions explicitly.

### Production target invocations always pause

`dbt run --target prod*`, `dbt build --target prod*`, `dbt seed --target prod*`, and `dbt snapshot --target prod*` are in the Shards `ask` list — they force a prompt under every mode, including auto. This is intentional. To override, remove the ask rule from your project's `.claude/settings.json` (not recommended).

### The 3-of-3 / 20-total fallback

If the classifier blocks an action 3 times in a row or 20 times total in one session, auto mode pauses and prompts resume. These thresholds aren't configurable. The signal usually means the classifier is missing context about your infrastructure — add the destination to `autoMode.environment` and re-run `claude auto-mode config` to confirm.

## Composition matrix

What you see for a representative sequence (Read → `Bash(dbt show)` → `Bash(pytest)` → `Write studies/.../results.md` → `NotebookEdit studies/.../nb.ipynb`):

| Mode | Read | `dbt show` | `pytest` | `Write` | `NotebookEdit` | Phase gates |
|------|------|------------|----------|---------|----------------|-------------|
| `default` | auto-allowed | pre-approved | pre-approved* | pre-approved* | pre-approved* | pause for confirm |
| `acceptEdits` | auto-allowed | pre-approved | pre-approved* | pre-approved* | pre-approved* | pause for confirm |
| `auto` (Max/Team/Enterprise/API) | auto-allowed | pre-approved | pre-approved* | pre-approved* | pre-approved* | pause for confirm |

\* via Shards' shipped allow rules (`tools/install.js` `BASE_ALLOW`). Without them, `pytest`/`Write`/`NotebookEdit` would prompt under `default` mode and hit the classifier round-trip under `auto`.

Phase gates pause in every mode because the gate hook is its own enforcement layer, independent of CC's permission system.

## Without auto mode

If you're on Pro, Bedrock, Vertex, or otherwise can't enable auto mode, the Shards-shipped allow rules already do most of the work. Two adjustments give you a session that's effectively indistinguishable from auto mode for routine specialist work:

### 1. Switch to `acceptEdits` mode

Press `Shift+Tab` once from default mode (the status bar shows `⏵⏵ accept edits on`). This auto-approves:

- All file edits and writes in your working directory
- Common filesystem commands (`mkdir`, `touch`, `mv`, `cp`)

Combined with the Shards installer's narrow allow rules — which already pre-approve `dbt build/run/test/seed/snapshot`, `pytest`, `jupyter nbconvert --execute <output-dirs>`, scoped `mkdir`, and `Edit(<output-dir>/**)` — the only things that still prompt are genuinely novel operations the installer doesn't anticipate. That's the same end state auto mode gives you, just via deterministic rules instead of a classifier.

To make it persistent, set in your user-level `~/.claude/settings.json`:

```json
{
  "permissions": {
    "defaultMode": "acceptEdits"
  }
}
```

### 2. Use Auto-Verify Mode for bulk validation stretches

[Auto-Verify Mode](../03-protocols/auto-verify.md) is Shards' native mechanism for bracketing read-only verification work with a marker pair (`::AUTO-VERIFY:: ... ::ENDAUTO::`). Specialists emit these around bulk validation stretches (grain checks, fan-out validation, sample inspections) so the gate hook auto-approves dozens of nearly-identical reads. Scope-bounded by tool budget and TTL; you can halt at any time with a "stop" message.

Specialists already emit these markers at the right moments — you don't need to do anything; just let the workflow run.

### 3. Add project-specific allow rules as needed

If your project uses a tool not in the default allowlist (a specific warehouse CLI, an internal build script, etc.), add narrow entries to `.claude/settings.json` `permissions.allow`. The `/permissions` slash command in Claude Code lists what's been pre-approved and lets you add rules interactively.

### The friction comparison

| Operation | Default mode | `acceptEdits` + Shards rules | Auto mode + Shards rules |
|-----------|--------------|------------------------------|---------------------------|
| `Read studies/proj/notebook.ipynb` | none | none | none |
| `Bash(dbt show -m model_x)` | none (pre-approved) | none | none |
| `Bash(pytest tests/)` | **prompt** | none (pre-approved) | none |
| `Bash(dbt build -m model_x)` | **prompt** | none (pre-approved) | none |
| `Write studies/proj/results.md` | **prompt** | none | none |
| `NotebookEdit studies/proj/nb.ipynb` | **prompt** | none | none |
| `Bash(unknown novel command)` | **prompt** | **prompt** | classifier evaluates |
| Phase gate | **pause for confirm** | **pause for confirm** | **pause for confirm** |

The only meaningful difference between rows 2 and 3: auto mode classifier-evaluates the genuinely novel cases (and usually approves working-directory-bound operations), while `acceptEdits` prompts. For most Shards sessions where specialists stick to the predictable command patterns the installer covers, this difference is rarely felt.

## See also

- [Auto-Verify Mode](../03-protocols/auto-verify.md) — Shards' scope-bounded auto-approval for read-only verification
- [The Gate Pattern](../03-protocols/gate-pattern.md) — Shards' phase boundary enforcement
- [Configure auto mode (Claude Code docs)](https://code.claude.com/docs/en/auto-mode-config)
- [Permission modes (Claude Code docs)](https://code.claude.com/docs/en/permission-modes)
- [Configure permissions (Claude Code docs)](https://code.claude.com/docs/en/permissions)
