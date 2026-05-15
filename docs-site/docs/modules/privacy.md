---
sidebar_position: 3
---

# Privacy Module (x/privacy)

The privacy module enables confidential transactions on ClawChain using Groth16 ZK-SNARK proofs over the BN254 elliptic curve. Users can shield tokens into a private pool, transfer privately without revealing amounts or parties, and unshield back to public balances.

## Key Features

- **Shield** -- move public tokens into the private pool as Merkle tree commitments
- **Unshield** -- prove ownership of a commitment and withdraw to a public balance
- **Private Transfer** -- 2-in-2-out UTXO model transferring tokens without revealing amounts
- **Batch Private Transfer** -- multiple private transfers in a single transaction
- **Merkle tree commitments** -- depth-32 binary tree with MiMC hash, supporting ~4 billion leaves
- **Nullifier tracking** -- prevents double-spending of private notes
- **View keys** -- optional selective disclosure for compliance/auditing
- **Rate limiting** -- maximum 50 privacy transactions per block to prevent ZK verification DoS

## How It Works

### Shielding

When you shield tokens, they are burned from your public balance and a new commitment `C = MiMC(amount, blinding)` is added as a leaf in the Merkle tree. Only you know the blinding factor and secret that can spend this commitment.

```
Public Balance (100 CLAW)
        |
        v  [Shield 50 CLAW]
        |
Public Balance (50 CLAW) + Private Commitment C = MiMC(50, blinding)
```

No ZK proof is needed for shielding -- the chain simply verifies the sender has sufficient funds, burns the tokens, and inserts the commitment.

### Private Transfer (2-in-2-out UTXO)

Private transfers consume exactly 2 existing commitments (via nullifiers) and create 2 new commitments for recipients. A ZK proof verifies the transaction is valid without revealing any amounts:

```
Input Commitment A ----+                          +--> Output Commitment C (recipient)
                       |                          |
                       +--> ZK Proof (Groth16) ---+
                       |                          |
Input Commitment B ----+                          +--> Output Commitment D (change)
```

The circuit enforces:
1. **Balance conservation** -- `inputAmount[0] + inputAmount[1] == outputAmount[0] + outputAmount[1]`
2. **Range proofs** -- all amounts constrained to `[0, 2^64)` to prevent overflow
3. **Commitment validity** -- each input commitment = `MiMC(amount, blinding)`
4. **Nullifier derivation** -- each nullifier = `MiMC(secret, commitment)`
5. **Merkle inclusion** -- each input commitment exists in the tree at the claimed root
6. **Output commitment validity** -- each output commitment = `MiMC(amount, blinding)`

If you want to send to a single recipient, use one output for the transfer and one for your own change.

### Unshielding

Unshielding reveals a commitment's amount publicly. The UnshieldCircuit proves:
1. You know the preimage (amount, blinding) of the commitment
2. The nullifier is correctly derived from the commitment
3. The commitment exists in the Merkle tree

The amount is a public input so the chain can mint that many tokens to the recipient's public balance.

### View Keys

View keys provide optional transparency for regulatory compliance. A holder can prove the amount inside a commitment to an auditor using a separate ViewKeyCircuit that proves `commitment == MiMC(amount, blinding)` without revealing the blinding factor publicly. The amount is a public input to the proof.

## ZK Circuits

### TransferCircuit

| Input | Visibility | Count | Description |
|-------|-----------|-------|-------------|
| `OldNullifiers` | Public | 2 | Nullifiers for consumed UTXOs |
| `NewCommitments` | Public | 2 | Commitments for new UTXOs |
| `MerkleRoot` | Public | 1 | Root of the commitment tree |
| `OldAmounts` | Private | 2 | Amounts in consumed UTXOs |
| `OldBlindings` | Private | 2 | Blinding factors for old commitments |
| `OldSecrets` | Private | 2 | Secrets for nullifier derivation |
| `NewAmounts` | Private | 2 | Amounts in new UTXOs |
| `NewBlindings` | Private | 2 | Blinding factors for new commitments |
| `MerklePaths` | Private | 2x32 | Sibling hashes along Merkle paths |
| `MerkleIndices` | Private | 2x32 | Left/right indicators per level |

### UnshieldCircuit

| Input | Visibility | Description |
|-------|-----------|-------------|
| `Nullifier` | Public | Nullifier for the consumed UTXO |
| `Commitment` | Public | The commitment being consumed |
| `Amount` | Public | Withdrawal amount (so chain can send coins) |
| `MerkleRoot` | Public | Root of the commitment tree |
| `Blinding` | Private | Blinding factor |
| `Secret` | Private | Secret for nullifier derivation |
| `MerklePath` | Private | 32 sibling hashes |
| `MerkleIndices` | Private | 32 left/right indicators |

## Messages

| Message | Description |
|---------|-------------|
| `MsgShield` | Deposit public tokens into the private pool (burns from sender) |
| `MsgUnshield` | Withdraw private tokens to a public balance (requires ZK proof) |
| `MsgPrivateTransfer` | 2-in-2-out private transfer with ZK proof |
| `MsgBatchPrivateTransfer` | Multiple private transfers in one transaction |
| `MsgRegisterViewKey` | Register a view key for optional transparency |

## Queries

| Query | Description |
|-------|-------------|
| `QueryNullifierExists` | Check if a nullifier has been spent (double-spend detection) |
| `QueryCommitmentIndex` | Get the Merkle tree leaf index for a commitment |
| `QueryMerkleProof` | Get a Merkle inclusion proof for a given index |
| `QueryMerkleRoot` | Get the current Merkle tree root |
| `QueryRootHistory` | Get historical Merkle tree roots (allows slightly stale proofs) |
| `QueryTreeStats` | Get tree size, depth, and leaf count |
| `QueryViewKey` | Retrieve a registered view key for a commitment |

## State Keys

| Key Prefix | Type | Description |
|------------|------|-------------|
| `commitments` | `Map[uint64, bytes]` | Commitment store (index to commitment) |
| `nullifiers` | `Map[string, bool]` | Nullifier set (spent tracking) |
| `merkle_roots` | `Map[string, bool]` | Valid Merkle roots |
| `commitment_count` | `Sequence` | Total commitments / next leaf index |
| `merkle_tree` | `Map[string, bytes]` | Tree nodes keyed by `level:index` |
| `view_keys` | `Map[string, bytes]` | View keys (commitment hex to encrypted note) |
| `commitment_index` | `Map[string, uint64]` | Reverse index (commitment hex to leaf index) |
| `h_privacy` | `Map[uint64, string]` | Ordered root history |
| `ptx_count` | `Map[int64, uint64]` | Per-block privacy tx counter |

## CLI Examples

### Shield tokens

```bash
clawchaind tx privacy shield 50000000uclaw \
  --from mykey
```

### Private transfer

```bash
clawchaind tx privacy private-transfer \
  --proof <zk-proof-hex> \
  --nullifiers <nullifier1-hex>,<nullifier2-hex> \
  --commitments <commitment1-hex>,<commitment2-hex> \
  --from mykey
```

### Check nullifier

```bash
clawchaind query privacy nullifier-exists <nullifier-hex>
```

### Get tree stats

```bash
clawchaind query privacy tree-stats
```

### Get Merkle root history

```bash
clawchaind query privacy root-history
```

## SDK Usage

```typescript
import { ClawChainClient } from "@clawchain/sdk";

const client = await ClawChainClient.connect("https://rpc.clawchain.io");

// Shield tokens into the private pool
await client.shield({
  amount: { denom: "uclaw", amount: "50000000" },
}, signer);

// Check tree stats
const stats = await client.getTreeStats();
console.log(`Tree depth: ${stats.depth}, leaves: ${stats.numLeaves}`);

// Check if a nullifier has been spent
const exists = await client.getNullifierExists("abc123...");
console.log(`Nullifier spent: ${exists}`);

// Get Merkle inclusion proof
const proof = await client.getMerkleProof(42);
```

For generating ZK proofs client-side, use the `ProofGenerator` class or the `clawproof` CLI binary:

```typescript
import { ProofGenerator } from "@clawchain/sdk";

const prover = new ProofGenerator({ binaryPath: "./clawproof" });
const proof = await prover.generateTransferProof({
  // ... circuit inputs
});
```

## Trusted Setup

The ZK circuits use Groth16 proofs which require a trusted setup ceremony:

- **Development**: single-party `groth16.Setup()` is used (NOT safe for production)
- **Production**: MPC ceremony keys loaded via `SetupFromArtifacts()` with multiple independent participants
- Three separate ceremonies are needed: one each for the Transfer, Unshield, and ViewKey circuits
- Keys are serialized/deserialized via the `SerializeProvingKey`/`DeserializeProvingKey` functions
- Batch verification (`BatchVerifyTransferProofs`) is supported for concurrent proof checking

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_privacy_tx_per_block` | 50 | Maximum privacy transactions per block (DoS protection) |

## Security Considerations

- **Double-spend prevention** -- nullifiers are checked against the spent set before any transfer is accepted
- **Stale proof tolerance** -- Merkle root history allows proofs generated against recent (but not current) roots
- **Rate limiting** -- per-block limit of 50 privacy transactions prevents ZK verification DoS
- **Range proofs** -- all amounts are constrained to 64-bit unsigned integers, preventing overflow attacks
- **View keys** -- optional auditability for regulatory compliance without compromising privacy for all users
- **MPC trusted setup** -- production deployment requires multiple independent ceremony participants

## Related Pages

- [Agent Module](/docs/modules/agent) -- Agents can shield earnings for privacy
- [TypeScript SDK](/docs/sdk/overview) -- SDK methods for shield/unshield/transfer
- [REST API Reference](/docs/api/rest-api) -- HTTP endpoints for privacy queries
