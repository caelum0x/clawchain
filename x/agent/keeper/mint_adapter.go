package keeper

import (
	"context"

	"cosmossdk.io/math"
	mintkeeper "github.com/cosmos/cosmos-sdk/x/mint/keeper"
)

// MintKeeperAdapter wraps the Cosmos SDK mint keeper to satisfy the
// agent module's MintKeeper interface.
type MintKeeperAdapter struct {
	mk mintkeeper.Keeper
}

// NewMintKeeperAdapter creates a new MintKeeperAdapter.
func NewMintKeeperAdapter(mk mintkeeper.Keeper) MintKeeperAdapter {
	return MintKeeperAdapter{mk: mk}
}

func (a MintKeeperAdapter) GetMintDenom(ctx context.Context) (string, error) {
	params, err := a.mk.Params.Get(ctx)
	if err != nil {
		return "", err
	}
	return params.MintDenom, nil
}

func (a MintKeeperAdapter) GetAnnualProvisions(ctx context.Context) (math.LegacyDec, error) {
	minter, err := a.mk.Minter.Get(ctx)
	if err != nil {
		return math.LegacyDec{}, err
	}
	return minter.AnnualProvisions, nil
}
