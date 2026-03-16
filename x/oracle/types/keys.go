package types

import "cosmossdk.io/collections"

const (
	ModuleName = "oracle"
	StoreKey   = ModuleName
	RouterKey  = ModuleName

	ExchangeRatePrefix     = "er_"
	PriceHistoryPrefix     = "ph_"
	PrevotePrefix          = "pv_"
	VotePrefix             = "v_"
	FeederDelegationPrefix = "fd_"
	MissCounterPrefix      = "mc_"
	TWAPPrefix             = "twap_"
	ParamsKey              = "params"

	// GovModuleName duplicates the gov module's name to avoid a dependency with x/gov.
	GovModuleName = "gov"
)

// Collection prefixes for schema builder.
var (
	ExchangeRatesCollPrefix     = collections.NewPrefix(ExchangeRatePrefix)
	PriceHistoryCollPrefix      = collections.NewPrefix(PriceHistoryPrefix)
	PrevotesCollPrefix          = collections.NewPrefix(PrevotePrefix)
	VotesCollPrefix             = collections.NewPrefix(VotePrefix)
	FeederDelegationsCollPrefix = collections.NewPrefix(FeederDelegationPrefix)
	MissCountersCollPrefix      = collections.NewPrefix(MissCounterPrefix)
	TWAPCollPrefix              = collections.NewPrefix(TWAPPrefix)
	ParamsCollPrefix            = collections.NewPrefix(ParamsKey)
)
