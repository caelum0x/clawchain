---
sidebar_position: 3
title: Privacy Module API
---

# Privacy Module API

The Privacy module implements zero-knowledge shielded transactions on ClawChain using a Merkle commitment tree and nullifier-based double-spend prevention.

**Proto package:** `clawchain.privacy.v1`
**Base path:** `/clawchain/privacy/v1`

---

## Query Endpoints

### GET /clawchain/privacy/v1/params

Returns the privacy module parameters.

**Response:**

```json
{
  "params": {
    "max_privacy_tx_per_block": "0"
  }
}
```

A value of `0` for `max_privacy_tx_per_block` means unlimited privacy transactions per block.

---

### GET /clawchain/privacy/v1/merkle_root

Returns the current Merkle tree root hash.

**Response:**

```json
{
  "root": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890"
}
```

---

### GET /clawchain/privacy/v1/nullifier_exists/\{nullifier\}

Checks whether a nullifier has already been spent.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `nullifier` | string | Hex-encoded nullifier hash |

**Response:**

```json
{
  "exists": true
}
```

This is the primary double-spend prevention check. If `exists` is `true`, the nullifier has been used and the associated commitment cannot be spent again.

---

### GET /clawchain/privacy/v1/root_history/\{offset\}/\{limit\}

Returns an ordered range of historical Merkle roots. Also available without path params at `/clawchain/privacy/v1/root_history`.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `offset` | uint64 | Number of entries to skip |
| `limit` | uint64 | Maximum entries to return |

**Response:**

```json
{
  "roots": [
    "0x1a2b3c...",
    "0x2b3c4d...",
    "0x3c4d5e..."
  ],
  "next_offset": "3",
  "total": "150"
}
```

Root history is critical for verifying proofs constructed against older tree states. The chain retains a rolling window of historical roots.

---

### GET /clawchain/privacy/v1/tree_stats

Returns statistics about the Merkle commitment tree.

**Response:**

```json
{
  "leaf_count": "42",
  "current_root": "0x1a2b3c4d...",
  "tree_depth": 20
}
```

| Field | Description |
|-------|-------------|
| `leaf_count` | Total number of commitments inserted into the tree |
| `current_root` | Current Merkle root hash |
| `tree_depth` | Depth of the Merkle tree (fixed at 20, supports ~1M leaves) |

---

### GET /clawchain/privacy/v1/view_key/\{commitment_hex\}

Queries a registered encrypted note by its commitment hash.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `commitment_hex` | string | Hex-encoded commitment hash |

**Response:**

```json
{
  "encrypted_note": "base64encodedciphertext...",
  "found": true
}
```

View keys allow the recipient to decrypt the note (which contains the amount and blinding factor) needed to spend the commitment later.

---

### GET /clawchain/privacy/v1/merkle_proof/\{commitment_hex\}

Returns a Merkle inclusion proof for a commitment.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `commitment_hex` | string | Hex-encoded commitment hash |

**Response:**

```json
{
  "leaf_index": "7",
  "path": [
    "0xaabb...",
    "0xccdd...",
    "0xeeff..."
  ],
  "indices": ["1", "0", "1"],
  "root": "0x1a2b3c...",
  "found": true
}
```

| Field | Description |
|-------|-------------|
| `leaf_index` | Position of the commitment in the tree |
| `path` | Sibling hashes along the path to the root |
| `indices` | Left (0) or right (1) direction at each level |
| `root` | The root at the time of proof generation |

This proof is required to construct valid private transfer and unshield transactions.

---

### GET /clawchain/privacy/v1/commitment_index/\{commitment_hex\}

Returns the leaf index of a commitment in the Merkle tree.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `commitment_hex` | string | Hex-encoded commitment hash |

**Response:**

```json
{
  "leaf_index": "7",
  "found": true
}
```

---

### POST /clawchain/privacy/v1/verify_amount_proof

Verifies a zero-knowledge amount disclosure proof for a commitment. This allows selective disclosure of shielded amounts without revealing the full note.

**Request Body:**

```json
{
  "commitment_hex": "0x1a2b3c...",
  "amount": "1000000",
  "proof": "<base64-encoded-zk-proof>"
}
```

**Response:**

```json
{
  "valid": true
}
```

---

## Transaction Messages

### MsgShield

Converts public tokens into a shielded commitment. Burns `amount` uclaw from the sender and inserts a Pedersen commitment into the Merkle tree.

**Type URL:** `/clawchain.privacy.v1.MsgShield`
**Signer:** `creator`

```json
{
  "@type": "/clawchain.privacy.v1.MsgShield",
  "creator": "claw1abc123...",
  "amount": "1000000",
  "coins": "1000000uclaw",
  "blinding": "<base64-encoded-32-byte-random>"
}
```

| Field | Description |
|-------|-------------|
| `amount` | Amount in uclaw to shield |
| `coins` | Coin string (must match `amount` + denom) |
| `blinding` | 32-byte cryptographic random blinding factor (CSPRNG). **Must be generated client-side.** Empty blinding is rejected. |

The resulting commitment is `Pedersen(amount, blinding) = amount * G + blinding * H`.

---

### MsgUnshield

Converts a shielded commitment back to public tokens. Requires a valid ZK proof that the sender knows the preimage of the commitment and the Merkle inclusion proof.

**Type URL:** `/clawchain.privacy.v1.MsgUnshield`
**Signer:** `creator`

```json
{
  "@type": "/clawchain.privacy.v1.MsgUnshield",
  "creator": "claw1abc123...",
  "commitment": "0x1a2b3c...",
  "nullifier": "0x4d5e6f...",
  "proof": "<base64-encoded-zk-proof>",
  "amount": "1000000",
  "recipient": "claw1recipient...",
  "root": "0x7890ab..."
}
```

| Field | Description |
|-------|-------------|
| `commitment` | The commitment being spent |
| `nullifier` | Unique nullifier derived from the commitment (prevents double-spend) |
| `proof` | ZK proof of knowledge of (amount, blinding) and Merkle inclusion |
| `amount` | Amount to unshield |
| `recipient` | Address to receive the unshielded tokens |
| `root` | Merkle root the proof was constructed against (must be in root history) |

---

### MsgPrivateTransfer

Performs a shielded transfer: spends old commitments and creates new ones without revealing amounts.

**Type URL:** `/clawchain.privacy.v1.MsgPrivateTransfer`
**Signer:** `creator`

```json
{
  "@type": "/clawchain.privacy.v1.MsgPrivateTransfer",
  "creator": "claw1abc123...",
  "old_commitments": "0xaabb...,0xccdd...",
  "new_commitments": "0xeeff...,0x1122...",
  "nullifiers": "0x3344...,0x5566...",
  "root": "0x7890ab...",
  "proof": "<base64-encoded-zk-proof>"
}
```

| Field | Description |
|-------|-------------|
| `old_commitments` | Comma-separated hex commitment hashes being spent |
| `new_commitments` | Comma-separated hex new commitment hashes being created |
| `nullifiers` | Comma-separated hex nullifiers for the old commitments |
| `root` | Merkle root against which the proof was constructed |
| `proof` | ZK proof that inputs = outputs and the sender owns the old commitments |

---

### MsgBatchPrivateTransfer

Performs multiple private transfers in a single transaction for efficiency.

**Type URL:** `/clawchain.privacy.v1.MsgBatchPrivateTransfer`
**Signer:** `creator`

```json
{
  "@type": "/clawchain.privacy.v1.MsgBatchPrivateTransfer",
  "creator": "claw1abc123...",
  "transfers": [
    {
      "old_commitments": "0xaabb...",
      "new_commitments": "0xccdd...,0xeeff...",
      "nullifiers": "0x1122...",
      "root": "0x3344...",
      "proof": "<zk-proof-1>"
    },
    {
      "old_commitments": "0x5566...",
      "new_commitments": "0x7788...",
      "nullifiers": "0x99aa...",
      "root": "0x3344...",
      "proof": "<zk-proof-2>"
    }
  ]
}
```

---

### MsgRegisterViewKey

Registers an encrypted note for a commitment, allowing the recipient to discover and decrypt it using their view key.

**Type URL:** `/clawchain.privacy.v1.MsgRegisterViewKey`
**Signer:** `creator`

```json
{
  "@type": "/clawchain.privacy.v1.MsgRegisterViewKey",
  "creator": "claw1sender...",
  "commitment_hex": "0x1a2b3c...",
  "encrypted_note": "base64encryptednote..."
}
```

---

### MsgUpdateParams

Governance-only operation to update privacy module parameters.

**Type URL:** `/clawchain.privacy.v1.MsgUpdateParams`
**Signer:** `authority`

```json
{
  "@type": "/clawchain.privacy.v1.MsgUpdateParams",
  "authority": "claw10d07y265gmmuvt4z0w9aw880jnsr700j7g7ejq",
  "params": {
    "max_privacy_tx_per_block": "100"
  }
}
```

---

## Privacy Flow Overview

```
1. Shield:  Public tokens  -->  Commitment in Merkle tree
2. Transfer: Old commitments --> New commitments (ZK proof)
3. Unshield: Commitment  -->  Public tokens to recipient

                  Shield
                    |
                    v
             ┌──────────────┐
             │  Merkle Tree  │
             │  (commitments)│
             └──────┬───────┘
                    │
         ┌──────────┼──────────┐
         │                     │
    Private Transfer       Unshield
    (ZK proof)            (ZK proof + nullifier)
         │                     │
         v                     v
   New commitments      Public tokens
```
