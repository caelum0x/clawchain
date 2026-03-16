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
	// Enforce per-block privacy transaction rate limit.
	if err := k.CheckAndIncrementPrivacyTxCount(ctx); err != nil {
		return nil, err
	}

	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Parse nullifiers (comma-separated hex strings).
	nullifierHexes := strings.Split(msg.Nullifiers, ",")
	if len(nullifierHexes) != 2 {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "expected exactly 2 nullifiers")
	}

	// Verify the Merkle root is valid.
	rootHex, err := k.ValidateKnownRoot(ctx, msg.Root)
	if err != nil {
		return nil, err
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
		nfHex = strings.ToLower(strings.TrimSpace(nfHex))
		nfBytes, err := hex.DecodeString(nfHex)
		if err != nil {
			return nil, errorsmod.Wrapf(types.ErrInvalidProof, "invalid nullifier hex: %s", nfHex)
		}
		publicAssignment.OldNullifiers[i] = new(big.Int).SetBytes(nfBytes)
	}

	for i, cmHex := range newCommitmentHexes {
		cmHex = strings.ToLower(strings.TrimSpace(cmHex))
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
	if k.VKs.TransferVK == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "transfer verifying key not initialized")
	}

	if err := circuit.VerifyTransferProof(k.VKs.TransferVK, proof, publicWitness); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, fmt.Sprintf("proof verification failed: %v", err))
	}

	// Proof is valid. Store nullifiers as spent.
	if err := k.ConsumeNullifiers(ctx, nullifierHexes); err != nil {
		return nil, err
	}

	// Add new commitments to the Merkle tree.
	lastRootHex := rootHex
	for i, cmHex := range newCommitmentHexes {
		cmHex = strings.ToLower(strings.TrimSpace(cmHex))
		cmBytes, _ := hex.DecodeString(cmHex)
		_, _, newRootHex, err := k.AppendCommitment(ctx, cmBytes)
		if err != nil {
			return nil, errorsmod.Wrapf(err, "failed to append commitment %d", i)
		}
		lastRootHex = newRootHex
	}

	// Emit event.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"private_transfer",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("nullifiers", msg.Nullifiers),
			sdk.NewAttribute("new_commitments", msg.NewCommitments),
			sdk.NewAttribute("new_merkle_root", lastRootHex),
		),
	)

	return &types.MsgPrivateTransferResponse{}, nil
}
