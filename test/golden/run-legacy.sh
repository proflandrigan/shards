#!/usr/bin/env bash
# run-legacy.sh - replay a golden session against the legacy Shards build, then score it.
#
# !!! COST WARNING !!!
# A live run drives `claude -p` through every scripted user turn and spends real
# API budget (the Data Science session has 17 turns plus sub-agent calls). Only
# run live after E0.7 has provided a test account and API budget. Without
# SHARDS_GOLDEN_LIVE=1 this script prints the plan and exits 0 (dry-run).
#
# Usage:
#   bash test/golden/run-legacy.sh --session <id> [--runs N] [--project <dir>] [--out <dir>] [--threshold 90]
#
#   --session   session id from test/golden/sessions/ (required)
#   --runs      number of independent runs (default 1; the E0.4 criterion is 3)
#   --project   template project with Shards installed (`node tools/install.js`);
#               copied fresh for every run so runs do not contaminate each other.
#               Required for live runs.
#   --out       where transcripts and project copies go
#               (default test/golden/runs/<session>)
#   --threshold pass threshold passed to score.js (default 90)
#
# Live run:
#   SHARDS_GOLDEN_LIVE=1 bash test/golden/run-legacy.sh --session 04-data-science-deep-study \
#       --runs 3 --project /path/to/shards-installed-project
#
# Mechanics: turn 1 runs
#   claude -p "<turn>" --output-format stream-json --verbose --permission-mode acceptEdits
# and later turns run the same with `--resume <session_id>` (session_id is read
# from the first run's stream-json `system` init event). No dangerous flags are used:
# tools outside acceptEdits that need approval will be denied in headless mode,
# which the scorer will show as missing artifacts. Note that `/compact` turns rely
# on the installed claude version accepting slash commands in -p mode.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION=""; RUNS=1; PROJECT=""; OUT=""; THRESHOLD=90

while [ $# -gt 0 ]; do
  case "$1" in
    --session) SESSION="$2"; shift 2;;
    --runs) RUNS="$2"; shift 2;;
    --project) PROJECT="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --threshold) THRESHOLD="$2"; shift 2;;
    -h|--help) sed -n '2,32p' "$0"; exit 0;;
    *) echo "unknown argument: $1" >&2; exit 2;;
  esac
done

[ -n "$SESSION" ] || { echo "--session is required" >&2; exit 2; }
SPEC="$HERE/sessions/$SESSION.json"
[ -f "$SPEC" ] || { echo "no such session spec: $SPEC" >&2; exit 2; }
[ -n "$OUT" ] || OUT="$HERE/runs/$SESSION"

# Print the user turns, one per line (tab separated: index, kind, text).
turns() {
  node -e '
    const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const first = s.agent_entry;
    s.user_turns.forEach((t, i) => {
      const text = i === 0 ? first + " " + t.text : t.text;
      console.log([i + 1, t.kind, text.replace(/[\t\n]/g, " ")].join("\t"));
    });' "$SPEC"
}

if [ "${SHARDS_GOLDEN_LIVE:-}" != "1" ]; then
  echo "DRY RUN (set SHARDS_GOLDEN_LIVE=1 to run live; this spends API budget, needs E0.7)"
  echo "session:   $SESSION"
  echo "runs:      $RUNS"
  echo "project:   ${PROJECT:-<none, required for live>}"
  echo "output:    $OUT/run-<n>/{transcript.jsonl,project/}"
  echo "threshold: $THRESHOLD"
  echo "plan per run:"
  turns | while IFS=$'\t' read -r i kind text; do
    if [ "$i" = 1 ]; then
      echo "  $i. claude -p \"$text\" --output-format stream-json --verbose --permission-mode acceptEdits"
    else
      echo "  $i. claude -p \"$text\" --resume <session_id> --output-format stream-json --verbose --permission-mode acceptEdits   [$kind]"
    fi
  done
  echo "  then: node test/golden/score.js --session $SESSION --transcript <run>/transcript.jsonl --outdir <run>/project --threshold $THRESHOLD"
  exit 0
fi

command -v claude >/dev/null || { echo "claude CLI not found" >&2; exit 2; }
[ -n "$PROJECT" ] && [ -d "$PROJECT" ] || { echo "--project <dir> is required for live runs" >&2; exit 2; }

fail=0
for n in $(seq 1 "$RUNS"); do
  RUN="$OUT/run-$n"
  rm -rf "$RUN"; mkdir -p "$RUN"
  cp -r "$PROJECT" "$RUN/project"
  TRANSCRIPT="$RUN/transcript.jsonl"; : > "$TRANSCRIPT"
  SID=""
  echo "== run $n/$RUNS: $SESSION =="
  while IFS=$'\t' read -r i kind text; do
    args=(-p "$text" --output-format stream-json --verbose --permission-mode acceptEdits)
    [ -n "$SID" ] && args+=(--resume "$SID")
    # Echo the human turn into the transcript so the scorer sees user messages
    # (stream-json output does not repeat the prompt).
    node -e 'console.log(JSON.stringify({type:"user",message:{role:"user",content:process.argv[1]}}))' "$text" >> "$TRANSCRIPT"
    ( cd "$RUN/project" && claude "${args[@]}" ) >> "$TRANSCRIPT" || echo "turn $i exited non-zero" >&2
    if [ -z "$SID" ]; then
      SID="$(node -e 'for (const l of require("fs").readFileSync(process.argv[1],"utf8").split("\n")) { try { const e = JSON.parse(l); if (e.session_id) { console.log(e.session_id); break; } } catch {} }' "$TRANSCRIPT")"
      [ -n "$SID" ] || { echo "could not read session_id from first turn" >&2; fail=1; break; }
    fi
  done < <(turns)
  node "$HERE/score.js" --session "$SESSION" --transcript "$TRANSCRIPT" --outdir "$RUN/project" --threshold "$THRESHOLD" || fail=1
done
exit $fail
