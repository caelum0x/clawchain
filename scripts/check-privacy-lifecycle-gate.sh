#!/usr/bin/env bash
# check-privacy-lifecycle-gate.sh
#
# Gate script for privacy module lifecycle readiness.
# Verifies that all required documentation, proto files, keeper files,
# and message handlers exist for the privacy module.
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
echo "Privacy Module Lifecycle Gate Check"
echo "============================================="
echo ""

# --- Section 1: Documentation ---
echo "[1/5] Privacy module documentation"
check_file "Privacy operator flow doc" "docs/privacy-operator-flow.md"
check_grep "Shield lifecycle documented" "Shield" "docs/privacy-operator-flow.md"
check_grep "Unshield lifecycle documented" "Unshield" "docs/privacy-operator-flow.md"
check_grep "Private transfer documented" "Private Transfer" "docs/privacy-operator-flow.md"
check_grep "View key documented" "View Key" "docs/privacy-operator-flow.md"
check_grep "Merkle tree querying documented" "Merkle" "docs/privacy-operator-flow.md"
check_grep "ZK proof generation documented" "Groth16" "docs/privacy-operator-flow.md"
check_grep "Troubleshooting section" "Troubleshooting" "docs/privacy-operator-flow.md"
echo ""

# --- Section 2: Proto files ---
echo "[2/5] Privacy module proto files"
check_file "Privacy tx proto" "proto/clawchain/privacy/v1/tx.proto"
check_file "Privacy query proto" "proto/clawchain/privacy/v1/query.proto"
check_file "Privacy params proto" "proto/clawchain/privacy/v1/params.proto"
check_file "Privacy genesis proto" "proto/clawchain/privacy/v1/genesis.proto"
check_file "Privacy module proto" "proto/clawchain/privacy/module/v1/module.proto"
check_grep "MsgShield in tx proto" "MsgShield" "proto/clawchain/privacy/v1/tx.proto"
check_grep "MsgUnshield in tx proto" "MsgUnshield" "proto/clawchain/privacy/v1/tx.proto"
check_grep "MsgPrivateTransfer in tx proto" "MsgPrivateTransfer" "proto/clawchain/privacy/v1/tx.proto"
check_grep "MsgRegisterViewKey in tx proto" "MsgRegisterViewKey" "proto/clawchain/privacy/v1/tx.proto"
check_grep "MsgBatchPrivateTransfer in tx proto" "MsgBatchPrivateTransfer" "proto/clawchain/privacy/v1/tx.proto"
check_grep "MerkleRoot query in query proto" "MerkleRoot" "proto/clawchain/privacy/v1/query.proto"
check_grep "NullifierExists query in query proto" "NullifierExists" "proto/clawchain/privacy/v1/query.proto"
check_grep "RootHistory query in query proto" "RootHistory" "proto/clawchain/privacy/v1/query.proto"
check_grep "ViewKey query in query proto" "ViewKey" "proto/clawchain/privacy/v1/query.proto"
check_grep "MerkleProof query in query proto" "MerkleProof" "proto/clawchain/privacy/v1/query.proto"
check_grep "TreeStats query in query proto" "TreeStats" "proto/clawchain/privacy/v1/query.proto"
check_grep "CommitmentIndex query in query proto" "CommitmentIndex" "proto/clawchain/privacy/v1/query.proto"
echo ""

# --- Section 3: Keeper files ---
echo "[3/5] Privacy keeper implementation files"
check_file "Keeper main" "x/privacy/keeper/keeper.go"
check_file "Genesis keeper" "x/privacy/keeper/genesis.go"
check_file "Query server" "x/privacy/keeper/query.go"
check_file "Msg server" "x/privacy/keeper/msg_server.go"
check_file "Shield handler" "x/privacy/keeper/msg_server_shield.go"
check_file "Unshield handler" "x/privacy/keeper/msg_server_unshield.go"
check_file "Private transfer handler" "x/privacy/keeper/msg_server_private_transfer.go"
check_file "Register view key handler" "x/privacy/keeper/msg_server_register_view_key.go"
check_file "Batch private transfer handler" "x/privacy/keeper/msg_server_batch_private_transfer.go"
check_file "Merkle root query" "x/privacy/keeper/query_merkle_root.go"
check_file "Nullifier exists query" "x/privacy/keeper/query_nullifier_exists.go"
check_file "Root history query" "x/privacy/keeper/query_root_history.go"
check_file "View key query" "x/privacy/keeper/query_view_key.go"
check_file "Merkle proof query" "x/privacy/keeper/query_merkle_proof.go"
check_file "Commitment index query" "x/privacy/keeper/query_commitment_index.go"
check_file "Tree stats query" "x/privacy/keeper/query_tree_stats.go"
check_file "State machine" "x/privacy/keeper/state_machine.go"
echo ""

# --- Section 4: Message handler verification ---
echo "[4/5] Shield/Unshield/Transfer message handler content"
check_grep "Shield sends coins to module" "SendCoinsFromAccountToModule" "x/privacy/keeper/msg_server_shield.go"
check_grep "Shield inserts commitment" "AppendCommitment" "x/privacy/keeper/msg_server_shield.go"
check_grep "Shield emits event" "EventManager" "x/privacy/keeper/msg_server_shield.go"
check_grep "Unshield verifies proof" "VerifyUnshieldProof" "x/privacy/keeper/msg_server_unshield.go"
check_grep "Unshield consumes nullifier" "ConsumeNullifiers" "x/privacy/keeper/msg_server_unshield.go"
check_grep "Unshield sends coins from module" "SendCoinsFromModuleToAccount" "x/privacy/keeper/msg_server_unshield.go"
check_grep "Transfer verifies proof" "VerifyTransferProof" "x/privacy/keeper/msg_server_private_transfer.go"
check_grep "Transfer consumes nullifiers" "ConsumeNullifiers" "x/privacy/keeper/msg_server_private_transfer.go"
check_grep "Transfer appends commitments" "AppendCommitment" "x/privacy/keeper/msg_server_private_transfer.go"
check_grep "Batch transfer batch verify" "BatchVerifyTransferProofs" "x/privacy/keeper/msg_server_batch_private_transfer.go"
echo ""

# --- Section 5: Circuit and Merkle infrastructure ---
echo "[5/5] Circuit and Merkle tree infrastructure"
check_file "Circuit definitions" "x/privacy/circuit/circuit.go"
check_file "Circuit setup and proof utils" "x/privacy/circuit/setup.go"
check_file "Merkle tree" "x/privacy/merkle/tree.go"
check_grep "TransferCircuit struct" "TransferCircuit struct" "x/privacy/circuit/circuit.go"
check_grep "UnshieldCircuit struct" "UnshieldCircuit struct" "x/privacy/circuit/circuit.go"
check_grep "ViewKeyCircuit struct" "ViewKeyCircuit struct" "x/privacy/circuit/circuit.go"
check_grep "MiMC hash function" "MiMCHashPair" "x/privacy/merkle/tree.go"
check_grep "Merkle tree depth 32" "Depth = 32" "x/privacy/merkle/tree.go"
check_dir "Privacy module directory" "x/privacy"
check_dir "Privacy types directory" "x/privacy/types"
check_file "Module registration" "x/privacy/module/module.go"
check_file "AutoCLI config" "x/privacy/module/autocli.go"
echo ""

# --- Summary ---
echo "============================================="
echo "Privacy Lifecycle Gate Results"
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
