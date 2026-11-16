# Knowledge

Shards owns no knowledge storage (ADR 0003). Reference material lives where your team already keeps it: the repo, a wiki, a ticket tracker. Agents reach it through the `knowledge` job, which points at a binding.

## How knowledge works now

- **The job.** `jobs.knowledge` in `shards.config.yaml` names the binding that agents search, read and write through. The default is `git`, which searches `docs/` and the git log (see [`config.md`](config.md) and [`bindings/git.md`](../bindings/git.md)).
- **The macro.** Agents write `{{knowledge.search query="..."}}` in protocol and phase files. It resolves to whichever binding the `knowledge` job points at. Results are hints to verify, not facts.
- **The protocol.** `{{protocol sources}}` (`core/protocols/sources.md`) sets the rules:
  - Check sources before Phase 1 for anything relevant to the project.
  - Cite each source used in the phase output.
  - Re-check mid-phase when a decision depends on a fact that may have changed.
  - At close, propose write-backs. Write only after a gate is confirmed or the user explicitly agrees.
  - Write summaries, never raw data or secrets.
- **The verbs.** A binding implements some or all of `knowledge.search`, `knowledge.read` and `knowledge.write`. For git: search runs `grep` over the configured paths plus `git log`; read returns a section of a file under those paths; write adds a markdown file under `docs/` that is committed at the next confirmed gate.

## Pointing the job at another tool

1. Edit `jobs.knowledge` in `shards.config.yaml`. Use the short form for a binding with no options, or the long form to pass options:

   ```yaml
   jobs:
     knowledge: { binding: confluence, options: { space: ENG } }
   bindings:
     confluence:
       space: ENG
   ```

2. Make sure the binding file exists in `bindings/<name>.md` and lists `knowledge` in its `jobs` frontmatter. The format, verb sections and `expected_tools` rules are in [`bindings/README.md`](../bindings/README.md).
3. Binding `required_settings` go under `bindings.<name>`. Git-only job defaults (such as `paths: [docs/]`) do not carry over to another binding, so pass what it needs under `options`.

Host bindings call their MCP tools directly and report outcomes back to the runtime. External writes still need a confirmed gate or explicit user confirmation.

## Removed: the Knowledge Ledger

The built-in Knowledge Ledger (`.shards/knowledge/`) is gone. The following no longer exist:

- Syn's knowledge mode and the `/knowledge` command.
- The knowledge-map panel in Studio.
- The `knowledge_retrieval`, `knowledge_checkpoint` and `knowledge_harvest` protocols.

Existing ledger entries can be carried forward with the export below.

## Exporting an existing ledger

```bash
shards migrate --export-ledger [--root dir] [--out dir] [--dry-run] [--force]
```

See `shards migrate --help` for the full flag reference.

- Converts every entry under `.shards/knowledge/**` to a markdown file in `docs/knowledge/`.
- Each file has front matter that keeps the source path, category and dates, so nothing is lost.
- Idempotent: re-running it updates the same files rather than duplicating them.
- Use `--dry-run` first to see what would be written.
- The command does not commit. Review the output, then commit it yourself:

  ```bash
  git add docs/knowledge && git commit -m "docs: export knowledge ledger"
  ```

Once committed, the exported entries are plain repo docs and the default `git` binding finds them through `knowledge.search`.

The full `shards migrate` (beyond ledger export) arrives in E10.1. Publishing exported entries to Confluence is a later skill (E4.5b, Milestone C).
