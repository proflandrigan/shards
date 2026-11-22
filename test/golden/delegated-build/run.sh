#!/usr/bin/env bash
# E12.9 delegated-build golden harness: a small analytics-engineer-style build run through the
# plan -> tasks_set -> task_dispatch -> task_report -> task_verify loop.
#
# ONE SAMPLE, NEVER A PASS RATE. A single run is anecdotal; it says nothing about reliability.
# OPEN: "3/3 per host" (needs live-run budget; this script runs one sample per invocation).
# OPEN: Codex / other hosts (external). TODO(owner: proflandrigan)
# OPEN: context ratio vs legacy (needs a legacy run; never computed here).
#
# Usage:
#   run.sh --dry-run                    synthetic state via the REAL runtime tools, then score.js
#   run.sh --check-only DIR             score an existing project dir
#   SHARDS_GOLDEN_LIVE=1 run.sh [--mode parallel|sequential|inline] [--plugin-dir DIR]
#                                       one live `claude -p` sample (without the env var: prints plan, exits 0)
# Never uses --dangerously-skip-permissions. Output of a live run goes to a temp dir (not committed).
# Exit: 0 all measured criteria pass, 1 fail, 2 usage error.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PREFIX="mcp__plugin_shards_shards__"
TOOLS="activate active return gate_request gate_confirm gates_open shards_status load_phase tasks_set task_dispatch task_report task_verify task_status artifact_emit"

DRY=0; CHECK=""; MODE="parallel"; PLUGIN="$REPO/adapters/claude-code"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --check-only) shift; CHECK="${1:-}"; [ -n "$CHECK" ] || { echo "usage: --check-only DIR" >&2; exit 2; } ;;
    --mode) shift; MODE="${1:-}" ;;
    --plugin-dir) shift; PLUGIN="${1:-}" ;;
    -h|--help) sed -n 2,17p "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$MODE" in parallel|sequential|inline) ;; *) echo "--mode must be parallel|sequential|inline" >&2; exit 2 ;; esac

case "$MODE" in
  parallel) HOW="dispatch independent ready tasks (t1, t2) in one task_dispatch call and launch their workers in parallel (one Agent call per card, in a single message)" ;;
  sequential) HOW="dispatch one task at a time and run its worker to completion before dispatching the next" ;;
  inline) HOW="do every task yourself inline (delegate: inline is only allowed for phases with at most 2 tasks, so expect the manifest to need adjusting); do not launch workers" ;;
esac
PROMPT="You are the Shards lead running a delegated build as an Analytics Engineer in this directory. The plan is shards/dbuild/project-specs.md and the manifest is shards/dbuild/tasks.yaml. Register it with tasks_set (path), then run the delegated-build loop: task_dispatch ready tasks, hand each card to a worker, pass the worker result to task_report, then independently re-run the acceptance command yourself (Bash test) and record it with task_verify. A task is done only after task_verify passes. Execution mode: $HOW. Retry a failed task at most twice, then stop and ask the user. Do not change the plan without an amendment gate. Finish when t1..t4 are verified."

allowed() { local o="" t; for t in $TOOLS; do o="${o:+$o,}$PREFIX$t"; done; echo "$o,Read,Write,Edit,Agent,Bash(test:*),Bash(node:*)"; }
planned() { printf 'cd %q && claude -p %q --plugin-dir %q --output-format stream-json --verbose --allowedTools %q\n' "$1" "$PROMPT" "$PLUGIN" "$(allowed)"; }
setup() { cp -r "$HERE/fixture/." "$1/"; mkdir -p "$1/.delegated-build-run"; }

if [ -n "$CHECK" ]; then
  [ -d "$CHECK" ] || { echo "not a directory: $CHECK" >&2; exit 2; }
  node "$HERE/score.js" "$CHECK"; exit $?
fi

PROJ="$(mktemp -d "${TMPDIR:-/tmp}/delegated-build-XXXXXX")" || exit 2
echo "project_dir: $PROJ"
setup "$PROJ"

if [ "$DRY" = 1 ]; then
  echo "DRY RUN: claude is not invoked. Planned command (mode=$MODE):"
  planned "$PROJ"
  node "$HERE/dry-run.js" "$PROJ" || exit 1
  node "$HERE/score.js" "$PROJ"; rc=$?
  echo "(temp dir kept: $PROJ)"
  exit $rc
fi

planned "$PROJ"
if [ "${SHARDS_GOLDEN_LIVE:-}" != "1" ]; then
  echo "SHARDS_GOLDEN_LIVE is not 1: plan printed, nothing run (a live sample spends model quota)."
  exit 0
fi
command -v claude >/dev/null || { echo "claude CLI not found" >&2; exit 2; }
(cd "$PROJ" && claude -p "$PROMPT" --plugin-dir "$PLUGIN" --output-format stream-json --verbose --allowedTools "$(allowed)" > "$PROJ/.delegated-build-run/stream.jsonl" 2> "$PROJ/.delegated-build-run/stderr.log")
echo "claude exit: $?"
node "$HERE/score.js" "$PROJ"; exit $?
