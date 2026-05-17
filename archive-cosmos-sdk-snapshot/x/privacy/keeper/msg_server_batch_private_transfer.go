package keeper

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"

	"clawchain/x/privacy/circuit"
	"clawchain/x/privacy/types"

	errorsmod "cosmossdk.io/errors"
	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/witness"
	"github.com/consensys/gnark/frontend"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

const (
	maxBatchSize = 16
)

// parsedTransferEntry holds the parsed data from a single BatchTransferEntry.
type parsedTransferEntry struct {
	nullifierHexes     []string
	newCommitmentHexes []string
	proof              groth16.Proof
	publicWitness      witness.Witness
}

func (k msgServer) BatchPrivateTransfer(ctx context.Context, msg *types.MsgBatchPrivateTransfer) (*types.MsgBatchPrivateTransferResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	if len(msg.Transfers) == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "batch must contain at least 1 transfer")
	}
	if len(msg.Transfers) > maxBatchSize {
		return nil, errorsmod.Wrapf(types.ErrInvalidProof, "batch size %d exceeds maximum of %d", len(msg.Transfers), maxBatchSize)
	}

	// Phase 1: Parse and validate all entries.
	entries := make([]parsedTransferEntry, len(msg.Transfers))
	var allProofs []groth16.Proof
	var allWitnesses []witness.Witness

	for i, transfer := range msg.Transfers {
		parsed, err := k.parseTransferEntry(ctx, &transfer)
		if err != nil {
			return nil, errorsmod.Wrapf(err, "transfer entry %d", i)
		}
		entries[i] = *parsed
		allProofs = append(allProofs, parsed.proof)
		allWitnesses = append(allWitnesses, parsed.publicWitness)
	}

	// Phase 2: Cross-batch collision check — verify no duplicate nullifiers within the batch.
	seenNullifiers := make(map[string]bool)
	for i, entry := range entries {
		for _, nfHex := range entry.nullifierHexes {
			if seenNullifiers[nfHex] {
				return nil, errorsmod.Wrapf(types.ErrNullifierAlreadyUsed, "duplicate nullifier %s in batch entry %d", nfHex, i)
			}
			seenNullifiers[nfHex] = true
		}
	}

	// Phase 3: Batch verify all proofs concurrently.
	if k.VKs.TransferVK == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "transfer verifying key not initialized")
	}

	if err := circuit.BatchVerifyTransferProofs(k.VKs.TransferVK, allProofs, allWitnesses); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, fmt.Sprintf("batch proof verification failed: %v", err))
	}

	// Phase 4: Apply state — store nullifiers, commitments, update Merkle tree.
	for _, entry := range entries {
		// Store nullifiers as spent.
		for _, nfHex := range entry.nullifierHexes {
			if err := k.Nullifiers.Set(ctx, nfHex, true); err != nil {
				return nil, errorsmod.Wrap(types.ErrInvalidProof, "failed to store nullifier")
			}
		}

		// Add new commitments to the Merkle tree.
		for j, cmHex := range entry.newCommitmentHexes {
			cmBytes, _ := hex.DecodeString(cmHex)
			commitmentVal := new(big.Int).SetBytes(cmBytes)

			leafIndex, err := k.CommitmentCount.Next(ctx)
			if err != nil {
				return nil, errorsmod.Wrapf(types.ErrInvalidCommitment, "failed to get next index for commitment %d", j)
			}

			if err := k.Commitments.Set(ctx, leafIndex, cmBytes); err != nil {
				return nil, errorsmod.Wrapf(types.ErrInvalidCommitment, "failed to store commitment %d", j)
			}

			if err := k.CommitmentIndex.Set(ctx, cmHex, leafIndex); err != nil {
				return nil, errorsmod.Wrapf(types.ErrInvalidCommitment, "failed to store commitment index %d", j)
			}

			if err := k.insertLeafAndUpdateTree(ctx, leafIndex, commitmentVal); err != nil {
				return nil, errorsmod.Wrapf(types.ErrMerkleTreeFull, "failed to insert commitment %d into tree", j)
			}
		}
	}

	// Compute and store the new Merkle root after all entries are applied.
	newRoot, err := k.computeRootFromState(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidCommitment, "failed to compute new merkle root")
	}
	newRootHex := hex.EncodeToString(newRoot.Bytes())
	if err := k.MerkleRoots.Set(ctx, newRootHex, true); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidCommitment, "failed to store new merkle root")
	}

	// Emit event.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"batch_private_transfer",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("batch_size", fmt.Sprintf("%d", len(msg.Transfers))),
			sdk.NewAttribute("new_merkle_root", newRootHex),
		),
	)

	return &types.MsgBatchPrivateTransferResponse{}, nil
}

// parseTransferEntry validates and parses a single BatchTransferEntry.
func (k msgServer) parseTransferEntry(ctx context.Context, entry *types.BatchTransferEntry) (*parsedTransferEntry, error) {
	// Parse nullifiers.
	nullifierHexes := strings.Split(entry.Nullifiers, ",")
	if len(nullifierHexes) != 2 {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "expected exactly 2 nullifiers")
	}

	cleanNullifiers := make([]string, len(nullifierHexes))
	for i, nfHex := range nullifierHexes {
		nfHex = strings.ToLower(strings.TrimSpace(nfHex))
		nfBytes, err := hex.DecodeString(nfHex)
		if err != nil || len(nfBytes) == 0 {
			return nil, errorsmod.Wrapf(types.ErrInvalidProof, "invalid nullifier hex: %s", nfHex)
		}
		cleanNullifiers[i] = nfHex
	}

	// Check that nullifiers have not been used on-chain.
	for _, nfHex := range cleanNullifiers {
		exists, err := k.Nullifiers.Has(ctx, nfHex)
		if err != nil {
			return nil, errorsmod.Wrap(types.ErrInvalidProof, "failed to check nullifier")
		}
		if exists {
			return nil, errorsmod.Wrapf(types.ErrNullifierAlreadyUsed, "nullifier %s", nfHex)
		}
	}

	rootHex, err := k.ValidateKnownRoot(ctx, entry.Root)
	if err != nil {
		return nil, err
	}

	// Deserialize the Groth16 proof.
	proofBytes, err := hex.DecodeString(entry.Proof)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrDeserializeProof, "proof is not valid hex")
	}
	proof, err := circuit.DeserializeProof(proofBytes)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrDeserializeProof, err.Error())
	}

	// Parse new commitments.
	newCommitmentHexes := strings.Split(entry.NewCommitments, ",")
	if len(newCommitmentHexes) != 2 {
		return nil, errorsmod.Wrap(types.ErrInvalidCommitment, "expected exactly 2 new commitments")
	}
	cleanCommitments := make([]string, len(newCommitmentHexes))
	for i, cmHex := range newCommitmentHexes {
		cmHex = strings.ToLower(strings.TrimSpace(cmHex))
		cmBytes, err := hex.DecodeString(cmHex)
		if err != nil || len(cmBytes) == 0 {
			return nil, errorsmod.Wrapf(types.ErrInvalidCommitment, "invalid commitment hex: %s", cmHex)
		}
		cleanCommitments[i] = cmHex
	}

	// Build the public witness.
	var publicAssignment circuit.TransferCircuit

	for i, nfHex := range cleanNullifiers {
		nfBytes, err := hex.DecodeString(nfHex)
		if err != nil {
			return nil, errorsmod.Wrapf(types.ErrInvalidProof, "invalid nullifier hex: %s", nfHex)
		}
		publicAssignment.OldNullifiers[i] = new(big.Int).SetBytes(nfBytes)
	}

	for i, cmHex := range cleanCommitments {
		cmBytes, err := hex.DecodeString(cmHex)
		if err != nil {
			return nil, errorsmod.Wrapf(types.ErrInvalidCommitment, "invalid commitment hex: %s", cmHex)
		}
		publicAssignment.NewCommitments[i] = new(big.Int).SetBytes(cmBytes)
	}

	rootBytes, err := hex.DecodeString(rootHex)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidMerkleRoot, "invalid root hex")
	}
	publicAssignment.MerkleRoot = new(big.Int).SetBytes(rootBytes)

	publicWitness, err := frontend.NewWitness(&publicAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "failed to create public witness")
	}

	return &parsedTransferEntry{
		nullifierHexes:     cleanNullifiers,
		newCommitmentHexes: cleanCommitments,
		proof:              proof,
		publicWitness:      publicWitness,
	}, nil
}
