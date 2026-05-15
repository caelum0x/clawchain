#!/usr/bin/env npx tsx

/**
 * ClawChain Demo Scenario: Privacy Flow
 *
 * Demonstrates the ZK privacy module:
 *   shield tokens -> private transfer -> unshield -> view key registration
 *
 * Requires ALICE_MNEMONIC environment variable for transaction mode.
 * Falls back to query-only mode showing chain state.
 */

import { ClawChainClient } from "../../sdk/src/client.js";

const RPC = process.env.RPC_URL || "http://localhost:26657";
const ALICE_MNEMONIC = process.env.ALICE_MNEMONIC || "";

const TX_MODE = !!ALICE_MNEMONIC;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function step(title: string): void {
  console.log(`\n--- ${title} ---\n`);
}

function formatClaw(uclaw: string | number): string {
  const n = typeof uclaw === "string" ? parseInt(uclaw, 10) : uclaw;
  if (isNaN(n)) return `${uclaw} uclaw`;
  return `${(n / 1_000_000).toFixed(6)} CLAW (${n} uclaw)`;
}

async function main(): Promise<void> {
  console.log("\n  Privacy Flow Demo\n");
  console.log(`  Mode: ${TX_MODE ? "TRANSACTION (wallet provided)" : "QUERY-ONLY (no mnemonic)"}`);

  const reader = new ClawChainClient({ rpcUrl: RPC });
  await reader.connect();

  let alice: ClawChainClient | null = null;
  if (TX_MODE) {
    alice = new ClawChainClient({ rpcUrl: RPC, mnemonic: ALICE_MNEMONIC });
    await alice.connect();
    console.log(`  Alice address: ${alice.getAddress()}`);

    const balance = await reader.getBalance(alice.getAddress());
    console.log(`  Alice balance: ${formatClaw(balance)}`);
  }

  // -------------------------------------------------------------------------
  step("1. Merkle Tree State (Before)");
  // -------------------------------------------------------------------------

  try {
    const stats = await reader.getTreeStats();
    console.log(`  Tree depth       : ${stats.treeDepth}`);
    console.log(`  Leaf count       : ${stats.leafCount}`);
    console.log(`  Current root     : ${stats.currentRoot}`);
  } catch {
    console.log("  Tree stats not available (module may be uninitialized)");
  }

  try {
    const root = await reader.getMerkleRoot();
    console.log(`  Merkle root      : ${root}`);
  } catch {
    console.log("  Merkle root query failed");
  }

  // -------------------------------------------------------------------------
  step("2. Root History");
  // -------------------------------------------------------------------------

  try {
    const history = await reader.getRootHistory(0, 10);
    console.log(`  Total roots stored: ${history.total}`);
    console.log(`  Next offset       : ${history.nextOffset}`);
    for (const root of (history.roots ?? []).slice(0, 5)) {
      console.log(`    - ${root}`);
    }
  } catch {
    console.log("  Root history not available");
  }

  // -------------------------------------------------------------------------
  step("3. Shield Tokens (Transparent -> Shielded Pool)");
  // -------------------------------------------------------------------------

  if (TX_MODE && alice) {
    try {
      console.log("  Shielding 1 CLAW (1000000 uclaw) into the privacy pool...");
      const tx = await alice.shield({ amount: 1_000_000 });
      console.log(`  Shield TX    : ${tx.transactionHash}`);
      console.log(`  Code         : ${tx.code}`);
      console.log(`  Gas used     : ${tx.gasUsed}`);

      // Extract commitment from events
      for (const event of tx.events) {
        if (event.type === "shield" || event.type === "privacy_shield") {
          const commitAttr = event.attributes.find((a) => a.key === "commitment");
          if (commitAttr) {
            console.log(`  Commitment   : ${commitAttr.value}`);
          }
          const amountAttr = event.attributes.find((a) => a.key === "amount");
          if (amountAttr) {
            console.log(`  Amount       : ${amountAttr.value} uclaw`);
          }
        }
      }
    } catch (e: unknown) {
      console.log(`  Shield failed: ${(e as Error).message}`);
    }
    await sleep(3000);
  } else {
    console.log("  Shield flow (MsgShield):");
    console.log("    1. User deposits transparent tokens into the shielded pool");
    console.log("    2. A commitment hash is generated and added to the Merkle tree");
    console.log("    3. The deposited tokens are held by the privacy module account");
    console.log("    4. User receives a commitment note (secret + blinding factor)");
    console.log("");
    console.log("  The commitment note must be stored securely -- it is the key");
    console.log("  to spending the shielded tokens later.");
  }

  // -------------------------------------------------------------------------
  step("4. Merkle Tree State (After Shield)");
  // -------------------------------------------------------------------------

  try {
    const stats = await reader.getTreeStats();
    console.log(`  Tree depth       : ${stats.treeDepth}`);
    console.log(`  Leaf count       : ${stats.leafCount}`);
    console.log(`  Current root     : ${stats.currentRoot}`);
  } catch {
    console.log("  Tree stats not available");
  }

  // -------------------------------------------------------------------------
  step("5. Private Transfer (ZK-SNARK)");
  // -------------------------------------------------------------------------

  console.log("  Private transfer flow (MsgPrivateTransfer):");
  console.log("    1. Sender proves knowledge of two existing commitments (input)");
  console.log("    2. Sender creates two new commitments (output)");
  console.log("    3. Sender reveals nullifiers (prevents double-spend)");
  console.log("    4. Sender provides a Groth16 ZK proof");
  console.log("    5. Chain verifies:");
  console.log("       - Proof is valid");
  console.log("       - Nullifiers are fresh (not spent before)");
  console.log("       - Merkle root matches the claimed commitments");
  console.log("       - Input amounts == output amounts (conservation)");
  console.log("");
  console.log("  The sender and receiver addresses are NEVER revealed on-chain.");
  console.log("  Only the nullifiers and new commitments are stored.");

  if (TX_MODE && alice) {
    console.log("");
    console.log("  [Note: Full private transfer requires clawproof binary for");
    console.log("   Groth16 proof generation. Showing the API shape instead.]");
    console.log("");
    console.log("  await client.privateTransfer({");
    console.log('    oldCommitments: "commit1_hex,commit2_hex",');
    console.log('    newCommitments: "new_commit1_hex,new_commit2_hex",');
    console.log('    nullifiers: "null1_hex,null2_hex",');
    console.log('    root: "merkle_root_hex",');
    console.log('    proof: "groth16_proof_hex",');
    console.log("  });");
  }

  // -------------------------------------------------------------------------
  step("6. Unshield Tokens (Shielded Pool -> Transparent)");
  // -------------------------------------------------------------------------

  console.log("  Unshield flow (MsgUnshield):");
  console.log("    1. User proves ownership of a shielded commitment");
  console.log("    2. User reveals the nullifier (marks commitment as spent)");
  console.log("    3. User provides a Groth16 ZK proof");
  console.log("    4. Chain verifies proof and releases tokens");
  console.log("    5. Tokens appear in the recipient's transparent balance");
  console.log("");
  console.log("  await client.unshield({");
  console.log('    commitment: "commitment_hex",');
  console.log('    nullifier: "nullifier_hex",');
  console.log('    proof: "groth16_proof_hex",');
  console.log("    amount: 1_000_000,");
  console.log('    root: "merkle_root_hex",');
  console.log("  });");

  // -------------------------------------------------------------------------
  step("7. Nullifier Check (Double-Spend Prevention)");
  // -------------------------------------------------------------------------

  console.log("  The nullifier system prevents double-spending:");
  console.log("    - Each commitment can only be spent once");
  console.log("    - Spending reveals a deterministic nullifier hash");
  console.log("    - The chain stores all nullifiers and rejects duplicates");

  // Demo nullifier check
  const demoNullifier = "0000000000000000000000000000000000000000000000000000000000000001";
  try {
    const exists = await reader.nullifierExists(demoNullifier);
    console.log(`\n  Nullifier ${demoNullifier.slice(0, 16)}... exists: ${exists}`);
  } catch {
    console.log("  Nullifier check not available");
  }

  // -------------------------------------------------------------------------
  step("8. View Key Registration (Selective Disclosure)");
  // -------------------------------------------------------------------------

  console.log("  View keys allow selective disclosure of shielded transactions.");
  console.log("  An agent can register encrypted notes for commitments, enabling");
  console.log("  authorized parties to view transaction details.");
  console.log("");
  console.log("  await client.registerViewKey({");
  console.log('    commitmentHex: "commitment_hash",');
  console.log('    encryptedNote: "encrypted_amount_blinding_secret",');
  console.log("  });");
  console.log("");
  console.log("  Use cases:");
  console.log("    - Compliance: Share transaction data with auditors");
  console.log("    - Escrow: Allow escrow agents to verify amounts");
  console.log("    - Receipts: Prove payment to a counterparty");

  if (TX_MODE && alice) {
    try {
      const tx = await alice.registerViewKey({
        commitmentHex: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        encryptedNote: "encrypted-note-data-for-selective-disclosure",
      });
      console.log(`\n  RegisterViewKey TX: ${tx.transactionHash} (code=${tx.code})`);
    } catch (e: unknown) {
      console.log(`\n  RegisterViewKey: ${(e as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------
  step("9. Batch Private Transfer");
  // -------------------------------------------------------------------------

  console.log("  For efficiency, multiple private transfers can be batched:");
  console.log("    - Single transaction, multiple transfer operations");
  console.log("    - Reduced gas costs compared to individual transfers");
  console.log("    - Each transfer in the batch has its own proof");
  console.log("");
  console.log("  await client.batchPrivateTransfer({");
  console.log("    transfers: [");
  console.log("      { oldCommitments, newCommitments, nullifiers, root, proof },");
  console.log("      { oldCommitments, newCommitments, nullifiers, root, proof },");
  console.log("    ],");
  console.log("  });");

  // -------------------------------------------------------------------------
  step("Complete");
  // -------------------------------------------------------------------------

  console.log("  Privacy module features demonstrated:");
  console.log("    1. Merkle tree state inspection");
  console.log("    2. Root history tracking");
  console.log("    3. Token shielding (transparent -> private)");
  console.log("    4. Private transfers with ZK-SNARK proofs");
  console.log("    5. Token unshielding (private -> transparent)");
  console.log("    6. Nullifier-based double-spend prevention");
  console.log("    7. View key selective disclosure");
  console.log("    8. Batch private transfers");
  console.log("");
  console.log("  Privacy guarantees:");
  console.log("    - Sender/receiver addresses are hidden");
  console.log("    - Transfer amounts are hidden");
  console.log("    - Only nullifiers and commitments are on-chain");
  console.log("    - Groth16 proofs ensure correctness without revealing data");
  console.log("");

  await reader.disconnect();
  if (alice) await alice.disconnect();
}

main().catch((err) => {
  console.error("\n  [FATAL]", err);
  process.exit(1);
});
