#!/usr/bin/env bash
# test-alerts.sh - Validate ClawChain alert rules fire correctly
#
# Parses alerting-rules.yml, checks pending/firing alerts, validates
# alert rule expressions, and optionally sends a test alert.
#
# Usage:
#   ./scripts/test-alerts.sh [OPTIONS]
#
# Options:
#   --prometheus-url URL     Prometheus base URL (default: http://localhost:9090)
#   --alertmanager-url URL   AlertManager base URL (default: http://localhost:9093)
#   --json                   Output results as JSON instead of a table
#   --send-test              Push a test alert to AlertManager and verify it appears
#   -h, --help               Show this help message

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
PROMETHEUS_URL="http://localhost:9090"
ALERTMANAGER_URL="http://localhost:9093"
JSON_OUTPUT=false
SEND_TEST=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALERT_RULES_FILE="${SCRIPT_DIR}/../monitoring/alerting-rules.yml"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prometheus-url)   PROMETHEUS_URL="$2";   shift 2 ;;
    --alertmanager-url) ALERTMANAGER_URL="$2"; shift 2 ;;
    --json)             JSON_OUTPUT=true;      shift ;;
    --send-test)        SEND_TEST=true;        shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
declare -a RESULTS=()  # Each entry: "category|check|status|detail"

add_result() {
  local category="$1" check="$2" status="$3" detail="$4"
  RESULTS+=("${category}|${check}|${status}|${detail}")
  case "$status" in
    PASS) ((PASS_COUNT++)) ;;
    FAIL) ((FAIL_COUNT++)) ;;
    WARN) ((WARN_COUNT++)) ;;
  esac
}

http_get() {
  local url="$1"
  local tmpfile
  tmpfile=$(mktemp)
  HTTP_CODE=$(curl -s -o "$tmpfile" -w '%{http_code}' --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "000")
  cat "$tmpfile"
  rm -f "$tmpfile"
}

http_post() {
  local url="$1"
  local data="$2"
  local tmpfile
  tmpfile=$(mktemp)
  HTTP_CODE=$(curl -s -o "$tmpfile" -w '%{http_code}' --connect-timeout 5 --max-time 10 \
    -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null || echo "000")
  cat "$tmpfile"
  rm -f "$tmpfile"
}

# ---------------------------------------------------------------------------
# 1. Parse Alert Rules from alerting-rules.yml
# ---------------------------------------------------------------------------
declare -a ALERT_NAMES=()
declare -a ALERT_EXPRS=()
declare -a ALERT_SEVERITIES=()
declare -a ALERT_GROUPS=()

parse_alert_rules() {
  if [[ ! -f "$ALERT_RULES_FILE" ]]; then
    add_result "Alert Rules" "File: alerting-rules.yml" "FAIL" "File not found at ${ALERT_RULES_FILE}"
    return 1
  fi

  add_result "Alert Rules" "File: alerting-rules.yml" "PASS" "File exists"

  # Parse with python3 + PyYAML or fallback to manual parsing
  local parse_result
  parse_result=$(python3 -c "
import yaml, sys, json

with open('${ALERT_RULES_FILE}', 'r') as f:
    data = yaml.safe_load(f)

alerts = []
for group in data.get('groups', []):
    group_name = group.get('name', 'unknown')
    for rule in group.get('rules', []):
        alert_name = rule.get('alert', '')
        if not alert_name:
            continue
        expr = rule.get('expr', '').strip()
        severity = rule.get('labels', {}).get('severity', 'unknown')
        for_duration = rule.get('for', 'unset')
        summary = rule.get('annotations', {}).get('summary', '')
        alerts.append({
            'group': group_name,
            'name': alert_name,
            'expr': expr,
            'severity': severity,
            'for': for_duration,
            'summary': summary
        })

print(json.dumps(alerts))
" 2>/dev/null) || {
    # Fallback: grep-based parsing if PyYAML is not available
    parse_result="[]"
    add_result "Alert Rules" "YAML Parser" "WARN" "PyYAML not available; using fallback parser"

    # Simple fallback: extract alert names from the file
    local names
    names=$(grep -E '^\s+- alert:' "$ALERT_RULES_FILE" | sed 's/.*alert:\s*//' | tr -d ' ')
    if [[ -n "$names" ]]; then
      local arr=()
      while IFS= read -r name; do
        arr+=("{\"group\":\"unknown\",\"name\":\"${name}\",\"expr\":\"\",\"severity\":\"unknown\",\"for\":\"unknown\",\"summary\":\"\"}")
      done <<< "$names"
      parse_result="[$(IFS=,; echo "${arr[*]}")]"
    fi
  }

  # Load into arrays
  local count
  count=$(echo "$parse_result" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

  if [[ "$count" -eq 0 ]]; then
    add_result "Alert Rules" "Parse result" "FAIL" "No alert rules found in file"
    return 1
  fi

  add_result "Alert Rules" "Parse result" "PASS" "${count} alert rules defined"

  # Populate arrays
  eval "$(echo "$parse_result" | python3 -c "
import sys, json
alerts = json.load(sys.stdin)
for i, a in enumerate(alerts):
    name = a['name'].replace('\"', '\\\\\"')
    expr = a['expr'].replace('\"', '\\\\\"').replace('\n', ' ')
    sev = a['severity']
    grp = a['group']
    print(f'ALERT_NAMES[{i}]=\"{name}\"')
    print(f'ALERT_EXPRS[{i}]=\"{expr}\"')
    print(f'ALERT_SEVERITIES[{i}]=\"{sev}\"')
    print(f'ALERT_GROUPS[{i}]=\"{grp}\"')
" 2>/dev/null)"

  return 0
}

# ---------------------------------------------------------------------------
# 2. Check Pending/Firing Alerts
# ---------------------------------------------------------------------------
check_firing_alerts() {
  local body
  body=$(http_get "${PROMETHEUS_URL}/api/v1/alerts")

  if [[ "$HTTP_CODE" != "200" ]]; then
    add_result "Firing Alerts" "Query /api/v1/alerts" "FAIL" "Could not query Prometheus alerts (HTTP ${HTTP_CODE})"
    return
  fi

  local alert_info
  alert_info=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
alerts = data.get('data', {}).get('alerts', [])
firing = [a for a in alerts if a.get('state') == 'firing']
pending = [a for a in alerts if a.get('state') == 'pending']
inactive_count = len(alerts) - len(firing) - len(pending)
print(f'{len(firing)}|{len(pending)}|{inactive_count}')
for a in firing:
    name = a.get('labels', {}).get('alertname', 'unknown')
    sev = a.get('labels', {}).get('severity', 'unknown')
    print(f'FIRING:{name}:{sev}')
for a in pending:
    name = a.get('labels', {}).get('alertname', 'unknown')
    sev = a.get('labels', {}).get('severity', 'unknown')
    print(f'PENDING:{name}:{sev}')
" 2>/dev/null || echo "0|0|0")

  local summary_line
  summary_line=$(echo "$alert_info" | head -1)
  IFS='|' read -r firing_count pending_count inactive_count <<< "$summary_line"

  add_result "Firing Alerts" "Alert states" "PASS" "Firing: ${firing_count}, Pending: ${pending_count}, Inactive: ${inactive_count}"

  # Report each firing alert
  while IFS= read -r line; do
    if [[ "$line" == FIRING:* ]]; then
      local alert_name="${line#FIRING:}"
      local name="${alert_name%%:*}"
      local sev="${alert_name##*:}"
      if [[ "$sev" == "critical" ]]; then
        add_result "Firing Alerts" "${name}" "FAIL" "FIRING (severity: ${sev})"
      else
        add_result "Firing Alerts" "${name}" "WARN" "FIRING (severity: ${sev})"
      fi
    elif [[ "$line" == PENDING:* ]]; then
      local alert_name="${line#PENDING:}"
      local name="${alert_name%%:*}"
      local sev="${alert_name##*:}"
      add_result "Firing Alerts" "${name}" "WARN" "PENDING (severity: ${sev})"
    fi
  done <<< "$alert_info"
}

# ---------------------------------------------------------------------------
# 3. Validate Alert Rule Expressions
# ---------------------------------------------------------------------------
validate_alert_expressions() {
  if [[ ${#ALERT_NAMES[@]} -eq 0 ]]; then
    add_result "Expression Validation" "Skip" "WARN" "No alert rules loaded to validate"
    return
  fi

  for i in "${!ALERT_NAMES[@]}"; do
    local name="${ALERT_NAMES[$i]}"
    local expr="${ALERT_EXPRS[$i]}"
    local severity="${ALERT_SEVERITIES[$i]}"
    local group="${ALERT_GROUPS[$i]}"

    if [[ -z "$expr" ]]; then
      add_result "Expression Validation" "${name}" "WARN" "No expression available (group: ${group})"
      continue
    fi

    # URL-encode the expression
    local encoded_expr
    encoded_expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''${expr}'''))" 2>/dev/null || echo "")

    if [[ -z "$encoded_expr" ]]; then
      add_result "Expression Validation" "${name}" "WARN" "Could not encode expression"
      continue
    fi

    local body
    body=$(http_get "${PROMETHEUS_URL}/api/v1/query?query=${encoded_expr}")

    if [[ "$HTTP_CODE" == "200" ]]; then
      local status_field result_count
      status_field=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('status', 'unknown'))
" 2>/dev/null || echo "unknown")
      result_count=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(len(data.get('data', {}).get('result', [])))
" 2>/dev/null || echo "0")

      if [[ "$status_field" == "success" ]]; then
        if [[ "$result_count" -gt 0 ]]; then
          add_result "Expression Validation" "${name}" "WARN" "Expression valid, ${result_count} result(s) - alert condition active (${severity})"
        else
          add_result "Expression Validation" "${name}" "PASS" "Expression valid, 0 results - condition not met (${severity})"
        fi
      else
        add_result "Expression Validation" "${name}" "FAIL" "Prometheus returned status: ${status_field}"
      fi
    elif [[ "$HTTP_CODE" == "422" ]]; then
      local err_msg
      err_msg=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('error', 'unknown error'))
" 2>/dev/null || echo "unknown error")
      add_result "Expression Validation" "${name}" "FAIL" "Invalid PromQL: ${err_msg}"
    else
      add_result "Expression Validation" "${name}" "FAIL" "Query failed (HTTP ${HTTP_CODE})"
    fi
  done
}

# ---------------------------------------------------------------------------
# 4. Validate AlertManager Config (receivers)
# ---------------------------------------------------------------------------
check_alertmanager_config() {
  local body
  body=$(http_get "${ALERTMANAGER_URL}/api/v2/status")

  if [[ "$HTTP_CODE" != "200" ]]; then
    add_result "AlertManager Config" "Status" "FAIL" "AlertManager unreachable (HTTP ${HTTP_CODE})"
    return
  fi

  add_result "AlertManager Config" "Status" "PASS" "AlertManager is reachable"

  # Check receivers
  local receiver_info
  receiver_info=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
config = data.get('config', {})
# config.original is a YAML string in newer AlertManager versions
original = config.get('original', '')
if original:
    # Count receiver lines
    import re
    receivers = re.findall(r'- name:\s*[\"'\''](.*?)[\"'\'']', original)
    if not receivers:
        receivers = re.findall(r'- name:\s*(\S+)', original)
    print(f'{len(receivers)}|{\",\".join(receivers)}')
else:
    # Try structured config
    route = config.get('route', {})
    receiver = route.get('receiver', 'unknown')
    print(f'1|{receiver}')
" 2>/dev/null || echo "0|none")

  IFS='|' read -r receiver_count receiver_names <<< "$receiver_info"

  if [[ "$receiver_count" -gt 0 && "$receiver_names" != "none" ]]; then
    add_result "AlertManager Config" "Receivers" "PASS" "${receiver_count} receiver(s): ${receiver_names}"
  else
    add_result "AlertManager Config" "Receivers" "WARN" "No receivers detected or could not parse config"
  fi
}

# ---------------------------------------------------------------------------
# 5. Test Notification (optional --send-test)
# ---------------------------------------------------------------------------
send_test_alert() {
  if [[ "$SEND_TEST" != "true" ]]; then
    return
  fi

  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")
  local end
  end=$(date -u -v+5M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+5 minutes" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "2099-01-01T00:00:00Z")

  local test_alert_json="[
  {
    \"status\": \"firing\",
    \"labels\": {
      \"alertname\": \"ClawChainTestAlert\",
      \"severity\": \"info\",
      \"chain_id\": \"clawchain-1\",
      \"source\": \"test-alerts.sh\"
    },
    \"annotations\": {
      \"summary\": \"Test alert from validate-monitoring script\",
      \"description\": \"This is a synthetic test alert to verify the AlertManager pipeline. It will auto-resolve.\"
    },
    \"startsAt\": \"${now}\",
    \"endsAt\": \"${end}\",
    \"generatorURL\": \"${PROMETHEUS_URL}/graph\"
  }
]"

  # Push test alert
  local body
  body=$(http_post "${ALERTMANAGER_URL}/api/v2/alerts" "$test_alert_json")

  if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "202" ]]; then
    add_result "Test Alert" "Push to AlertManager" "PASS" "Test alert sent successfully (HTTP ${HTTP_CODE})"
  else
    add_result "Test Alert" "Push to AlertManager" "FAIL" "Failed to push test alert (HTTP ${HTTP_CODE})"
    return
  fi

  # Wait briefly then verify the alert appears
  sleep 2

  body=$(http_get "${ALERTMANAGER_URL}/api/v2/alerts?filter=alertname%3DClawChainTestAlert")

  if [[ "$HTTP_CODE" == "200" ]]; then
    local found
    found=$(echo "$body" | python3 -c "
import sys, json
alerts = json.load(sys.stdin)
test_alerts = [a for a in alerts if a.get('labels', {}).get('alertname') == 'ClawChainTestAlert']
print(len(test_alerts))
" 2>/dev/null || echo "0")

    if [[ "$found" -gt 0 ]]; then
      add_result "Test Alert" "Verify in AlertManager" "PASS" "Test alert found in AlertManager (${found} instance(s))"
    else
      add_result "Test Alert" "Verify in AlertManager" "WARN" "Test alert not yet visible (may need more time to propagate)"
    fi
  else
    add_result "Test Alert" "Verify in AlertManager" "FAIL" "Could not query AlertManager alerts (HTTP ${HTTP_CODE})"
  fi
}

# ---------------------------------------------------------------------------
# Run all checks
# ---------------------------------------------------------------------------
parse_alert_rules
check_firing_alerts
validate_alert_expressions
check_alertmanager_config
send_test_alert

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if [[ "$JSON_OUTPUT" == "true" ]]; then
  echo "{"
  echo "  \"summary\": {"
  echo "    \"pass\": ${PASS_COUNT},"
  echo "    \"fail\": ${FAIL_COUNT},"
  echo "    \"warn\": ${WARN_COUNT},"
  echo "    \"total\": $(( PASS_COUNT + FAIL_COUNT + WARN_COUNT ))"
  echo "  },"
  echo "  \"endpoints\": {"
  echo "    \"prometheus\": \"${PROMETHEUS_URL}\","
  echo "    \"alertmanager\": \"${ALERTMANAGER_URL}\""
  echo "  },"
  echo "  \"alert_rules_file\": \"${ALERT_RULES_FILE}\","
  echo "  \"send_test\": ${SEND_TEST},"
  echo "  \"alert_inventory\": ["
  local first=true
  for i in "${!ALERT_NAMES[@]}"; do
    if [[ "$first" == "true" ]]; then
      first=false
    else
      echo ","
    fi
    printf '    {"name": "%s", "group": "%s", "severity": "%s"}' \
      "${ALERT_NAMES[$i]}" "${ALERT_GROUPS[$i]}" "${ALERT_SEVERITIES[$i]}"
  done
  echo ""
  echo "  ],"
  echo "  \"checks\": ["
  first=true
  for entry in "${RESULTS[@]}"; do
    IFS='|' read -r category check status detail <<< "$entry"
    if [[ "$first" == "true" ]]; then
      first=false
    else
      echo ","
    fi
    printf '    {"category": "%s", "check": "%s", "status": "%s", "detail": "%s"}' \
      "$category" "$check" "$status" "$detail"
  done
  echo ""
  echo "  ]"
  echo "}"
else
  echo ""
  echo -e "${BOLD}${CYAN}ClawChain Alert Rules Validation${RESET}"
  echo -e "${CYAN}=================================${RESET}"
  echo ""
  echo -e "  Prometheus:   ${PROMETHEUS_URL}"
  echo -e "  AlertManager: ${ALERTMANAGER_URL}"
  echo -e "  Rules file:   ${ALERT_RULES_FILE}"
  echo ""

  # Print alert rule inventory
  if [[ ${#ALERT_NAMES[@]} -gt 0 ]]; then
    echo -e "${BOLD}Alert Rule Inventory${RESET}"
    printf "  ${BOLD}%-30s %-30s %-10s${RESET}\n" "ALERT NAME" "GROUP" "SEVERITY"
    printf "  %-30s %-30s %-10s\n" "------------------------------" "------------------------------" "----------"
    for i in "${!ALERT_NAMES[@]}"; do
      local sev_colored
      case "${ALERT_SEVERITIES[$i]}" in
        critical) sev_colored="${RED}${ALERT_SEVERITIES[$i]}${RESET}" ;;
        warning)  sev_colored="${YELLOW}${ALERT_SEVERITIES[$i]}${RESET}" ;;
        *)        sev_colored="${ALERT_SEVERITIES[$i]}" ;;
      esac
      printf "  %-30s %-30s %-10b\n" "${ALERT_NAMES[$i]}" "${ALERT_GROUPS[$i]}" "$sev_colored"
    done
    echo ""
  fi

  # Print check results table
  echo -e "${BOLD}Validation Results${RESET}"
  printf "  ${BOLD}%-25s %-40s %-8s %s${RESET}\n" "CATEGORY" "CHECK" "STATUS" "DETAIL"
  printf "  %-25s %-40s %-8s %s\n" "-------------------------" "----------------------------------------" "--------" "------------------------------"

  local current_category=""
  for entry in "${RESULTS[@]}"; do
    IFS='|' read -r category check status detail <<< "$entry"

    local status_colored
    case "$status" in
      PASS) status_colored="${GREEN}PASS${RESET}" ;;
      FAIL) status_colored="${RED}FAIL${RESET}" ;;
      WARN) status_colored="${YELLOW}WARN${RESET}" ;;
      *)    status_colored="$status" ;;
    esac

    if [[ "$category" != "$current_category" ]]; then
      if [[ -n "$current_category" ]]; then
        echo ""
      fi
      current_category="$category"
    fi

    printf "  %-25s %-40s %-8b %s\n" "$category" "$check" "$status_colored" "$detail"
  done

  echo ""
  echo -e "${BOLD}Summary${RESET}"
  echo -e "  ${GREEN}PASS${RESET}: ${PASS_COUNT}    ${RED}FAIL${RESET}: ${FAIL_COUNT}    ${YELLOW}WARN${RESET}: ${WARN_COUNT}    Total: $(( PASS_COUNT + FAIL_COUNT + WARN_COUNT ))"
  echo ""

  if [[ "$FAIL_COUNT" -gt 0 ]]; then
    echo -e "${RED}${BOLD}Alert validation has failures. Review FAIL items above.${RESET}"
    exit 1
  elif [[ "$WARN_COUNT" -gt 0 ]]; then
    echo -e "${YELLOW}${BOLD}Alert validation has warnings. Review WARN items above.${RESET}"
    exit 0
  else
    echo -e "${GREEN}${BOLD}All alert rules validated successfully.${RESET}"
    exit 0
  fi
fi
