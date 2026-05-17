// Package circuit defines the gnark circuit for private UTXO transfers
// using a 2-in-2-out model with MiMC hash and Groth16 proofs on BN254.
package circuit

import (
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/hash/mimc"
)

// MerkleTreeDepth is the fixed depth of the Merkle tree used for commitments.
const MerkleTreeDepth = 32

// TransferCircuit defines the 2-in-2-out private transfer circuit.
//
// Public inputs:
//   - OldNullifiers[2]: nullifiers for the two consumed UTXOs
//   - NewCommitments[2]: commitments for the two newly created UTXOs
//   - MerkleRoot: the root of the commitment Merkle tree
//
// Private inputs:
//   - OldAmounts[2], OldBlindings[2], OldSecrets[2]: preimages for old commitments
//   - NewAmounts[2], NewBlindings[2]: preimages for new commitments
//   - MerklePaths[2][MerkleTreeDepth]: sibling hashes along the Merkle path
//   - MerkleIndices[2][MerkleTreeDepth]: left(0)/right(1) indicators for each level
type TransferCircuit struct {
	// Public inputs
	OldNullifiers  [2]frontend.Variable `gnark:",public"`
	NewCommitments [2]frontend.Variable `gnark:",public"`
	MerkleRoot     frontend.Variable    `gnark:",public"`

	// Private inputs - old UTXOs
	OldAmounts  [2]frontend.Variable
	OldBlindings [2]frontend.Variable
	OldSecrets  [2]frontend.Variable

	// Private inputs - new UTXOs
	NewAmounts  [2]frontend.Variable
	NewBlindings [2]frontend.Variable

	// Private inputs - Merkle proofs for old commitments
	MerklePaths   [2][MerkleTreeDepth]frontend.Variable
	MerkleIndices [2][MerkleTreeDepth]frontend.Variable
}

// Define implements the gnark frontend.Circuit interface.
// It constrains the following properties:
//  1. Balance conservation: sum of old amounts == sum of new amounts
//  2. Commitment validity: each old commitment = MiMC(amount, blinding)
//  3. Nullifier derivation: each nullifier = MiMC(secret, commitment)
//  4. Merkle inclusion: each old commitment is in the tree with the given root
//  5. New commitment validity: each new commitment = MiMC(amount, blinding)
func (c *TransferCircuit) Define(api frontend.API) error {
	// 1. Balance conservation: oldAmounts[0] + oldAmounts[1] == newAmounts[0] + newAmounts[1]
	oldSum := api.Add(c.OldAmounts[0], c.OldAmounts[1])
	newSum := api.Add(c.NewAmounts[0], c.NewAmounts[1])
	api.AssertIsEqual(oldSum, newSum)

	// Range proofs: constrain all amounts to [0, 2^64)
	for i := 0; i < 2; i++ {
		api.ToBinary(c.OldAmounts[i], 64)
		api.ToBinary(c.NewAmounts[i], 64)
	}

	// Process each old UTXO
	for i := 0; i < 2; i++ {
		// 2. Recompute old commitment = MiMC(amount, blinding)
		hCommit, err := mimc.NewMiMC(api)
		if err != nil {
			return err
		}
		hCommit.Write(c.OldAmounts[i], c.OldBlindings[i])
		oldCommitment := hCommit.Sum()

		// 3. Verify nullifier = MiMC(secret, commitment)
		hNull, err := mimc.NewMiMC(api)
		if err != nil {
			return err
		}
		hNull.Write(c.OldSecrets[i], oldCommitment)
		computedNullifier := hNull.Sum()
		api.AssertIsEqual(computedNullifier, c.OldNullifiers[i])

		// 4. Merkle inclusion proof: walk from leaf to root
		current := oldCommitment
		for level := 0; level < MerkleTreeDepth; level++ {
			sibling := c.MerklePaths[i][level]
			index := c.MerkleIndices[i][level]

			// If index == 0, current is left child; if index == 1, current is right child
			// left = Select(index, sibling, current)  -> if index==1, left=sibling, else left=current
			// right = Select(index, current, sibling) -> if index==1, right=current, else right=sibling
			left := api.Select(index, sibling, current)
			right := api.Select(index, current, sibling)

			hLevel, err := mimc.NewMiMC(api)
			if err != nil {
				return err
			}
			hLevel.Write(left, right)
			current = hLevel.Sum()
		}
		api.AssertIsEqual(current, c.MerkleRoot)
	}

	// 5. Verify new commitments
	for i := 0; i < 2; i++ {
		hNew, err := mimc.NewMiMC(api)
		if err != nil {
			return err
		}
		hNew.Write(c.NewAmounts[i], c.NewBlindings[i])
		computedNewCommitment := hNew.Sum()
		api.AssertIsEqual(computedNewCommitment, c.NewCommitments[i])
	}

	return nil
}

// UnshieldCircuit defines a simplified circuit for unshielding (withdrawal).
// It proves ownership of a single UTXO commitment in the Merkle tree.
//
// Public inputs:
//   - Nullifier: the nullifier for the consumed UTXO
//   - Commitment: the commitment being consumed
//   - Amount: the amount being withdrawn (public so the chain can send coins)
//   - MerkleRoot: the root of the commitment Merkle tree
//
// Private inputs:
//   - Blinding: the blinding factor of the commitment
//   - Secret: the secret used to derive the nullifier
//   - MerklePath[MerkleTreeDepth]: sibling hashes
//   - MerkleIndices[MerkleTreeDepth]: left/right indicators
type UnshieldCircuit struct {
	// Public inputs
	Nullifier  frontend.Variable `gnark:",public"`
	Commitment frontend.Variable `gnark:",public"`
	Amount     frontend.Variable `gnark:",public"`
	MerkleRoot frontend.Variable `gnark:",public"`

	// Private inputs
	Blinding      frontend.Variable
	Secret        frontend.Variable
	MerklePath    [MerkleTreeDepth]frontend.Variable
	MerkleIndices [MerkleTreeDepth]frontend.Variable
}

// Define implements the gnark frontend.Circuit interface for unshielding.
func (c *UnshieldCircuit) Define(api frontend.API) error {
	// Range proof: constrain amount to [0, 2^64)
	api.ToBinary(c.Amount, 64)

	// 1. Verify commitment = MiMC(amount, blinding)
	hCommit, err := mimc.NewMiMC(api)
	if err != nil {
		return err
	}
	hCommit.Write(c.Amount, c.Blinding)
	computedCommitment := hCommit.Sum()
	api.AssertIsEqual(computedCommitment, c.Commitment)

	// 2. Verify nullifier = MiMC(secret, commitment)
	hNull, err := mimc.NewMiMC(api)
	if err != nil {
		return err
	}
	hNull.Write(c.Secret, computedCommitment)
	computedNullifier := hNull.Sum()
	api.AssertIsEqual(computedNullifier, c.Nullifier)

	// 3. Merkle inclusion proof
	current := computedCommitment
	for level := 0; level < MerkleTreeDepth; level++ {
		sibling := c.MerklePath[level]
		index := c.MerkleIndices[level]

		left := api.Select(index, sibling, current)
		right := api.Select(index, current, sibling)

		hLevel, err := mimc.NewMiMC(api)
		if err != nil {
			return err
		}
		hLevel.Write(left, right)
		current = hLevel.Sum()
	}
	api.AssertIsEqual(current, c.MerkleRoot)

	return nil
}

// ViewKeyCircuit proves that a commitment was correctly formed from
// a known amount and blinding factor. This enables selective disclosure:
// a holder can prove the amount inside a commitment to an auditor
// without revealing the blinding factor publicly.
//
// Public inputs:
//   - Commitment: the Pedersen-like commitment (MiMC hash)
//   - Amount: the disclosed amount
//
// Private inputs:
//   - Blinding: the blinding factor
type ViewKeyCircuit struct {
	// Public inputs
	Commitment frontend.Variable `gnark:",public"`
	Amount     frontend.Variable `gnark:",public"`

	// Private inputs
	Blinding frontend.Variable
}

// Define implements the gnark frontend.Circuit interface for view key proofs.
func (c *ViewKeyCircuit) Define(api frontend.API) error {
	// Range proof: constrain amount to [0, 2^64)
	api.ToBinary(c.Amount, 64)

	// Verify commitment == MiMC(amount, blinding)
	hCommit, err := mimc.NewMiMC(api)
	if err != nil {
		return err
	}
	hCommit.Write(c.Amount, c.Blinding)
	computedCommitment := hCommit.Sum()
	api.AssertIsEqual(computedCommitment, c.Commitment)

	return nil
}
