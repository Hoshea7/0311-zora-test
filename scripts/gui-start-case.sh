#!/usr/bin/env bash
# Start ZoraAgent for a Codex + Computer Use L3 GUI Product Review case.
#
# This script only prepares the isolated runtime and launches Electron.
# Codex performs the actual GUI review with Computer Use by following qa/gui/.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CASE_ID="${1:-L3-INIT-001}"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
RUN_ID="${TIMESTAMP}-${CASE_ID}"
RUN_DIR="$ROOT_DIR/tests/.artifacts/gui/runs/$RUN_ID"
HOME_DIR="$RUN_DIR/home"
ZORA_DIR="$HOME_DIR/.zora"
LOG_DIR="$RUN_DIR/logs"
SCREENSHOT_DIR="$RUN_DIR/screenshots"
REPORT_PATH="$RUN_DIR/report.md"
REAL_HOME="${HOME:-}"

mkdir -p "$ZORA_DIR" "$LOG_DIR" "$SCREENSHOT_DIR"

PROVIDER_SUMMARY="not seeded"
if [ "${ZORA_GUI_USE_LOCAL_PROVIDER:-}" = "1" ]; then
  LOCAL_PROVIDER_FILE="$REAL_HOME/.zora/providers.json"
  if [ -f "$LOCAL_PROVIDER_FILE" ]; then
    cp "$LOCAL_PROVIDER_FILE" "$ZORA_DIR/providers.json"
    PROVIDER_SUMMARY="$(node - "$ZORA_DIR/providers.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
try {
  const providers = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = Array.isArray(providers) ? providers : [];
  const provider = list.find((p) => p.isDefault) || list.find((p) => p.enabled) || list[0];
  if (!provider) {
    console.log("none found in copied providers.json");
  } else {
    const name = provider.name || "unnamed";
    const model = provider.modelId || provider.model || "default model";
    const type = provider.providerType || provider.type || "unknown";
    const baseUrl = provider.baseUrl || "default baseUrl";
    console.log(`${name} / ${type} / ${model} / ${baseUrl}`);
  }
} catch (error) {
  console.log(`failed to parse providers.json: ${error.message}`);
}
NODE
)"
  else
    PROVIDER_SUMMARY="local providers.json not found at $LOCAL_PROVIDER_FILE"
  fi
fi

cat > "$RUN_DIR/run.env" <<EOF
CASE_ID=$CASE_ID
RUN_ID=$RUN_ID
RUN_DIR=$RUN_DIR
HOME=$HOME_DIR
ZORA_DIR=$ZORA_DIR
REPORT_PATH=$REPORT_PATH
EOF

cat > "$REPORT_PATH" <<EOF
# $CASE_ID GUI 巡检报告

- Result: IN PROGRESS
- Run ID: $RUN_ID
- Started At: $(date '+%Y-%m-%d %H:%M:%S')
- HOME: $HOME_DIR
- Zora Dir: $ZORA_DIR
- Provider Seed: $PROVIDER_SUMMARY

EOF

echo ""
echo "ZoraAgent L3 GUI Product Review"
echo "Case:       $CASE_ID"
echo "Run ID:     $RUN_ID"
echo "HOME:       $HOME_DIR"
echo "Zora Dir:   $ZORA_DIR"
echo "Report:     $REPORT_PATH"
echo "Provider:   $PROVIDER_SUMMARY"
if [ "${ZORA_GUI_USE_LOCAL_PROVIDER:-}" = "1" ]; then
  echo ""
  echo "Security: copied the full local Provider into the isolated test home."
  echo "          It is required for real SDK calls and must be cleaned after review:"
  echo "          bun run test:gui:clean"
fi
echo ""
echo "Codex should now use Computer Use to control the Electron app."
echo "Read:"
echo "  qa/gui/README.md"
echo "  qa/gui/release-smoke.md"
echo "  qa/gui/cases/init-model-awakening.md"
echo ""

cd "$ROOT_DIR"
HOME="$HOME_DIR" \
USERPROFILE="$HOME_DIR" \
ZORA_GUI_CASE_ID="$CASE_ID" \
ZORA_GUI_RUN_ID="$RUN_ID" \
ZORA_GUI_RUN_DIR="$RUN_DIR" \
ZORA_GUI_REPORT_PATH="$REPORT_PATH" \
bun run dev
