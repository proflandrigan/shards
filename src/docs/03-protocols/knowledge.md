# Knowledge

Shards owns no knowledge storage (ADR 0003). Reference material lives where your team already keeps it: the repo, a wiki, a ticket tracker. Git is the source of truth (ADR 0005). Agents reach reference material through the `knowledge` job in `shards.config.yaml`, which points at a binding.

## The sources protocol

Every specialist follows `core/protocols/sources.md` in build mode and Autonomous Research setup:

1. **Before Phase 1**, search the knowledge source with 3 to 5 keywords from Phase 0 (for AR, also the metric, dataset and approach family). Treat results as hints to verify, not facts. Anything older than about six months may be stale.
2. **Cite** what was used in a `### Sources` block in the Phase 0 section of `project-specs.md`.
3. **Re-check mid-phase** before building anything that depends on specific tables, joins or grain. If a source contradicts what you observe, say so plainly and note it in the specs.
4. **Propose write-backs at close**: reusable data quirks, patterns and corrections, each with a title, keywords, confidence and specific lines. Nothing is written until a gate or explicit user confirmation. Write summaries only, never raw data or secrets.

The join-path and validation protocols also point here for pre-checks and write-back candidates.

## The job and the binding

`jobs.knowledge` names the binding. The default is `git`: search runs `grep` over the configured paths (default `docs/`) plus `git log`, and a write adds a markdown file under `docs/` that is committed at the next confirmed gate. Point the job at another tool by editing `jobs.knowledge`, and make sure `bindings/<name>.md` lists `knowledge` in its jobs. Only the git binding exists today. Other integrations are not built yet (see [Integrations Status](../08-bindings/integrations-status.md)).

## Legacy ledgers

The built-in Knowledge Ledger of earlier versions is gone, along with Syn's knowledge mode and the `/knowledge` command. To carry old entries forward:

```bash
shards migrate --export-ledger [--root dir] [--out dir] [--dry-run] [--force]
```

It converts every entry under `.shards/knowledge/` into a markdown file under `docs/knowledge/`, keeping source path, category and dates in front matter. It is idempotent and does not commit, so review the output and commit it yourself. The default git binding then finds the entries through search. A full `shards migrate` runs this export as its first step (see [Migrate](../05-commands/migrate.md)).

## See also

- [Config](../08-bindings/config.md)
- [Bindings overview](../08-bindings/overview.md)
- Source: `core/protocols/sources.md`, `docs/knowledge.md`
