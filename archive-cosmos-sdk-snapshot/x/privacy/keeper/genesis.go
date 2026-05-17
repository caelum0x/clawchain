package keeper

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"

	"clawchain/x/privacy/merkle"
	"clawchain/x/privacy/types"
)

// InitGenesis initializes the module's state from a provided genesis state.
func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	if err := k.Params.Set(ctx, genState.Params); err != nil {
		return err
	}

	// Initialize the commitment count to 0.
	if err := k.CommitmentCount.Set(ctx, 0); err != nil {
		return fmt.Errorf("failed to initialize commitment count: %w", err)
	}

	// Initialize the Merkle tree with zero hashes.
	// Compute zero hashes at each level: level 0 is zero, level i = MiMC(zero[i-1], zero[i-1]).
	zeroHashes := make([]*big.Int, merkle.Depth+1)
	zeroHashes[0] = big.NewInt(0)
	for i := 1; i <= merkle.Depth; i++ {
		zeroHashes[i] = merkle.MiMCHashPair(zeroHashes[i-1], zeroHashes[i-1])
	}

	// Store the initial root node in MerkleNodes so computeRootFromState works on empty tree.
	rootNodeKey := fmt.Sprintf("%d:%d", merkle.Depth, 0)
	if err := k.MerkleNodes.Set(ctx, rootNodeKey, zeroHashes[merkle.Depth].Bytes()); err != nil {
		return fmt.Errorf("failed to store initial merkle root node: %w", err)
	}

	// Store the initial root in valid root set and ordered root history.
	rootHex := hex.EncodeToString(zeroHashes[merkle.Depth].Bytes())
	if err := k.recordRootTransition(ctx, rootHex); err != nil {
		return fmt.Errorf("failed to store initial merkle root transition: %w", err)
	}

	return nil
}

// ExportGenesis returns the module's exported genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	var err error

	genesis := types.DefaultGenesis()
	genesis.Params, err = k.Params.Get(ctx)
	if err != nil {
		return nil, err
	}

	return genesis, nil
}
