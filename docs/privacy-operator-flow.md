# Privacy Module Operator Flow

This document describes the complete operator workflow for the ClawChain privacy module. It covers the shield/unshield/private-transfer lifecycle, view key registration, Merkle tree querying, ZK proof generation, and troubleshooting.

All CLI commands use `clawchaind` for on-chain transactions and queries, and `clawproof` for off-chain ZK proof generation.

## Prerequisites

- A running ClawChain node with the privacy module enabled
- The `clawchaind` binary in your PATH
- The `clawproof` binary in your PATH (built from `cmd/clawproof`)
- A funded account with tokens (default denomination: `stake` or `uclaw`)
- Trusted setup keys generated (see "ZK Proof Generation Workflow" below)

## 1. Shield (Deposit into Shielded Pool)

Shielding moves public tokens into the privacy module's shielded pool, creating a commitment on the Merkle tree.

### Step 1a: Generate commitment data off-chain

```bash
clawproof shield --amount 1000 --blinding 42
```

Output (JSON):

```json
{
  "commitment": "<commitment_hex>",
  "amount": 1000,
  "blinding": 42,
  "msg": { "amount": 1000, "coins": "uclaw" }
}
```

Save the `commitment`, `amount`, and `blinding` values. You will need the `blinding` factor later for unshielding or transferring.

### Step 1b: Submit the shield transaction on-chain

```bash
clawchaind tx privacy shield 1000 uclaw \
  --from <your-key-name> \
  --chain-id clawchain \
  --gas auto \
  --gas-adjustment 1.5 \
  -y
```

Arguments:
- `1000` -- the amount to shield (uint64)
- `uclaw` -- the coin denomination

The chain will lock `1000uclaw` from your account into the privacy module account and insert a commitment into the Merkle tree. The transaction events will include the `commitment` hex, `leaf_index`, and updated `merkle_root`.

### Step 1c: Register a view key (optional but recommended)

After shielding, register an encrypted note so you can later retrieve your commitment details:

```bash
clawchaind tx privacy register-view-key <commitment_hex> <encrypted_note_data> \
  --from <your-key-name> \
  --chain-id clawchain \
  -y
```

Arguments:
- `<commitment_hex>` -- the commitment hex returned from the shield operation
- `<encrypted_note_data>` -- an arbitrary string (typically client-encrypted JSON containing amount, blinding, secret)

## 2. Unshield (Withdraw from Shielded Pool)

Unshielding withdraws tokens from the shielded pool back to a public address. This requires a Groth16 ZK proof proving ownership of the commitment.

### Step 2a: Run trusted setup (one time)

```bash
clawproof setup
```

This generates proving keys and verifying keys at `~/.clawchain/keys/`:
- `transfer_pk.bin`, `transfer_vk.bin` (for private transfers)
- `unshield_pk.bin`, `unshield_vk.bin` (for unshield operations)

### Step 2b: Prepare the Merkle tree file

Create a JSON file containing all current commitment leaves. You can build this from chain events or from the commitment index queries:

```json
{
  "leaves": [
    "<commitment_hex_0>",
    "<commitment_hex_1>",
    "..."
  ]
}
```

Save this as `merkle-tree.json`.

### Step 2c: Generate the unshield proof

```bash
clawproof unshield-proof \
  --amount 1000 \
  --blinding 42 \
  --secret 12345 \
  --merkle-tree merkle-tree.json \
  --keys-dir ~/.clawchain/keys
```

Output (JSON):

```json
{
  "proof": "<proof_hex>",
  "nullifier": "<nullifier_hex>",
  "commitment": "<commitment_hex>",
  "amount": 1000,
  "merkle_root": "<root_hex>"
}
```

Flags:
- `--amount` -- the amount stored in the commitment
- `--blinding` -- the blinding factor used when shielding
- `--secret` -- a secret value used to derive the nullifier (MiMC(secret, commitment))
- `--merkle-tree` -- path to the JSON file with all Merkle tree leaves
- `--keys-dir` -- directory containing the proving key files

### Step 2d: Submit the unshield transaction

```bash
clawchaind tx privacy unshield \
  <commitment_hex> \
  <nullifier_hex> \
  <proof_hex> \
  1000 \
  <recipient_address> \
  --from <your-key-name> \
  --chain-id clawchain \
  --gas auto \
  --gas-adjustment 1.5 \
  -y
```

Arguments (positional):
1. `<commitment_hex>` -- the commitment being consumed
2. `<nullifier_hex>` -- the nullifier for double-spend prevention
3. `<proof_hex>` -- the serialized Groth16 proof
4. `1000` -- the amount being withdrawn
5. `<recipient_address>` -- the bech32 address to receive the funds (defaults to sender if empty)

The chain will verify the ZK proof, mark the nullifier as spent, and send `1000stake` from the module account to the recipient.

## 3. Private Transfer (2-in-2-out UTXO Transfer)

A private transfer consumes two existing UTXOs and creates two new ones while proving balance conservation, all without revealing amounts.

### Step 3a: Compute commitments and nullifiers

Compute commitments for the inputs:

```bash
clawproof commitment --amount 500 --blinding 10
clawproof commitment --amount 500 --blinding 20
```

Compute nullifiers for spent commitments:

```bash
clawproof nullifier --secret 111 --commitment <old_commitment_0_hex>
clawproof nullifier --secret 222 --commitment <old_commitment_1_hex>
```

### Step 3b: Generate the transfer proof

```bash
clawproof transfer-proof \
  --old-amounts 500,500 \
  --old-blindings 10,20 \
  --old-secrets 111,222 \
  --new-amounts 700,300 \
  --new-blindings 30,40 \
  --merkle-tree merkle-tree.json \
  --leaf-indices 0,1 \
  --keys-dir ~/.clawchain/keys
```

Output (JSON):

```json
{
  "proof": "<proof_hex>",
  "old_nullifiers": ["<nullifier_0_hex>", "<nullifier_1_hex>"],
  "new_commitments": ["<new_commitment_0_hex>", "<new_commitment_1_hex>"],
  "merkle_root": "<root_hex>",
  "old_amounts": [500, 500],
  "new_amounts": [700, 300]
}
```

Important: The sum of old amounts (500+500=1000) must equal the sum of new amounts (700+300=1000). The circuit enforces balance conservation.

Flags:
- `--old-amounts` -- comma-separated pair of old UTXO amounts
- `--old-blindings` -- comma-separated pair of old blinding factors
- `--old-secrets` -- comma-separated pair of secrets for nullifier derivation
- `--new-amounts` -- comma-separated pair of new UTXO amounts
- `--new-blindings` -- comma-separated pair of new blinding factors
- `--merkle-tree` -- path to the Merkle tree JSON file
- `--leaf-indices` -- comma-separated pair of leaf indices for the old commitments
- `--keys-dir` -- directory containing the proving key files

### Step 3c: Submit the private transfer transaction

```bash
clawchaind tx privacy private-transfer \
  "<old_commitment_0_hex>,<old_commitment_1_hex>" \
  "<new_commitment_0_hex>,<new_commitment_1_hex>" \
  "<nullifier_0_hex>,<nullifier_1_hex>" \
  "<root_hex>" \
  "<proof_hex>" \
  --from <your-key-name> \
  --chain-id clawchain \
  --gas auto \
  --gas-adjustment 1.5 \
  -y
```

Arguments (positional, comma-separated where noted):
1. Old commitments (comma-separated pair)
2. New commitments (comma-separated pair)
3. Nullifiers (comma-separated pair)
4. Merkle root
5. Proof hex

### Step 3d: Batch private transfer (optional)

For multiple transfers in a single transaction (up to 16), use the `BatchPrivateTransfer` message via gRPC or the SDK. Each entry in the batch follows the same 2-in-2-out structure. Batch verification runs proofs concurrently for better throughput.

## 4. View Key Registration and Querying

View keys allow selective disclosure: you store an encrypted note on-chain tied to a commitment, and only the holder of the decryption key can read it.

### Register a view key

```bash
clawchaind tx privacy register-view-key \
  <commitment_hex> \
  "<encrypted_note_json>" \
  --from <your-key-name> \
  --chain-id clawchain \
  -y
```

### Query a view key

```bash
clawchaind q privacy view-key <commitment_hex>
```

Response:

```json
{
  "encrypted_note": "<encrypted_note_data>",
  "found": true
}
```

REST endpoint: `GET /clawchain/privacy/v1/view_key/{commitment_hex}`

## 5. Merkle Tree Querying

### Query the current Merkle root

```bash
clawchaind q privacy merkle-root
```

Response:

```json
{
  "root": "<root_hex>"
}
```

REST endpoint: `GET /clawchain/privacy/v1/merkle_root`

### Query tree statistics

```bash
clawchaind q privacy tree-stats
```

Response:

```json
{
  "leaf_count": 42,
  "current_root": "<root_hex>",
  "tree_depth": 32
}
```

REST endpoint: `GET /clawchain/privacy/v1/tree_stats`

### Query a Merkle proof for a commitment

```bash
clawchaind q privacy merkle-proof <commitment_hex>
```

Response:

```json
{
  "leaf_index": 3,
  "path": ["<sibling_hex_0>", "<sibling_hex_1>", "..."],
  "indices": [0, 1, 0, "..."],
  "root": "<root_hex>",
  "found": true
}
```

REST endpoint: `GET /clawchain/privacy/v1/merkle_proof/{commitment_hex}`

### Query a commitment leaf index

```bash
clawchaind q privacy commitment-index <commitment_hex>
```

REST endpoint: `GET /clawchain/privacy/v1/commitment_index/{commitment_hex}`

### Check if a nullifier has been spent

```bash
clawchaind q privacy nullifier-exists <nullifier_hex>
```

Response:

```json
{
  "exists": true
}
```

REST endpoint: `GET /clawchain/privacy/v1/nullifier_exists/{nullifier}`

### Query root history (paginated)

```bash
clawchaind q privacy root-history 0 10
```

Arguments:
1. `offset` -- pagination offset
2. `limit` -- page size

Response:

```json
{
  "roots": ["<root_hex_0>", "<root_hex_1>", "..."],
  "next_offset": 10,
  "total": 42
}
```

REST endpoint: `GET /clawchain/privacy/v1/root_history/{offset}/{limit}`

### Query module parameters

```bash
clawchaind q privacy params
```

REST endpoint: `GET /clawchain/privacy/v1/params`

## 6. ZK Proof Generation Workflow

### Architecture

ClawChain uses Groth16 zero-knowledge proofs on the BN254 elliptic curve. There are three circuit types:

1. **TransferCircuit** -- 2-in-2-out private transfers with balance conservation, commitment validity, nullifier derivation, and Merkle inclusion proofs
2. **UnshieldCircuit** -- single-input withdrawal proving ownership of a commitment in the Merkle tree
3. **ViewKeyCircuit** -- selective disclosure proof that a commitment contains a specific amount

All circuits use the MiMC hash function for:
- Commitment computation: `commitment = MiMC(amount, blinding)`
- Nullifier derivation: `nullifier = MiMC(secret, commitment)`
- Merkle tree internal nodes: `parent = MiMC(left_child, right_child)`

The Merkle tree has a fixed depth of 32 levels, supporting up to 2^32 commitments.

### Trusted setup

Run the trusted setup once to generate proving and verifying keys:

```bash
clawproof setup
```

Keys are saved to `~/.clawchain/keys/`:
- `transfer_pk.bin` -- Transfer circuit proving key
- `transfer_vk.bin` -- Transfer circuit verifying key
- `unshield_pk.bin` -- Unshield circuit proving key
- `unshield_vk.bin` -- Unshield circuit verifying key

The verifying keys are loaded by the chain node at startup. The proving keys are used only by the off-chain `clawproof` tool.

### Proof generation flow

1. Compute commitment and nullifier values using `clawproof commitment` and `clawproof nullifier`
2. Maintain a local copy of the Merkle tree leaves (from chain events or queries)
3. Generate the proof using `clawproof unshield-proof` or `clawproof transfer-proof`
4. Submit the transaction with the proof to the chain via `clawchaind tx privacy`

### Batch proof verification

For batch private transfers, the chain verifies all proofs concurrently using goroutines. The maximum batch size is 16 transfers per message. Cross-batch nullifier collision checks are performed before verification to prevent double-spend within a single batch.

## 7. Troubleshooting

### "proof verification failed"

- Ensure the proving key matches the verifying key loaded by the node (both must come from the same trusted setup run)
- Verify that the Merkle tree leaves file is complete and in the correct order
- Confirm the `--amount`, `--blinding`, and `--secret` values match what was used during shielding
- Check that the root used in the proof is a recognized root on-chain: `clawchaind q privacy merkle-root`

### "nullifier already used"

The nullifier has already been spent. Each commitment can only be consumed once. Query:

```bash
clawchaind q privacy nullifier-exists <nullifier_hex>
```

### "root not recognized"

The Merkle root provided in the transfer proof is not in the chain's root history. This can happen if:
- The Merkle tree leaves file is out of date (missing recent commitments)
- A new shield or transfer occurred between proof generation and submission

Solution: rebuild the Merkle tree file from the latest chain state and regenerate the proof.

### "amount must be greater than zero"

Shield and unshield operations require a positive amount. Ensure the `--amount` flag is set and non-zero.

### "invalid commitment hex" / "invalid nullifier hex"

Hex strings must be lowercase, even-length, and valid hexadecimal. Strip any `0x` prefix before submitting.

### "unshield verifying key not initialized" / "transfer verifying key not initialized"

The node did not load the verifying keys at startup. Ensure the trusted setup has been run and the key files are in the expected location (`~/.clawchain/keys/`). Restart the node after placing the key files.

### "merkle tree is full"

The tree has reached its maximum capacity of 2^32 leaves. This is extremely unlikely in practice.

### "insufficient funds"

For shield operations, ensure your account has enough tokens. For unshield operations, ensure the privacy module account has sufficient balance (it should if the shield was successful).

### "escrow expired" (not a privacy error)

This error comes from the marketplace module, not privacy. See the marketplace operator flow documentation.

### Checking commitment existence

To verify a commitment was inserted into the tree:

```bash
clawchaind q privacy commitment-index <commitment_hex>
```

If `found: false`, the commitment was not inserted. Check transaction events for errors.

### Verifying tree integrity

Compare the tree stats with your local tree:

```bash
clawchaind q privacy tree-stats
```

The `leaf_count` should match the number of successful shield and transfer operations, and `current_root` should match your locally computed root.
