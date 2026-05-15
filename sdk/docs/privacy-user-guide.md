# ClawChain Privacy User Guide

## Overview

ClawChain's privacy module uses zero-knowledge proofs (Groth16 on BN254) to enable private token transfers. The system is based on a UTXO-like commitment scheme with a Merkle tree.

## Key Concepts

### Commitment
A cryptographic commitment binds a token amount to a blinding factor. The commitment is stored on-chain in a Merkle tree, but the amount and blinding factor remain private.

```
commitment = Hash(amount || blinding || owner)
```

### Blinding Factor
A 32-byte random value generated client-side. The blinding factor is the "key" to your shielded tokens — if you lose it, you cannot unshield or transfer your tokens.

**Never share your blinding factor. Never send it to anyone.**

### Nullifier
When spending a commitment, a nullifier is published on-chain. The nullifier is derived from the commitment and prevents double-spending, but does not reveal which commitment was spent.

### Merkle Tree
All commitments are stored in a Merkle tree. When creating a proof, the prover demonstrates that their commitment exists in the tree without revealing which leaf it is.

## Operations

### 1. Shield (Deposit into Privacy Pool)

Shielding moves CLAW from your public balance into the privacy pool.

```typescript
import { ClawChainClient } from '@clawchain/sdk';
import { randomBytes } from 'crypto';

const client = new ClawChainClient({ ... });
await client.connect();

// Generate blinding factor (SAVE THIS!)
const blinding = randomBytes(32).toString('hex');
console.log('SAVE THIS BLINDING:', blinding);

const result = await client.shield({
  amount: '1000000',      // 1 CLAW in uclaw
  denom: 'uclaw',
  blinding: blinding,
});

console.log('Shield tx:', result.txHash);
// Store: { blinding, amount, txHash } securely
```

**Important:** Save the blinding factor and amount. You will need them to create proofs for transfers and unshielding.

### 2. Private Transfer

Transfer tokens within the privacy pool without revealing sender, recipient, or amount.

```typescript
// This requires generating a ZK proof off-chain
// The proof demonstrates knowledge of a valid commitment without revealing it

const result = await client.privateTransfer({
  proof: proofBytes,           // Groth16 proof (generated off-chain)
  nullifiers: [nullifier1],    // Nullifiers for spent commitments
  commitments: [newCommitment1, newCommitment2],  // New commitments
  root: merkleRoot,            // Merkle root at time of proof generation
});
```

### 3. Unshield (Withdraw from Privacy Pool)

Unshielding moves tokens from the privacy pool back to a public address.

```typescript
const result = await client.unshield({
  amount: '1000000',
  denom: 'uclaw',
  proof: proofBytes,           // ZK proof of commitment ownership
  nullifier: nullifierHex,     // Nullifier for the spent commitment
  recipient: 'claw1recipient...',
});
```

### 4. Batch Private Transfer

Transfer to multiple recipients in a single transaction for efficiency.

```typescript
const result = await client.batchPrivateTransfer({
  proof: proofBytes,
  nullifiers: [nullifier1, nullifier2],
  commitments: [commit1, commit2, commit3],
  root: merkleRoot,
});
```

## Querying Privacy Pool State

```typescript
// Get current Merkle tree statistics
const stats = await client.getTreeStats();
// { leafCount: 1234, depth: 20, root: '0x...' }

// Check if a nullifier has been spent
const spent = await client.nullifierExists('0xabc...');

// Get Merkle proof for a commitment
const proof = await client.getMerkleProof('0xdef...');

// Get root history (for proof generation)
const history = await client.getRootHistory(0, 50);
```

## Generating Proofs

### Using the ClawProof CLI

The `clawproof` CLI tool generates ZK proofs locally:

```bash
# Generate a shield proof
clawproof shield \
  --amount 1000000 \
  --blinding <hex> \
  --proving-key artifacts/shield_pk.bin

# Generate a transfer proof
clawproof transfer \
  --input-commitment <hex> \
  --input-blinding <hex> \
  --input-amount 1000000 \
  --output-amount-1 600000 \
  --output-blinding-1 <hex> \
  --output-amount-2 400000 \
  --output-blinding-2 <hex> \
  --merkle-proof <json> \
  --proving-key artifacts/transfer_pk.bin

# Generate an unshield proof
clawproof unshield \
  --commitment <hex> \
  --blinding <hex> \
  --amount 1000000 \
  --recipient claw1... \
  --merkle-proof <json> \
  --proving-key artifacts/unshield_pk.bin
```

### Using the SDK Proof Module

```typescript
import { generateShieldProof, generateTransferProof } from '@clawchain/sdk/proof';

const shieldProof = await generateShieldProof({
  amount: BigInt(1000000),
  blinding: blindingBytes,
  provingKey: provingKeyBuffer,
});
```

## Security Best Practices

1. **Generate blinding factors client-side** using cryptographically secure random bytes. Never use deterministic values.

2. **Store blinding factors securely.** Treat them like private keys. If lost, your shielded tokens are unrecoverable.

3. **Wait for finality** before considering a shield/unshield complete. Check that the transaction is included in a finalized block.

4. **Use batch transfers** when sending to multiple recipients to reduce on-chain footprint.

5. **Verify Merkle roots** are recent when generating proofs. Stale roots may be rejected by the chain.

## Rate Limits

The privacy module enforces per-block rate limits to prevent spam:
- Default: 50 privacy transactions per block
- Configurable via governance proposals

## Trusted Setup

The ZK proving and verifying keys were generated through a multi-party computation (MPC) ceremony. The ceremony transcript is published at `artifacts/ceremony-transcript.json`. As long as at least one participant destroyed their toxic waste, the setup is secure.

Verifying keys are embedded in the chain genesis and cannot be changed without a governance proposal.
