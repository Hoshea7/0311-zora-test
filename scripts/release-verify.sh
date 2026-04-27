#!/usr/bin/env bash
# ZoraAgent 发版验证脚本
# 用法: bun run test:release

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0
RESULTS=()

run_gate() {
  local name="$1"
  local cmd="$2"
  echo ""
  echo -e "${CYAN}━━━ ${BOLD}${name}${NC} ${CYAN}━━━${NC}"
  if eval "$cmd"; then
    echo -e "  ${GREEN}✅ PASSED${NC}"
    RESULTS+=("✅ ${name}")
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ FAILED${NC}"
    RESULTS+=("❌ ${name}")
    FAIL=$((FAIL + 1))
  fi
}

run_gate_optional() {
  local name="$1"
  local cmd="$2"
  echo ""
  echo -e "${CYAN}━━━ ${BOLD}${name}${NC} (optional) ${CYAN}━━━${NC}"
  if eval "$cmd"; then
    echo -e "  ${GREEN}✅ PASSED${NC}"
    RESULTS+=("✅ ${name}")
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}⚠️  SKIPPED / NON-BLOCKING${NC}"
    RESULTS+=("⚠️  ${name}")
    SKIP=$((SKIP + 1))
  fi
}

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     ZoraAgent Code Release Gates          ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo -e "  $(date '+%Y-%m-%d %H:%M:%S') | Bun $(bun --version 2>/dev/null || echo N/A)"
echo ""

run_gate "TypeScript 类型检查" "bun run typecheck"
run_gate "L1+L2 单元 & 集成测试" "bun run test"
run_gate "项目构建" "bun run build"
run_gate_optional "真实 SDK 诊断测试" "bun run test:live"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║          Release Gate Report              ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""
for result in "${RESULTS[@]}"; do
  echo -e "  ${result}"
done
echo ""
echo -e "  ${GREEN}Passed: ${PASS}${NC}  ${RED}Failed: ${FAIL}${NC}  ${YELLOW}Skipped: ${SKIP}${NC}"

if [ -f "tests/.artifacts/live/reports/test-report.md" ]; then
  echo ""
  echo -e "  ${CYAN}📋 SDK 诊断报告: tests/.artifacts/live/reports/test-report.md${NC}"
fi

LATEST_GUI_REPORT=$(find tests/.artifacts/gui/runs -name report.md -type f 2>/dev/null | sort | tail -n 1 || true)
if [ -n "$LATEST_GUI_REPORT" ]; then
  echo ""
  echo -e "  ${CYAN}📋 最近一次 GUI 巡检报告: ${LATEST_GUI_REPORT}${NC}"
else
  echo ""
  echo -e "  ${YELLOW}⚠ 还没有 GUI Product Review 报告${NC}"
  echo -e "  ${YELLOW}  发版前请对 Codex 说：开始发版前 L3 产品巡检${NC}"
fi

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}${BOLD}🚫 门禁未通过${NC}"
  exit 1
else
  echo -e "  ${GREEN}${BOLD}✅ 自动化门禁通过${NC}"
  echo -e "  ${YELLOW}   注意：L3 GUI Product Review 需要 Codex + Computer Use 单独执行${NC}"
  exit 0
fi
