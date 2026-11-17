#!/usr/bin/env bash
# Release dry run for @proflandrigan/shards and @proflandrigan/shards-mcp (2.0.0-next.x). Local only: never publishes.
# Usage: bash scripts/release-dry-run.sh   (KEEP=1 keeps the scratch dir)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/shards-release-XXXXXX")"
FAILS=0
cleanup() { if [ "${KEEP:-0}" = 1 ]; then echo "scratch kept: $SCRATCH"; else rm -rf "$SCRATCH"; fi; }
trap cleanup EXIT

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }
step() { local name="$1"; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }

# ---- Explicit expected tarball contents: scripts/pack-check.js owns the allow-list, required paths and bin require closure ----
# check_listing <tar> <kind cli|mcp> <source dir for the require closure>
check_listing() { node "$REPO/scripts/pack-check.js" --tarball "$1" --kind "$2" --dir "$3"; }

# check_bins <extracted package dir>
check_bins() {
  node -e '
    const fs=require("fs"),path=require("path");const d=process.argv[1];
    const p=JSON.parse(fs.readFileSync(path.join(d,"package.json"),"utf8"));let bad=0;
    for(const [n,t] of Object.entries(p.bin||{})){const f=path.join(d,t);
      if(!fs.existsSync(f)){console.log("  bin "+n+" -> "+t+" missing");bad=1;}
      else if(!(fs.statSync(f).mode&0o111)){console.log("  bin "+n+" -> "+t+" not executable");bad=1;}}
    if(!p.publishConfig||p.publishConfig.tag!=="next"){console.log("  publishConfig.tag != next");bad=1;}
    if(!/^2\.0\.0-next\.\d+$/.test(p.version)){console.log("  unexpected version "+p.version);bad=1;}
    process.exit(bad);' "$1"
}

echo "== scratch: $SCRATCH"
mkdir -p "$SCRATCH/packs" "$SCRATCH/stage"

# ---- 1. Pack ----
step "pack @proflandrigan/shards" bash -c "cd '$REPO' && npm pack --silent --pack-destination '$SCRATCH/packs' >/dev/null"
STAGED="$(node "$REPO/scripts/stage-runtime-package.js" --out "$SCRATCH/stage/shards-mcp")"
step "pack @proflandrigan/shards-mcp (staged)" bash -c "cd '$STAGED' && npm pack --silent --pack-destination '$SCRATCH/packs' >/dev/null"
CLI_TGZ="$(ls "$SCRATCH"/packs/proflandrigan-shards-[0-9]*.tgz 2>/dev/null | head -1 || true)"
MCP_TGZ="$(ls "$SCRATCH"/packs/proflandrigan-shards-mcp-*.tgz 2>/dev/null | head -1 || true)"
[ -n "$CLI_TGZ" ] && [ -n "$MCP_TGZ" ] || { echo "FAIL  tarballs not produced"; exit 1; }

# ---- 2. Contents ----
step "root tarball: allow-list, required paths, bin require closure" check_listing "$CLI_TGZ" cli "$REPO"
step "mcp tarball: allow-list, required paths, bin require closure" check_listing "$MCP_TGZ" mcp "$STAGED"
mkdir -p "$SCRATCH/x/cli" "$SCRATCH/x/mcp"
tar -xzf "$CLI_TGZ" -C "$SCRATCH/x/cli"; tar -xzf "$MCP_TGZ" -C "$SCRATCH/x/mcp"
step "root bins exist+executable, publishConfig.tag=next, version" check_bins "$SCRATCH/x/cli/package"
step "mcp bins exist+executable, publishConfig.tag=next, version" check_bins "$SCRATCH/x/mcp/package"

# ---- 3. Install into a fresh project ----
PROJ="$SCRATCH/proj"; mkdir -p "$PROJ"; cd "$PROJ"
npm init -y >/dev/null
INSTALL_MODE=network
if ! npm install --no-audit --no-fund --loglevel=error "$CLI_TGZ" "$MCP_TGZ" >"$SCRATCH/install.log" 2>&1; then
  INSTALL_MODE=offline
  if ! npm install --offline --no-audit --no-fund --loglevel=error "$CLI_TGZ" "$MCP_TGZ" >>"$SCRATCH/install.log" 2>&1; then
    INSTALL_MODE=symlink
    echo "NOTE  registry/cache install failed; falling back to extracted tarballs + symlinked repo node_modules (deps NOT verified from the registry)"
    rm -rf node_modules; mkdir -p node_modules/@proflandrigan node_modules/.bin
    for d in "$REPO"/node_modules/*; do
      n="$(basename "$d")"; [ "$n" = "@proflandrigan" ] && continue; ln -s "$d" "node_modules/$n"
    done
    cp -r "$SCRATCH/x/cli/package" node_modules/@proflandrigan/shards
    cp -r "$SCRATCH/x/mcp/package" node_modules/@proflandrigan/shards-mcp
    for b in shards:@proflandrigan/shards/cli/shards.js shards-ui:@proflandrigan/shards/tools/shards-ui.js shards-gates:@proflandrigan/shards/tools/shards-gates.js shards-sessions:@proflandrigan/shards/tools/shards-sessions.js shards-mcp:@proflandrigan/shards-mcp/runtime/server.js; do
      ln -s "../${b#*:}" "node_modules/.bin/${b%%:*}"
    done
  fi
fi
echo "NOTE  install mode: $INSTALL_MODE"
pass "install both tarballs into fresh project"

BIN="$PROJ/node_modules/.bin"

# ---- 4. CLI help ----
HELP="$("$BIN/shards" --help 2>&1 || true)"
echo "$HELP" | sed 's/^/    | /'
cmds_ok() {
  local listed c
  listed="$(awk '/^Commands:/{f=1;next} f&&/^  [a-z]/{print $1} f&&/^$/{exit}' <<<"$HELP" | sort | tr '\n' ' ')"
  echo "  commands listed: $listed"
  for c in build uninstall-dev gates doctor sessions migrate install sync connect; do grep -qw "$c" <<<"$listed" || { echo "  missing command: $c"; return 1; }; done
  [ "$listed" = "build connect doctor gates install migrate sessions sync uninstall-dev " ] || { echo "  unexpected command set"; return 1; }
}
step "shards --help lists exactly build, connect, doctor, gates, install, migrate, sessions, sync, uninstall-dev" cmds_ok

# ---- 5. doctor in a clean non-git dir ----
DOC="$SCRATCH/clean"; mkdir -p "$DOC"
doctor_ok() {
  local out rc=0
  out="$(cd "$DOC" && "$BIN/shards" doctor 2>&1)" || rc=$?
  echo "$out" | sed 's/^/    | /'
  echo "  exit code: $rc"
  grep -Eqi '(pass|ok|warn|fail|skip|info)' <<<"$out" || { echo "  no check lines printed"; return 1; }
  [ "$rc" -le 1 ] || return 1
  # An empty non-git directory must not FAIL
  [ "$rc" = 0 ] || { echo "  doctor returned nonzero in a clean dir"; return 1; }
}
step "shards doctor runs and prints check lines (clean dir)" doctor_ok

# ---- 6. build --dev from the installed package ----
BUILD_OUT="$SCRATCH/build-out"
build_ok() {
  (cd "$PROJ" && "$BIN/shards" build --target claude --dev --out "$BUILD_OUT" >"$SCRATCH/build.log" 2>&1) || { tail -20 "$SCRATCH/build.log"; return 1; }
  [ -f "$BUILD_OUT/.shards-dev" ] && [ -f "$BUILD_OUT/.mcp.json" ] && [ -f "$BUILD_OUT/hooks/hooks.json" ] || { echo "  missing build outputs"; return 1; }
  # dev-mode MCP + hook paths must point at files that exist inside the installed package
  node -e '
    const fs=require("fs");const o=process.argv[1];let bad=0;
    const m=JSON.parse(fs.readFileSync(o+"/.mcp.json","utf8")).mcpServers.shards.args[0];
    if(!fs.existsSync(m)){console.log("  mcp server missing: "+m);bad=1;}
    if(!m.includes("node_modules")){console.log("  mcp path not from installed package: "+m);bad=1;}
    const h=fs.readFileSync(o+"/hooks/hooks.json","utf8");
    for(const f of h.match(/\/[^" ]+\.js/g)||[]){if(!fs.existsSync(f)){console.log("  hook missing: "+f);bad=1;}}
    process.exit(bad);' "$BUILD_OUT"
}
step "shards build --target claude --dev from installed package" build_ok

# ---- 7. deprecated v1 bins (E10.5): each prints its v2 replacement ----
legacy_ok() {
  local out
  out="$(cd "$DOC" && timeout 20 "$BIN/shards-gates" status 2>&1)" || true
  grep -q 'shards gates status' <<<"$out" || { echo "  shards-gates did not print v2 replacement"; return 1; }
  out="$(cd "$DOC" && timeout 20 "$BIN/shards-sessions" list 2>&1)" || true
  grep -q 'shards sessions list' <<<"$out" || { echo "  shards-sessions did not print v2 replacement"; return 1; }
  out="$(cd "$DOC" && timeout 20 "$BIN/shards-ui" status 2>&1)" || true
  grep -q 'shards-studio' <<<"$out" || { echo "  shards-ui did not print Studio replacement"; return 1; }
  out="$(cd "$DOC" && timeout 20 node "$PROJ/node_modules/@proflandrigan/shards/tools/install.js" 2>&1)" && { echo "  v1 installer should exit non-zero"; return 1; }
  grep -q 'shards build --target claude --dev' <<<"$out" || { echo "  v1 installer did not print v2 replacement"; return 1; }
  [ -z "$(ls -A "$DOC")" ] || { echo "  v1 installer wrote files"; return 1; }
}
step "deprecated v1 bins (shards-ui/gates/sessions/install) print v2 replacements" legacy_ok

# ---- 7b. release plugin + marketplace pass `claude plugin validate --strict` (skipped when the claude CLI is absent) ----
validate_ok() {
  local mk="$SCRATCH/mkt"
  (cd "$PROJ" && "$BIN/shards" build --target claude --marketplace --no-bundle-deps --out "$mk" >"$SCRATCH/mkt.log" 2>&1) || { tail -20 "$SCRATCH/mkt.log"; return 1; }
  claude plugin validate --strict --profile directory "$mk/plugins/shards" && claude plugin validate --strict "$mk"
}
if command -v claude >/dev/null 2>&1; then
  step "claude plugin validate --strict (plugin + marketplace)" validate_ok
else
  echo "SKIP  claude plugin validate (claude CLI not on PATH)"
fi

# ---- 8. shards-mcp smoke ----
step "shards-mcp initialize + tools/list (activate, gate_request)" \
  node "$REPO/scripts/mcp-smoke-client.js" "$BIN/shards-mcp" "$PROJ" --sdk-from "$PROJ"

echo
if [ "$FAILS" -gt 0 ]; then echo "RESULT: FAIL ($FAILS step(s) failed)"; exit 1; fi
echo "RESULT: PASS (install mode: $INSTALL_MODE)"
