#!/usr/bin/env bash
# check-marketplace-lifecycle-gate.sh
#
# Gate script for marketplace/escrow/reputation lifecycle readiness.
# Verifies that all required documentation, proto files, keeper files,
# and message handlers exist for the marketplace and reputation modules.
#
# Exit 0 on full pass, exit 1 on any failure.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PASS=0
FAIL=0
TOTAL=0

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: $1"
}

check_file() {
  local label="$1"
  local path="$2"
  if [ -f "$REPO_ROOT/$path" ]; then
    pass "$label ($path)"
  else
    fail "$label ($path) -- file not found"
  fi
}

check_dir() {
  local label="$1"
  local path="$2"
  if [ -d "$REPO_ROOT/$path" ]; then
    pass "$label ($path)"
  else
    fail "$label ($path) -- directory not found"
  fi
}

check_grep() {
  local label="$1"
  local pattern="$2"
  local path="$3"
  if [ -f "$REPO_ROOT/$path" ] && grep -q "$pattern" "$REPO_ROOT/$path" 2>/dev/null; then
    pass "$label"
  else
    fail "$label -- pattern '$pattern' not found in $path"
  fi
}

echo "============================================="
echo "Marketplace/Escrow/Reputation Lifecycle Gate Check"
echo "============================================="
echo ""

# --- Section 1: Documentation ---
echo "[1/7] Marketplace operator flow documentation"
check_file "Marketplace operator flow doc" "docs/marketplace-operator-flow.md"
check_grep "Skill listing documented" "List a new skill" "docs/marketplace-operator-flow.md"
check_grep "Skill update documented" "Update an existing skill" "docs/marketplace-operator-flow.md"
check_grep "Skill delist documented" "Delist a skill" "docs/marketplace-operator-flow.md"
check_grep "Escrow creation documented" "Create an escrow" "docs/marketplace-operator-flow.md"
check_grep "Escrow completion documented" "Complete an escrow" "docs/marketplace-operator-flow.md"
check_grep "Milestone documented" "Complete a milestone" "docs/marketplace-operator-flow.md"
check_grep "Dispute opening documented" "Open a dispute" "docs/marketplace-operator-flow.md"
check_grep "Dispute resolution documented" "Resolve a dispute" "docs/marketplace-operator-flow.md"
check_grep "Rating documented" "Rate an agent" "docs/marketplace-operator-flow.md"
check_grep "Endorsement documented" "Endorse an agent" "docs/marketplace-operator-flow.md"
check_grep "Troubleshooting section" "Troubleshooting" "docs/marketplace-operator-flow.md"
echo ""

# --- Section 2: Marketplace proto files ---
echo "[2/7] Marketplace module proto files"
check_file "Marketplace tx proto" "proto/clawchain/marketplace/v1/tx.proto"
check_file "Marketplace query proto" "proto/clawchain/marketplace/v1/query.proto"
check_file "Marketplace params proto" "proto/clawchain/marketplace/v1/params.proto"
check_file "Marketplace genesis proto" "proto/clawchain/marketplace/v1/genesis.proto"
check_file "Marketplace types proto" "proto/clawchain/marketplace/v1/types.proto"
check_file "Marketplace module proto" "proto/clawchain/marketplace/module/v1/module.proto"
check_grep "MsgListSkill in tx proto" "MsgListSkill" "proto/clawchain/marketplace/v1/tx.proto"
check_grep "MsgDelistSkill in tx proto" "MsgDelistSkill" "proto/clawchain/marketplace/v1/tx.proto"
check_grep "MsgPurchaseSkill in tx proto" "MsgPurchaseSkill" "proto/clawchain/marketplace/v1/tx.proto"
check_grep "MsgCreateEscrow in tx proto" "MsgCreateEscrow" "proto/clawchain/marketplace/v1/tx.proto"
check_grep "MsgCompleteEscrow in tx proto" "MsgCompleteEscrow" "proto/clawchain/marketplace/v1/tx.proto"
check_grep "MsgCompleteMilestone in tx proto" "MsgCompleteMilestone" "proto/clawchain/marketplace/v1/tx.proto"
check_grep "MsgDisputeEscrow in tx proto" "MsgDisputeEscrow" "proto/clawchain/marketplace/v1/tx.proto"
check_grep "MsgResolveDispute in tx proto" "MsgResolveDispute" "proto/clawchain/marketplace/v1/tx.proto"
check_grep "MsgUpdateSkill in tx proto" "MsgUpdateSkill" "proto/clawchain/marketplace/v1/tx.proto"
check_grep "SkillRecord type" "SkillRecord" "proto/clawchain/marketplace/v1/query.proto"
check_grep "EscrowAgreement type" "EscrowAgreement" "proto/clawchain/marketplace/v1/query.proto"
check_grep "EscrowDispute type" "EscrowDispute" "proto/clawchain/marketplace/v1/query.proto"
echo ""

# --- Section 3: Reputation proto files ---
echo "[3/7] Reputation module proto files"
check_file "Reputation tx proto" "proto/clawchain/reputation/v1/tx.proto"
check_file "Reputation query proto" "proto/clawchain/reputation/v1/query.proto"
check_file "Reputation params proto" "proto/clawchain/reputation/v1/params.proto"
check_file "Reputation genesis proto" "proto/clawchain/reputation/v1/genesis.proto"
check_file "Reputation module proto" "proto/clawchain/reputation/module/v1/module.proto"
check_grep "MsgRateAgent in tx proto" "MsgRateAgent" "proto/clawchain/reputation/v1/tx.proto"
check_grep "MsgEndorseAgent in tx proto" "MsgEndorseAgent" "proto/clawchain/reputation/v1/tx.proto"
check_grep "ReputationRecord type" "ReputationRecord" "proto/clawchain/reputation/v1/query.proto"
check_grep "Rating type" "Rating" "proto/clawchain/reputation/v1/query.proto"
check_grep "Endorsement type" "Endorsement" "proto/clawchain/reputation/v1/query.proto"
echo ""

# --- Section 4: Marketplace keeper files ---
echo "[4/7] Marketplace keeper implementation files"
check_file "Marketplace keeper" "x/marketplace/keeper/keeper.go"
check_file "Marketplace genesis" "x/marketplace/keeper/genesis.go"
check_file "Marketplace query server" "x/marketplace/keeper/query.go"
check_file "Marketplace msg server" "x/marketplace/keeper/msg_server.go"
check_file "List skill handler" "x/marketplace/keeper/msg_server_list_skill.go"
check_file "Delist skill handler" "x/marketplace/keeper/msg_server_delist_skill.go"
check_file "Purchase skill handler" "x/marketplace/keeper/msg_server_purchase_skill.go"
check_file "Update skill handler" "x/marketplace/keeper/msg_server_update_skill.go"
check_file "Create escrow handler" "x/marketplace/keeper/msg_server_create_escrow.go"
check_file "Complete escrow handler" "x/marketplace/keeper/msg_server_complete_escrow.go"
check_file "Complete milestone handler" "x/marketplace/keeper/msg_server_complete_milestone.go"
check_file "Dispute escrow handler" "x/marketplace/keeper/msg_server_dispute_escrow.go"
check_file "Resolve dispute handler" "x/marketplace/keeper/msg_server_resolve_dispute.go"
check_file "Escrow funds helper" "x/marketplace/keeper/escrow_funds.go"
check_file "Escrow expire logic" "x/marketplace/keeper/escrow_expire.go"
check_file "Skills query" "x/marketplace/keeper/query_skills.go"
check_file "Escrow query" "x/marketplace/keeper/query_escrow.go"
check_file "Skills by owner query" "x/marketplace/keeper/query_skills_by_owner.go"
check_file "Skills by category query" "x/marketplace/keeper/query_skills_by_category.go"
check_file "Skill search query" "x/marketplace/keeper/query_skill_search.go"
check_file "Skill analytics query" "x/marketplace/keeper/query_skill_analytics.go"
check_file "Module registration" "x/marketplace/module/module.go"
check_file "AutoCLI config" "x/marketplace/module/autocli.go"
echo ""

# --- Section 5: Reputation keeper files ---
echo "[5/7] Reputation keeper implementation files"
check_file "Reputation keeper" "x/reputation/keeper/keeper.go"
check_file "Reputation genesis" "x/reputation/keeper/genesis.go"
check_file "Reputation query server" "x/reputation/keeper/query.go"
check_file "Reputation msg server" "x/reputation/keeper/msg_server.go"
check_file "Rate agent handler" "x/reputation/keeper/msg_server_rate_agent.go"
check_file "Endorse agent handler" "x/reputation/keeper/msg_server_endorse_agent.go"
check_file "Reputation query" "x/reputation/keeper/query_reputation.go"
check_file "Ratings query" "x/reputation/keeper/query_ratings.go"
check_file "Endorsements query" "x/reputation/keeper/query_endorsements.go"
check_file "Top agents query" "x/reputation/keeper/query_top_agents.go"
check_file "Reputation end block" "x/reputation/keeper/endblock.go"
check_file "Module registration" "x/reputation/module/module.go"
check_file "AutoCLI config" "x/reputation/module/autocli.go"
echo ""

# --- Section 6: Escrow/skill/reputation handler content verification ---
echo "[6/7] Handler content verification"
check_grep "ListSkill stores skill record" "Skills.Set" "x/marketplace/keeper/msg_server_list_skill.go"
check_grep "CreateEscrow locks funds" "SendCoinsFromAccountToModule" "x/marketplace/keeper/msg_server_create_escrow.go"
check_grep "CreateEscrow validates deadline" "DeadlineBlocks" "x/marketplace/keeper/msg_server_create_escrow.go"
check_grep "CreateEscrow validates milestones" "Milestones" "x/marketplace/keeper/msg_server_create_escrow.go"
check_grep "CompleteEscrow releases funds" "SendCoinsFromModuleToAccount" "x/marketplace/keeper/msg_server_complete_escrow.go"
check_grep "CompleteEscrow sets completed status" "completed" "x/marketplace/keeper/msg_server_complete_escrow.go"
check_grep "CompleteMilestone releases payout" "nextMilestonePayout" "x/marketplace/keeper/msg_server_complete_milestone.go"
check_grep "DisputeEscrow checks party" "Buyer.*Seller" "x/marketplace/keeper/msg_server_dispute_escrow.go"
check_grep "DisputeEscrow sets disputed status" "disputed" "x/marketplace/keeper/msg_server_dispute_escrow.go"
check_grep "ResolveDispute checks authority" "GetAuthority" "x/marketplace/keeper/msg_server_resolve_dispute.go"
check_grep "ResolveDispute refunds buyer" "refund" "x/marketplace/keeper/msg_server_resolve_dispute.go"
check_grep "RateAgent validates score range" "Score" "x/reputation/keeper/msg_server_rate_agent.go"
check_grep "RateAgent prevents self-rating" "self-rating" "x/reputation/keeper/msg_server_rate_agent.go"
check_grep "RateAgent requires purchase" "HasPurchased" "x/reputation/keeper/msg_server_rate_agent.go"
check_grep "EndorseAgent checks agent registration" "IsAgentRegistered" "x/reputation/keeper/msg_server_endorse_agent.go"
check_grep "EndorseAgent prevents self-endorsement" "self-endorsement" "x/reputation/keeper/msg_server_endorse_agent.go"
echo ""

# --- Section 7: Module directory structure ---
echo "[7/7] Module directory structure"
check_dir "Marketplace module directory" "x/marketplace"
check_dir "Marketplace types directory" "x/marketplace/types"
check_dir "Marketplace keeper directory" "x/marketplace/keeper"
check_dir "Marketplace module directory" "x/marketplace/module"
check_dir "Reputation module directory" "x/reputation"
check_dir "Reputation types directory" "x/reputation/types"
check_dir "Reputation keeper directory" "x/reputation/keeper"
check_dir "Reputation module directory" "x/reputation/module"
echo ""

# --- Summary ---
echo "============================================="
echo "Marketplace/Escrow/Reputation Lifecycle Gate Results"
echo "============================================="
echo "  Passed: $PASS / $TOTAL"
echo "  Failed: $FAIL / $TOTAL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "GATE STATUS: FAIL"
  exit 1
else
  echo "GATE STATUS: PASS"
  exit 0
fi
