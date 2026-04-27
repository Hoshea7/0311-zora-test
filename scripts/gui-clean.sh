#!/usr/bin/env bash
# Remove sensitive GUI test runtime homes while keeping reports/screenshots.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUI_ARTIFACT_DIR="$ROOT_DIR/tests/.artifacts/gui"

if [ ! -d "$GUI_ARTIFACT_DIR" ]; then
  echo "No GUI artifacts found."
  exit 0
fi

echo "Cleaning GUI test runtime homes under:"
echo "  $GUI_ARTIFACT_DIR"
echo ""

REMOVED=0

while IFS= read -r -d '' home_dir; do
  echo "Removing $home_dir"
  rm -rf "$home_dir"
  REMOVED=$((REMOVED + 1))
done < <(find "$GUI_ARTIFACT_DIR" -type d -name home -print0)

echo ""
echo "Removed $REMOVED GUI test home director$( [ "$REMOVED" = "1" ] && echo "y" || echo "ies" )."
echo "Reports, screenshots, and logs were kept."
