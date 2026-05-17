package keeper

import (
	"context"
	"fmt"
	"math/big"
	"sync"

	"clawchain/x/privacy/merkle"
	"clawchain/x/privacy/types"

	errorsmod "cosmossdk.io/errors"
	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// zeroHashes stores the default hash at each tree level for empty subtrees.
// Level 0 = 0, Level i = MiMC(zeroHashes[i-1], zeroHashes[i-1]).
// Computed once at startup.
var (
	zeroHashes     [merkle.Depth + 1]*big.Int
	zeroHashesOnce sync.Once
)

// getZeroHashes returns the precomputed zero hashes for all tree levels.
func getZeroHashes() [merkle.Depth + 1]*big.Int {
	zeroHashesOnce.Do(func() {
		zeroHashes[0] = big.NewInt(0)
		for i := 1; i <= merkle.Depth; i++ {
			zeroHashes[i] = merkle.MiMCHashPair(zeroHashes[i-1], zeroHashes[i-1])
		}
	})
	return zeroHashes
}

func (k msgServer) Shield(ctx context.Context, msg *types.MsgShield) (*types.MsgShieldResponse, error) {
	senderAddr, err := k.addressCodec.StringToBytes(msg.Creator)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid sender address")
	}

	if msg.Amount == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidAmount, "amount must be greater than zero")
	}

	// Parse the coin denomination from msg.Coins (e.g., "stake").
	// If empty, default to "stake".
	denom := msg.Coins
	if denom == "" {
		denom = "stake"
	}
	coins := sdk.NewCoins(sdk.NewCoin(denom, math.NewIntFromUint64(msg.Amount)))

	// Send coins from the user to the module account (shielded pool).
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, senderAddr, types.ModuleName, coins); err != nil {
		return nil, errorsmod.Wrap(types.ErrInsufficientFunds, err.Error())
	}

	// Create commitment = MiMC(amount, blinding).
	// For Shield, we generate the blinding deterministically from the commitment count
	// (the user should ideally provide it, but the proto has Amount and Coins fields only).
	// We use the commitment count as a simple blinding factor for on-chain deposits.
	// In a production system, the blinding would come from the client.
	commitCount, err := k.CommitmentCount.Peek(ctx)
	if err != nil {
		commitCount = 0
	}

	amount := new(big.Int).SetUint64(msg.Amount)
	// Use commitment count + 1 as a simple blinding for the on-chain generated commitment.
	blinding := new(big.Int).SetUint64(commitCount + 1)

	commitment := merkle.MiMCHashPair(amount, blinding)
	commitmentBytes := commitment.Bytes()
	leafIndex, commitmentHex, rootHex, err := k.AppendCommitment(ctx, commitmentBytes)
	if err != nil {
		return nil, err
	}

	// Emit event.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"shield",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("amount", fmt.Sprintf("%d", msg.Amount)),
			sdk.NewAttribute("commitment", commitmentHex),
			sdk.NewAttribute("leaf_index", fmt.Sprintf("%d", leafIndex)),
			sdk.NewAttribute("merkle_root", rootHex),
		),
	)

	return &types.MsgShieldResponse{}, nil
}

// insertLeafAndUpdateTree inserts a leaf at the given index into the on-chain
// Merkle tree stored in MerkleNodes, and recomputes all parent nodes up to the root.
func (k Keeper) insertLeafAndUpdateTree(ctx context.Context, leafIndex uint64, leaf *big.Int) error {
	// Store the leaf node at level 0.
	nodeKey := fmt.Sprintf("0:%d", leafIndex)
	if err := k.MerkleNodes.Set(ctx, nodeKey, leaf.Bytes()); err != nil {
		return err
	}

	// Recompute parent nodes up to the root.
	currentIdx := leafIndex
	for level := 0; level < merkle.Depth; level++ {
		parentIdx := currentIdx / 2
		leftChildIdx := parentIdx * 2
		rightChildIdx := leftChildIdx + 1

		left, err := k.getMerkleNode(ctx, level, leftChildIdx)
		if err != nil {
			return err
		}
		right, err := k.getMerkleNode(ctx, level, rightChildIdx)
		if err != nil {
			return err
		}

		parentHash := merkle.MiMCHashPair(left, right)
		parentKey := fmt.Sprintf("%d:%d", level+1, parentIdx)
		if err := k.MerkleNodes.Set(ctx, parentKey, parentHash.Bytes()); err != nil {
			return err
		}

		currentIdx = parentIdx
	}

	return nil
}

// getMerkleNode retrieves a Merkle tree node from state.
// Returns the correct zero hash for the given level if not found.
func (k Keeper) getMerkleNode(ctx context.Context, level int, index uint64) (*big.Int, error) {
	key := fmt.Sprintf("%d:%d", level, index)
	data, err := k.MerkleNodes.Get(ctx, key)
	if err != nil {
		// Node not found, return the zero hash for this level.
		zh := getZeroHashes()
		return new(big.Int).Set(zh[level]), nil
	}
	return new(big.Int).SetBytes(data), nil
}

// computeRootFromState returns the root node of the on-chain Merkle tree.
func (k Keeper) computeRootFromState(ctx context.Context) (*big.Int, error) {
	return k.getMerkleNode(ctx, merkle.Depth, 0)
}
