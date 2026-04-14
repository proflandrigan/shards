#!/usr/bin/env bash
# Downloads vendor assets for Electron offline use.
# Run from the electron/ directory: bash download-vendor.sh

set -euo pipefail

VENDOR="$(dirname "$0")/vendor"
mkdir -p "$VENDOR"

echo "Downloading vendor assets into $VENDOR ..."

# ─── Tabulator ────────────────────────────────────────────────────────────────
mkdir -p "$VENDOR/tabulator-tables"
curl -sL "https://unpkg.com/tabulator-tables@6.3.1/dist/css/tabulator_midnight.min.css" \
  -o "$VENDOR/tabulator-tables/tabulator_midnight.min.css"
curl -sL "https://unpkg.com/tabulator-tables@6.3.1/dist/js/tabulator.min.js" \
  -o "$VENDOR/tabulator-tables/tabulator.min.js"
echo "  tabulator-tables OK"

# ─── Plotly ───────────────────────────────────────────────────────────────────
mkdir -p "$VENDOR/plotly"
curl -sL "https://cdn.plot.ly/plotly-2.35.2.min.js" \
  -o "$VENDOR/plotly/plotly.min.js"
echo "  plotly OK"

# ─── Mermaid ──────────────────────────────────────────────────────────────────
mkdir -p "$VENDOR/mermaid"
curl -sL "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js" \
  -o "$VENDOR/mermaid/mermaid.min.js"
echo "  mermaid OK"

# ─── xterm.js ─────────────────────────────────────────────────────────────────
mkdir -p "$VENDOR/xterm"
curl -sL "https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" \
  -o "$VENDOR/xterm/xterm.css"
curl -sL "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js" \
  -o "$VENDOR/xterm/xterm.js"
curl -sL "https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js" \
  -o "$VENDOR/xterm/xterm-addon-fit.js"
echo "  xterm OK"

# ─── Inter font ──────────────────────────────────────────────────────────────
mkdir -p "$VENDOR/inter-font"
curl -sL "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2" \
  -o "$VENDOR/inter-font/inter-400.woff2"
curl -sL "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hiA.woff2" \
  -o "$VENDOR/inter-font/inter-500.woff2"
curl -sL "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hiA.woff2" \
  -o "$VENDOR/inter-font/inter-600.woff2"
curl -sL "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiA.woff2" \
  -o "$VENDOR/inter-font/inter-700.woff2"

cat > "$VENDOR/inter-font/inter.css" <<'FONTCSS'
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('inter-400.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('inter-500.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('inter-600.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('inter-700.woff2') format('woff2');
}
FONTCSS
echo "  inter-font OK"

echo "Done. All vendor assets downloaded."
