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
	// Enforce per-block privacy transaction rate limit.
	if err := k.CheckAndIncrementPrivacyTxCount(ctx); err != nil {
		return nil, err
	}

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
	nullifierHex, _, err := k.NormalizeHex(msg.Nullifier)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "invalid nullifier hex")
	}

	// Resolve Merkle root: if the message carries an explicit root, validate it
	// against root history; otherwise fall back to the latest computed root.
	var root *big.Int
	var rootHex string
	if msg.Root != "" {
		rootHex = strings.ToLower(strings.TrimSpace(msg.Root))
		has, err := k.Keeper.MerkleRoots.Has(ctx, rootHex)
		if err != nil {
			return nil, errorsmod.Wrap(types.ErrInvalidMerkleRoot, "failed to check root history")
		}
		if !has {
			return nil, errorsmod.Wrap(types.ErrInvalidMerkleRoot, "root is not recognized in root history")
		}
		rootBytes, err := hex.DecodeString(rootHex)
		if err != nil {
			return nil, errorsmod.Wrap(types.ErrInvalidMerkleRoot, "invalid root hex")
		}
		root = new(big.Int).SetBytes(rootBytes)
	} else {
		root, err = k.computeRootFromState(ctx)
		if err != nil {
			return nil, err
		}
		rootHex = hex.EncodeToString(root.Bytes())
	}

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
	commitmentHex := strings.ToLower(strings.TrimSpace(msg.Commitment))
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
	publicAssignment.MerkleRoot = root

	publicWitness, err := frontend.NewWitness(&publicAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "failed to create public witness")
	}

	// Verify the Groth16 proof.
	if k.VKs.UnshieldVK == nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, "unshield verifying key not initialized")
	}

	if err := circuit.VerifyUnshieldProof(k.VKs.UnshieldVK, proof, publicWitness); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidProof, fmt.Sprintf("proof verification failed: %v", err))
	}

	// Proof is valid. Mark nullifier as spent.
	if err := k.ConsumeNullifiers(ctx, []string{nullifierHex}); err != nil {
		return nil, err
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
			sdk.NewAttribute("merkle_root", rootHex),
		),
	)

	return &types.MsgUnshieldResponse{}, nil
}
