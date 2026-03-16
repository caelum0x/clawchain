package types

import "cosmossdk.io/collections"

const (
	// ModuleName defines the module name.
	ModuleName = "tokenfactory"

	// StoreKey defines the primary module store key.
	StoreKey = ModuleName

	// GovModuleName duplicates the gov module's name to avoid a dependency with x/gov.
	GovModuleName = "gov"

	// DenomPrefix is the prefix for factory-created denoms: factory/{creator}/{subdenom}
	DenomPrefix = "factory"
)

// DenomAdminsKey is the prefix for the denom admin map (Map[string, string]).
// Key: full denom (factory/{creator}/{subdenom}), Value: admin address.
var DenomAdminsKey = collections.NewPrefix("da_tf")

// BeforeSendHooksKey is the prefix for the before-send hook map (Map[string, string]).
// Key: full denom, Value: cosmwasm contract address.
var BeforeSendHooksKey = collections.NewPrefix("bsh_tf")
