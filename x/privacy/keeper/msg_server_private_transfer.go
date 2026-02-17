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
	"github.com/consensys/gnark/frontend"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) PrivateTransfer(ctx context.Context, msg *types.MsgPrivateTransfer) (*types.MsgPrivateTransferResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Parse nullifiers (comma-separated hex strings).
	nullifierHexes := strings.Split(msg.Nullifiers, ",")
	if len(nullifierHexes) != 2 {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "expected exactly 2 nullifiers")
	}

	// Check that nullifiers have not been used (double-spend check).
	for _, nfHex := range nullifierHexes {
		nfHex = strings.TrimSpace(nfHex)
		exists, err := k.Nullifiers.Has(ctx, nfHex)
		if err != nil {
			return nil, errorsmod.Wrap(types.ErrInvalidProof, "failed to check nullifier")
		}
		if exists {
			return nil, errorsmod.Wrapf(types.ErrNullifierAlreadyUsed, "nullifier %s", nfHex)
		}
	}

	// Verify the Merkle root is valid.
	rootHex := strings.TrimSpace(msg.Root)
	rootValid, err := k.MerkleRoots.Has(ctx, rootHex)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidMerkleRoot, "failed to check merkle root")
	}
	if !rootValid {
		return nil, errorsmod.Wrapf(types.ErrInvalidMerkleRoot, "root %s not recognized", rootHex)
	}

	// Deserialize the Groth16 proof.
	proofBytes, err := hex.DecodeString(msg.Proof)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrDeserializeProof, "proof is not valid hex")
	}
	proof, err := circuit.DeserializeProof(proofBytes)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrDeserializeProof, err.Error())
	}

	// Parse new commitments (comma-separated hex strings).
	newCommitmentHexes := strings.Split(msg.NewCommitments, ",")
	if len(newCommitmentHexes) != 2 {
		return nil, errorsmod.Wrap(types.ErrInvalidCommitment, "expected exactly 2 new commitments")
	}

	// Build the public witness for verification.
	// Public inputs order: OldNullifiers[0], OldNullifiers[1], NewCommitments[0], NewCommitments[1], MerkleRoot
	var publicAssignment circuit.TransferCircuit

	for i, nfHex := range nullifierHexes {
		nfHex = strings.TrimSpace(nfHex)
		nfBytes, err := hex.DecodeString(nfHex)
		if err != nil {
			return nil, errorsmod.Wrapf(types.ErrInvalidProof, "invalid nullifier hex: %s", nfHex)
		}
		publicAssignment.OldNullifiers[i] = new(big.Int).SetBytes(nfBytes)
	}

	for i, cmHex := range newCommitmentHexes {
		cmHex = strings.TrimSpace(cmHex)
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

	// Create the public witness.
	publicWitness, err := frontend.NewWitness(&publicAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "failed to create public witness")
	}

	// Verify the Groth16 proof.
	if k.TransferVerifyingKey == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "transfer verifying key not initialized")
	}

	if err := circuit.VerifyTransferProof(k.TransferVerifyingKey, proof, publicWitness); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, fmt.Sprintf("proof verification failed: %v", err))
	}

	// Proof is valid. Store nullifiers as spent.
	for _, nfHex := range nullifierHexes {
		nfHex = strings.TrimSpace(nfHex)
		if err := k.Nullifiers.Set(ctx, nfHex, true); err != nil {
			return nil, errorsmod.Wrap(types.ErrInvalidProof, "failed to store nullifier")
		}
	}

	// Add new commitments to the Merkle tree.
	for i, cmHex := range newCommitmentHexes {
		cmHex = strings.TrimSpace(cmHex)
		cmBytes, _ := hex.DecodeString(cmHex)
		commitmentVal := new(big.Int).SetBytes(cmBytes)

		leafIndex, err := k.CommitmentCount.Next(ctx)
		if err != nil {
			return nil, errorsmod.Wrapf(types.ErrInvalidCommitment, "failed to get next index for commitment %d", i)
		}

		if err := k.Commitments.Set(ctx, leafIndex, cmBytes); err != nil {
			return nil, errorsmod.Wrapf(types.ErrInvalidCommitment, "failed to store commitment %d", i)
		}

		if err := k.insertLeafAndUpdateTree(ctx, leafIndex, commitmentVal); err != nil {
			return nil, errorsmod.Wrapf(types.ErrMerkleTreeFull, "failed to insert commitment %d into tree", i)
		}
	}

	// Compute and store the new Merkle root.
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
			"private_transfer",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("nullifiers", msg.Nullifiers),
			sdk.NewAttribute("new_commitments", msg.NewCommitments),
			sdk.NewAttribute("new_merkle_root", newRootHex),
		),
	)

	return &types.MsgPrivateTransferResponse{}, nil
}
