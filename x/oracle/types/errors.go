package types

import errorsmod "cosmossdk.io/errors"

var (
	ErrInvalidPrevote          = errorsmod.Register(ModuleName, 1500, "invalid prevote")
	ErrInvalidVote             = errorsmod.Register(ModuleName, 1501, "vote hash does not match prevote")
	ErrNoMatchingPrevote       = errorsmod.Register(ModuleName, 1502, "no matching prevote found")
	ErrMissedVotePeriod        = errorsmod.Register(ModuleName, 1503, "missed vote period")
	ErrInvalidFeederDelegation = errorsmod.Register(ModuleName, 1504, "invalid feeder delegation")
	ErrUnauthorizedFeeder      = errorsmod.Register(ModuleName, 1505, "unauthorized feeder")
	ErrInvalidDenomPair        = errorsmod.Register(ModuleName, 1506, "denom pair not in whitelist")
	ErrPriceNotAvailable       = errorsmod.Register(ModuleName, 1507, "price not available")
)
