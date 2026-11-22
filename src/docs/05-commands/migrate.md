# `shards migrate`

Moves a legacy v1 Shards install to the v2 layout. It is for projects where the v1 installer copied agents, commands and a UI into the project. It refuses to run in the shards source repository.

```
shards migrate [--export-ledger] [--root dir] [--out dir] [--dry-run] [--force]
```

| Option | Effect |
|---|---|
| `--export-ledger` | Run only step 1 (ledger export). |
| `--root dir` | Project root (default: current directory). |
| `--out dir` | Ledger output directory (default `<root>/docs/knowledge`). |
| `--dry-run` | Report what would change; write and delete nothing. |
| `--force` | Overwrite differing existing ledger-export files (without it, conflicts are reported and the exit code is 1), and remove manifest files that look modified after install. |

Always run `--dry-run` first. The command is idempotent and never commits.

## What a full migrate does

1. **Ledger export.** Converts the v1 Knowledge Ledger (`.shards/knowledge/`, with `entities/`, `infrastructure/`, `patterns/`, `features/` and `INDEX.md`) to plain markdown in `docs/knowledge/`. Each file gets YAML front matter (`source_path`, `category`, any date fields, and the original front matter under `original:`); the body is unchanged. Names are `<category>-<slug>.md` (suffix `-2`, `-3` on collision) and the ledger index becomes `INDEX.md`. The original ledger stays in place.
2. **Gate history import.** Reads legacy gate history (`.shards/gates/state.json`, either format, plus `gates.jsonl`) into runtime state under `.shards/state/sessions/legacy-import/` and a git note on HEAD (`refs/notes/shards-legacy-gates`). The old files are archived to `.shards/archive/legacy-gates/`, not deleted.
3. **Manifest-driven removal.** Removes only what the install manifest (`.claude/.shards-manifest.json`) recorded: legacy `.claude/agents` and `.claude/commands` files, `.shards/ui`, `templates/` and `docs/shards-guide/`. A file whose mtime is later than the manifest's `installedAt` plus a 60 second grace is kept and reported as skipped, unless git shows it is tracked, unchanged against HEAD and last changed in the commit that added the manifest (so fresh clones migrate cleanly). If every candidate is skipped, a warning suggests `--force`. Files not in the manifest are never touched. Empty directories left behind are pruned.
4. **Hook cleanup.** Removes the legacy gate and relay hook entries from `.claude/settings.json` (the exact entries recorded in the manifest; only when the manifest has none, commands matching the v1 gate-hook, relay and push script paths under `.shards/`) and the legacy gate hook files in `.shards/hooks/`.
5. **CLAUDE.md cleanup.** Removes the v1 `## Shards — Agent Suite` and `## Shards — Tool-call conventions` blocks. v2 blocks between `<!-- shards:begin … -->` / `<!-- shards:end … -->` markers are left in place.

Legacy output directories (`analysis/`, `studies/`, `models/`, and the rest) are never touched or moved; new work uses `shards/`.

## After migrating

Review the result and commit it yourself:

```bash
git add -A docs && git commit -m "chore: migrate legacy shards install"
```

Then install the v2 plugin (see [install](../01-getting-started/install.md)) and run [`shards doctor`](doctor.md). Exported ledger entries become plain repo docs that the default `git` knowledge binding finds; see [knowledge](../03-protocols/knowledge.md).

## Ledger export only

`shards migrate --export-ledger` runs step 1 and nothing else. Use it to carry knowledge forward while keeping the rest of a v1 install in place.
