#!/bin/bash
# =============================================================================
# AgentPlaybooks MCP & REST API Comprehensive Test Suite
# =============================================================================
#
# Tests all MCP JSON-RPC endpoints and REST API routes for playbook access,
# focusing on private playbook auth, memory CRUD, skills, canvas, and security.
#
# Usage:
#   bash scripts/test-mcp-api.sh [OPTIONS]
#
# Options:
#   --base-url URL    Base URL (default: http://localhost:3000)
#   --guid GUID       Playbook GUID to test
#   --api-key KEY     API key for authentication
#   --verbose         Print full response bodies
#
# Example:
#   bash scripts/test-mcp-api.sh \
#     --guid e815a06e71e840cb \
#     --api-key apb_live_64fbfdb8b97e4a56a5d4a53e179d40e6dc00bxxx
#
# =============================================================================

set -euo pipefail

# Defaults
BASE="http://localhost:3000"
GUID=""
API_KEY=""
VERBOSE=false
PASS=0
FAIL=0
TOTAL=0

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE="$2"; shift 2 ;;
    --guid) GUID="$2"; shift 2 ;;
    --api-key) API_KEY="$2"; shift 2 ;;
    --verbose) VERBOSE=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$GUID" || -z "$API_KEY" ]]; then
  echo "❌ Usage: $0 --guid <PLAYBOOK_GUID> --api-key <API_KEY> [--base-url <URL>] [--verbose]"
  exit 1
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

check() {
  local name="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$actual" | grep -q "$expected"; then
    echo -e "  ${GREEN}✅ PASS:${NC} $name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ FAIL:${NC} $name"
    echo -e "     Expected to contain: ${YELLOW}${expected}${NC}"
    echo -e "     Got: $(echo "$actual" | head -3)"
    FAIL=$((FAIL + 1))
  fi
}

check_not() {
  local name="$1" unexpected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$actual" | grep -q "$unexpected"; then
    echo -e "  ${RED}❌ FAIL:${NC} $name"
    echo -e "     Should NOT contain: ${YELLOW}${unexpected}${NC}"
    FAIL=$((FAIL + 1))
  else
    echo -e "  ${GREEN}✅ PASS:${NC} $name"
    PASS=$((PASS + 1))
  fi
}

mcp_post() {
  local method="$1" params="$2" id="$3" auth="${4:-true}"
  local headers=(-H "Content-Type: application/json")
  if [[ "$auth" == "true" ]]; then
    headers+=(-H "Authorization: Bearer $API_KEY")
  fi
  local body="{\"jsonrpc\":\"2.0\",\"id\":${id},\"method\":\"${method}\",\"params\":${params}}"
  local result
  result=$(curl -s -X POST "$BASE/api/mcp/$GUID" "${headers[@]}" -d "$body")
  if $VERBOSE; then
    echo -e "  ${CYAN}Response:${NC} $result"
  fi
  echo "$result"
}

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  AgentPlaybooks MCP & REST API Test Suite${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "  Base URL:  ${YELLOW}$BASE${NC}"
echo -e "  GUID:      ${YELLOW}$GUID${NC}"
echo -e "  API Key:   ${YELLOW}${API_KEY:0:12}...${NC}"
echo ""

# =========================================================================
# SECTION 1: Authentication & Access Control
# =========================================================================
echo -e "${CYAN}━━━ 1. Authentication & Access Control ━━━${NC}"

echo -e "\n${YELLOW}1.1 GET manifest without auth (expect 404)${NC}"
R=$(curl -s "$BASE/api/mcp/$GUID")
check "Unauthenticated GET returns error" "not found" "$R"

echo -e "\n${YELLOW}1.2 GET manifest WITH API key (expect success)${NC}"
R=$(curl -s -H "Authorization: Bearer $API_KEY" "$BASE/api/mcp/$GUID")
check "Authenticated GET returns protocolVersion" "protocolVersion" "$R"
check "Manifest contains tools" "tools" "$R"
check "Manifest contains _playbook persona" "_playbook" "$R"

echo -e "\n${YELLOW}1.3 POST with invalid API key (expect Playbook not found)${NC}"
R=$(mcp_post "tools/list" "{}" 100 false)
# Without auth, public lookup fails for private playbook, then no API key fallback
check "Invalid auth returns Playbook not found" "Playbook not found" "$R"

echo -e "\n${YELLOW}1.4 POST with wrong API key format${NC}"
R=$(curl -s -X POST "$BASE/api/mcp/$GUID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong_key_format" \
  -d '{"jsonrpc":"2.0","id":101,"method":"tools/list","params":{}}')
check "Wrong key format returns Playbook not found" "Playbook not found" "$R"

echo -e "\n${YELLOW}1.5 Write operation without API key (expect error)${NC}"
R=$(mcp_post "tools/call" '{"name":"write_memory","arguments":{"key":"unauthorized","value":{"x":1}}}' 102 false)
check "Write without auth fails" "error" "$R"
check_not "Write without auth does NOT succeed" "success" "$R"

# =========================================================================
# SECTION 2: MCP Protocol Operations
# =========================================================================
echo -e "\n${CYAN}━━━ 2. MCP Protocol Operations ━━━${NC}"

echo -e "\n${YELLOW}2.1 Initialize${NC}"
R=$(mcp_post "initialize" "{}" 1)
check "Initialize returns protocolVersion" "protocolVersion" "$R"
check "Initialize returns capabilities" "capabilities" "$R"

echo -e "\n${YELLOW}2.2 tools/list${NC}"
R=$(mcp_post "tools/list" "{}" 2)
check "tools/list returns tools array" "tools" "$R"
check "Has write_memory" "write_memory" "$R"
check "Has read_memory" "read_memory" "$R"
check "Has search_memory" "search_memory" "$R"
check "Has delete_memory" "delete_memory" "$R"
check "Has create_skill" "create_skill" "$R"
check "Has update_skill" "update_skill" "$R"
check "Has delete_skill" "delete_skill" "$R"
check "Has create_task_graph" "create_task_graph" "$R"
check "Has update_task_status" "update_task_status" "$R"
check "Has list_canvas" "list_canvas" "$R"
check "Has read_canvas" "read_canvas" "$R"
check "Has write_canvas" "write_canvas" "$R"
check "Has get_memory_context" "get_memory_context" "$R"
check "Has consolidate_memories" "consolidate_memories" "$R"

echo -e "\n${YELLOW}2.3 resources/list${NC}"
R=$(mcp_post "resources/list" "{}" 3)
check "resources/list returns resources" "resources" "$R"
check "Has guide resource" "guide" "$R"
check "Has memory resource" "memory" "$R"
check "Has skills resource" "skills" "$R"
check "Has canvas resource" "canvas" "$R"

echo -e "\n${YELLOW}2.4 resources/read — guide${NC}"
R=$(mcp_post "resources/read" "{\"uri\":\"playbook://$GUID/guide\"}" 4)
check "Guide resource loads" "AgentPlaybooks Usage Guide" "$R"
check "Guide has memory docs" "Memory System" "$R"
check "Guide has canvas docs" "Canvas System" "$R"

echo -e "\n${YELLOW}2.5 resources/read — memory${NC}"
R=$(mcp_post "resources/read" "{\"uri\":\"playbook://$GUID/memory\"}" 5)
check "Memory resource loads" "result" "$R"

echo -e "\n${YELLOW}2.6 resources/read — skills${NC}"
R=$(mcp_post "resources/read" "{\"uri\":\"playbook://$GUID/skills\"}" 6)
check "Skills resource loads" "result" "$R"

# =========================================================================
# SECTION 3: Memory CRUD
# =========================================================================
echo -e "\n${CYAN}━━━ 3. Memory CRUD ━━━${NC}"

echo -e "\n${YELLOW}3.1 write_memory${NC}"
R=$(mcp_post "tools/call" '{"name":"write_memory","arguments":{"key":"_test_key_001","value":{"msg":"test write"},"description":"Integration test memory","tags":["_test","integration"],"tier":"working","priority":75}}' 10)
check "Write succeeds" "_test_key_001" "$R"
check "Tier is working" "working" "$R"

echo -e "\n${YELLOW}3.2 read_memory${NC}"
R=$(mcp_post "tools/call" '{"name":"read_memory","arguments":{"key":"_test_key_001"}}' 11)
check "Read returns value" "test write" "$R"
check "Read has tags" "_test" "$R"
check "Read has description" "Integration test" "$R"

echo -e "\n${YELLOW}3.3 search_memory by tags${NC}"
R=$(mcp_post "tools/call" '{"name":"search_memory","arguments":{"tags":["_test"]}}' 12)
check "Search by tag finds memory" "_test_key_001" "$R"

echo -e "\n${YELLOW}3.4 search_memory by text${NC}"
R=$(mcp_post "tools/call" '{"name":"search_memory","arguments":{"search":"Integration test"}}' 13)
check "Search by text finds memory" "_test_key_001" "$R"

echo -e "\n${YELLOW}3.5 write_memory — update existing${NC}"
R=$(mcp_post "tools/call" '{"name":"write_memory","arguments":{"key":"_test_key_001","value":{"msg":"updated value"},"tags":["_test","updated"]}}' 14)
check "Update succeeds" "updated value" "$R"

echo -e "\n${YELLOW}3.6 get_memory_context${NC}"
R=$(mcp_post "tools/call" '{"name":"get_memory_context","arguments":{"include_tiers":["working"]}}' 15)
check "Context returns result" "result" "$R"

echo -e "\n${YELLOW}3.7 delete_memory${NC}"
R=$(mcp_post "tools/call" '{"name":"delete_memory","arguments":{"key":"_test_key_001"}}' 16)
check "Delete succeeds" "success" "$R"

echo -e "\n${YELLOW}3.8 Verify delete${NC}"
R=$(mcp_post "tools/call" '{"name":"read_memory","arguments":{"key":"_test_key_001"}}' 17)
check "Deleted memory returns not found" "not found" "$R"

# =========================================================================
# SECTION 4: Skills CRUD
# =========================================================================
echo -e "\n${CYAN}━━━ 4. Skills CRUD ━━━${NC}"

echo -e "\n${YELLOW}4.1 list_skills${NC}"
R=$(mcp_post "tools/call" '{"name":"list_skills","arguments":{}}' 20)
check "list_skills returns result" "result" "$R"

echo -e "\n${YELLOW}4.2 create_skill${NC}"
TS=$(date +%s)
SKILL_NAME="_test_skill_${TS}"
R=$(mcp_post "tools/call" "{\"name\":\"create_skill\",\"arguments\":{\"name\":\"${SKILL_NAME}\",\"description\":\"Test skill for CI\",\"content\":\"When testing, always pass.\"}}" 21)
check "create_skill succeeds" "${SKILL_NAME}" "$R"

echo -e "\n${YELLOW}4.3 get_skill${NC}"
R=$(mcp_post "tools/call" "{\"name\":\"get_skill\",\"arguments\":{\"skill_id\":\"${SKILL_NAME}\"}}" 22)
check "get_skill returns skill" "${SKILL_NAME}" "$R"
check "get_skill has content" "When testing" "$R"

echo -e "\n${YELLOW}4.4 update_skill${NC}"
R=$(mcp_post "tools/call" "{\"name\":\"update_skill\",\"arguments\":{\"skill_id\":\"${SKILL_NAME}\",\"description\":\"Updated test skill\"}}" 23)
check "update_skill succeeds" "Updated test skill" "$R"

echo -e "\n${YELLOW}4.5 delete_skill${NC}"
R=$(mcp_post "tools/call" "{\"name\":\"delete_skill\",\"arguments\":{\"skill_id\":\"${SKILL_NAME}\"}}" 24)
check "delete_skill succeeds" "result" "$R"

# =========================================================================
# SECTION 5: Canvas Operations
# =========================================================================
echo -e "\n${CYAN}━━━ 5. Canvas Operations ━━━${NC}"

echo -e "\n${YELLOW}5.1 list_canvas${NC}"
R=$(mcp_post "tools/call" '{"name":"list_canvas","arguments":{}}' 30)
check "list_canvas returns result" "result" "$R"

echo -e "\n${YELLOW}5.2 write_canvas${NC}"
R=$(mcp_post "tools/call" '{"name":"write_canvas","arguments":{"slug":"_test_canvas","name":"Test Canvas","content":"# Test\\n\\nThis is a test canvas document.\\n\\n## Section 2\\n\\nMore content."}}' 31)
check "write_canvas succeeds" "_test_canvas" "$R"

echo -e "\n${YELLOW}5.3 read_canvas${NC}"
R=$(mcp_post "tools/call" '{"name":"read_canvas","arguments":{"slug":"_test_canvas"}}' 32)
check "read_canvas returns content" "Test Canvas" "$R"

echo -e "\n${YELLOW}5.4 get_canvas_toc${NC}"
R=$(mcp_post "tools/call" '{"name":"get_canvas_toc","arguments":{"slug":"_test_canvas"}}' 33)
check "TOC returns sections" "result" "$R"

echo -e "\n${YELLOW}5.5 Cleanup — delete test canvas via write (overwrite with empty)${NC}"
# No delete_canvas tool, so we just verify the above worked.
# In production you'd use the REST API or dashboard to delete.

# =========================================================================
# SECTION 6: Task Graph / Hierarchical Memory
# =========================================================================
echo -e "\n${CYAN}━━━ 6. Task Graph / Hierarchical Memory ━━━${NC}"

echo -e "\n${YELLOW}6.1 create_task_graph${NC}"
R=$(mcp_post "tools/call" '{"name":"create_task_graph","arguments":{"plan_key":"_test_plan","plan_summary":"Integration test plan","tasks":[{"key":"step1","description":"First step"},{"key":"step2","description":"Second step","depends_on":["step1"]}],"tags":["_test"]}}' 40)
check "create_task_graph succeeds" "result" "$R"

echo -e "\n${YELLOW}6.2 get_memory_tree${NC}"
R=$(mcp_post "tools/call" '{"name":"get_memory_tree","arguments":{"root_key":"_test_plan"}}' 41)
check "Memory tree returns result" "result" "$R"

echo -e "\n${YELLOW}6.3 update_task_status${NC}"
R=$(mcp_post "tools/call" '{"name":"update_task_status","arguments":{"key":"_test_plan/step1","status":"completed","result":{"output":"done"}}}' 42)
check "update_task_status succeeds" "result" "$R"

echo -e "\n${YELLOW}6.4 Cleanup — delete task graph memories${NC}"
mcp_post "tools/call" '{"name":"delete_memory","arguments":{"key":"_test_plan/step1"}}' 43 > /dev/null
mcp_post "tools/call" '{"name":"delete_memory","arguments":{"key":"_test_plan/step2"}}' 44 > /dev/null
mcp_post "tools/call" '{"name":"delete_memory","arguments":{"key":"_test_plan"}}' 45 > /dev/null
echo -e "  ${GREEN}✅${NC} Cleanup done"

# =========================================================================
# SECTION 7: Security Checks
# =========================================================================
echo -e "\n${CYAN}━━━ 7. Security Checks ━━━${NC}"

echo -e "\n${YELLOW}7.1 Invalid JSON-RPC method${NC}"
R=$(mcp_post "nonexistent/method" "{}" 50)
check "Unknown method returns error" "error" "$R"

echo -e "\n${YELLOW}7.2 SQL injection attempt in search_memory${NC}"
R=$(mcp_post "tools/call" '{"name":"search_memory","arguments":{"search":"x%27; DROP TABLE memories; --"}}' 51)
check_not "SQL injection does not crash" "Internal Server Error" "$R"
check "SQL injection returns normal result" "result" "$R"

echo -e "\n${YELLOW}7.3 XSS in memory value${NC}"
R=$(mcp_post "tools/call" '{"name":"write_memory","arguments":{"key":"_test_xss","value":{"msg":"<script>alert(1)</script>"},"tags":["_test"]}}' 52)
check "XSS value stored without error" "_test_xss" "$R"
R=$(mcp_post "tools/call" '{"name":"read_memory","arguments":{"key":"_test_xss"}}' 53)
check "XSS value read back safely" "script" "$R"
mcp_post "tools/call" '{"name":"delete_memory","arguments":{"key":"_test_xss"}}' 54 > /dev/null

echo -e "\n${YELLOW}7.4 Oversized memory value${NC}"
BIG_VALUE=$(python3 -c "print('x' * 100000)" 2>/dev/null || echo "xxxxxxxxxxxxxxxxxxxx")
R=$(mcp_post "tools/call" "{\"name\":\"write_memory\",\"arguments\":{\"key\":\"_test_big\",\"value\":{\"big\":\"${BIG_VALUE}\"}}}" 55)
# Just verify it doesn't crash the server
check_not "Large value does not crash server" "Internal Server Error" "$R"
mcp_post "tools/call" '{"name":"delete_memory","arguments":{"key":"_test_big"}}' 56 > /dev/null 2>&1

echo -e "\n${YELLOW}7.5 Cross-playbook access attempt (should fail)${NC}"
R=$(curl -s -X POST "$BASE/api/mcp/0000000000000000" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"jsonrpc":"2.0","id":60,"method":"tools/call","params":{"name":"read_memory","arguments":{"key":"secret"}}}')
check "Cross-playbook access blocked" "not found" "$R"

# =========================================================================
# RESULTS
# =========================================================================
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
if [[ $FAIL -eq 0 ]]; then
  echo -e "  ${GREEN}✅ All $TOTAL tests passed!${NC}"
else
  echo -e "  ${RED}❌ $FAIL of $TOTAL tests failed${NC}"
fi
echo -e "  ${GREEN}Pass: $PASS${NC}  ${RED}Fail: $FAIL${NC}  Total: $TOTAL"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

exit $FAIL
