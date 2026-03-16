package types

import (
	"context"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// BankKeeper defines the expected interface for the Bank module.
type BankKeeper interface {
	SendCoins(ctx context.Context, fromAddr sdk.AccAddress, toAddr sdk.AccAddress, amt sdk.Coins) error
	SendCoinsFromAccountToModule(ctx context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error
	SendCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error
	BurnCoins(ctx context.Context, moduleName string, amt sdk.Coins) error
}

// StakingKeeper defines the expected interface for the Staking module.
// Used for stake-weighted voting in governance proposals.
type StakingKeeper interface {
	// GetDelegatorBonded returns the total bonded tokens delegated by a delegator.
	GetDelegatorBonded(ctx context.Context, delegator sdk.AccAddress) (math.Int, error)
}

// ModuleParamExecutor defines the interface for applying parameter changes
// to a target module. Each module keeper implements this to handle governance
// parameter change proposals.
type ModuleParamExecutor interface {
	// UpdateParam applies a single parameter change. The paramKey matches
	// one of the keys in AllowedParams, and newValue is the string
	// representation of the new value.
	UpdateParam(ctx context.Context, paramKey string, newValue string) error
}
