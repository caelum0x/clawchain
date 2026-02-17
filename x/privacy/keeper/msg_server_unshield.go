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
	"cosmossdk.io/math"
	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/frontend"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) Unshield(ctx context.Context, msg *types.MsgUnshield) (*types.MsgUnshieldResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	if msg.Amount == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidAmount, "amount must be greater than zero")
	}

	// Resolve recipient address. If not set, default to creator.
	recipientStr := msg.Recipient
	if recipientStr == "" {
		recipientStr = msg.Creator
	}
	recipientAddr, err := k.addressCodec.StringToBytes(recipientStr)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid recipient address")
	}

	// Verify nullifier has not been spent.
	nullifierHex := strings.TrimSpace(msg.Nullifier)
	if nullifierHex == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "nullifier is empty")
	}
	exists, err := k.Nullifiers.Has(ctx, nullifierHex)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "failed to check nullifier")
	}
	if exists {
		return nil, errorsmod.Wrapf(types.ErrNullifierAlreadyUsed, "nullifier %s", nullifierHex)
	}

	// Verify the Merkle root is valid.
	// For unshield, we need to figure out which root to validate against.
	// The root is embedded in the proof's public inputs. We retrieve the current root.
	currentRoot, err := k.computeRootFromState(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidMerkleRoot, "failed to get current merkle root")
	}
	currentRootHex := hex.EncodeToString(currentRoot.Bytes())

	// Deserialize the proof.
	proofBytes, err := hex.DecodeString(msg.Proof)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrDeserializeProof, "proof is not valid hex")
	}
	proof, err := circuit.DeserializeProof(proofBytes)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrDeserializeProof, err.Error())
	}

	// Parse commitment and nullifier.
	commitmentHex := strings.TrimSpace(msg.Commitment)
	commitmentBytes, err := hex.DecodeString(commitmentHex)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidCommitment, "invalid commitment hex")
	}
	nullifierBytes, err := hex.DecodeString(nullifierHex)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "invalid nullifier hex")
	}

	// Build the public witness for the unshield circuit.
	// Public inputs: Nullifier, Commitment, Amount, MerkleRoot
	var publicAssignment circuit.UnshieldCircuit
	publicAssignment.Nullifier = new(big.Int).SetBytes(nullifierBytes)
	publicAssignment.Commitment = new(big.Int).SetBytes(commitmentBytes)
	publicAssignment.Amount = new(big.Int).SetUint64(msg.Amount)
	publicAssignment.MerkleRoot = new(big.Int).SetBytes(currentRoot.Bytes())

	publicWitness, err := frontend.NewWitness(&publicAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "failed to create public witness")
	}

	// Verify the Groth16 proof.
	if k.UnshieldVerifyingKey == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "unshield verifying key not initialized")
	}

	if err := circuit.VerifyUnshieldProof(k.UnshieldVerifyingKey, proof, publicWitness); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, fmt.Sprintf("proof verification failed: %v", err))
	}

	// Proof is valid. Mark nullifier as spent.
	if err := k.Nullifiers.Set(ctx, nullifierHex, true); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "failed to store nullifier")
	}

	// Send coins from the module account to the recipient.
	coins := sdk.NewCoins(sdk.NewCoin("stake", math.NewIntFromUint64(msg.Amount)))
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, recipientAddr, coins); err != nil {
		return nil, errorsmod.Wrap(types.ErrInsufficientFunds, err.Error())
	}

	// Emit event.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"unshield",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("recipient", recipientStr),
			sdk.NewAttribute("amount", fmt.Sprintf("%d", msg.Amount)),
			sdk.NewAttribute("nullifier", nullifierHex),
			sdk.NewAttribute("merkle_root", currentRootHex),
		),
	)

	return &types.MsgUnshieldResponse{}, nil
}
