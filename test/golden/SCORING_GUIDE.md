# Golden Session Scoring Guide

Reference sessions for measuring the Shards agent suite (plan task E0.4, and the
E11.7 / E11.8 targets). Each session spec in `sessions/*.json` scripts the user side
of a conversation. A run is scored on what the agents did, not on prose quality.

## Rubric (100 points, pass at 90)

| Category | Weight | How it is computed |
|---|---|---|
| Artifacts produced | 30 | Fraction of **required** `expected_artifacts` whose glob matches at least one file in the output directory. Optional artifacts are listed but not scored. |
| Gates hit | 30 | Mean over `expected_gates` of `min(count, min) / min`, where count is the number of `::GATE::` fences with a matching id (glob `*` allowed) and the expected `kind`. |
| Correct routing | 20 | Fraction of `expected_routing` agents found as an **ordered subsequence** of observed agents. Extra consultations (e.g. researcher) do not hurt. |
| No forbidden behaviour | 20 | `1 - (distinct violated rules / number of rules)`. |

Weights are per spec (`weights`) and must sum to 100. Pass threshold is 90% (`--threshold`
overrides). `next_build_targets` (e.g. `max_human_approvals_total`, per-gate
`max_human_approvals`) are reported as informational targets for the Next build
(E11.7, E11.8); they only affect pass/fail with `--enforce-targets`. The legacy build is
not expected to meet them.

### Forbidden rule types

- `gate_self_approval`: an advancing gate (`phase`, `final`, `execute`, `handoff`) is emitted while a different advancing gate has had no human turn since it was emitted.
- `gate_reask`: a gate id is emitted more than `1 + allowed_reemits[id]` times. This catches re-asking confirmed gates, notably after a compaction. The one "yes but change X" revision per spec is allowed through `allowed_reemits`.
- `forbidden_agents`: the observed routing contains a listed agent.
- `forbidden_text`: assistant text matches a regex.

## Transcript format

JSONL from `claude -p --output-format stream-json --verbose`, one JSON event per line:

- `{"type":"assistant","message":{"content":[...]}}`: `text` blocks are scanned for
  `::GATE:: id=<id> phase=<n> kind=<kind>` ... `::ENDGATE::` fences (both fences are required, matching the gate hook).
  `tool_use` blocks are scanned for `Task`/`Agent` with `input.subagent_type` (routing)
  and `Read` of `.claude/agents/<name>.md` or `.claude/commands/<name>.md` (persona transfer; `_` normalised to `-`).
- `{"type":"user","message":{"content":"..."}}` with string or `text` content is a **human turn**.
  Events whose content is only `tool_result` blocks are ignored. A human turn starting with `/<cmd>` or containing
  `<command-name>/cmd</command-name>` contributes routing (`/shards`, `/review-pr`, `/brainstorm`, `/knowledge` map to `syn`; `/compact`, `/end`, `/resume` are ignored).
- `{"type":"system","subtype":"compact_boundary"}` and human `/compact` turns count as compactions.
- Unparseable lines are skipped.

Because stream-json output does not echo the prompt, `run-legacy.sh` appends each human turn to the transcript itself.

## Output directory layout

The directory passed as `--outdir` is the project root the session ran in (the `cwd` of `claude`):

```
<outdir>/
  analysis/<project>/       data-analyst        (spec field output_dir_glob: analysis/*)
  studies/<project>/        data-scientist
  data_models/<project>/    data-modeller, analytics-engineer
  dashboards/<project>/     bi-engineer
  projects/<project>/       Syn PM mode (project-plan.md, workstreams.json)
  .shards/gates/            gate state (optional evidence)
```

`expected_artifacts[].path` is relative to `output_dir_glob`, with `*`, `**` and `?` globs. An artifact may set
`"root": "."` to be resolved from the outdir root instead (used for sibling output directories in PM sessions).
`output_dir_glob: "."` means the outdir root.

## Spec fields

`id`, `title`, `description`, `agent_entry` (slash command prefixed to turn 1), `output_dir_glob`,
`forced_compactions`, `user_turns[] {text, kind}` (`request|confirm|revise|answer|compact|resume`),
`expected_routing[]`, `expected_artifacts[] {path, required, root?}`,
`expected_gates[] {id, kind, min, allowed_reemits?, max_human_approvals?}`, `forbidden[]`, `weights`, `next_build_targets`.

## Running

```
node test/golden/score.js --session <id|path> --transcript <jsonl> --outdir <dir> [--json] [--threshold 90] [--enforce-targets]
bash test/golden/run-legacy.sh --session <id> --runs 3 --project <installed project>   # dry-run unless SHARDS_GOLDEN_LIVE=1
```

Exit codes: 0 pass, 1 below threshold, 2 usage or input error.
