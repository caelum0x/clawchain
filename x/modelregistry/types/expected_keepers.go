package types

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

type BankKeeper interface {
	SendCoins(ctx context.Context, fromAddr sdk.AccAddress, toAddr sdk.AccAddress, amt sdk.Coins) error
	SpendableCoins(ctx context.Context, addr sdk.AccAddress) sdk.Coins
	SendCoinsFromAccountToModule(ctx context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error
	SendCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error
}

// ReputationKeeper defines the subset of the reputation module's keeper that
// the modelregistry module depends on. It is satisfied by the reputation
// keeper and injected via depinject (no import cycle: reputation does not
// depend on modelregistry).
type ReputationKeeper interface {
	SlashReputation(ctx context.Context, agentAddress string, points uint64) error
}
