package types

import "cosmossdk.io/collections"

const (
	// ModuleName defines the module name
	ModuleName = "agent"

	// StoreKey defines the primary module store key
	StoreKey = ModuleName

	// GovModuleName duplicates the gov module's name to avoid a dependency with x/gov.
	// It should be synced with the gov module's name if it is ever changed.
	// See: https://github.com/cosmos/cosmos-sdk/blob/v0.52.0-beta.2/x/gov/types/keys.go#L9
	GovModuleName = "gov"
)

// ParamsKey is the prefix to retrieve all Params
var ParamsKey = collections.NewPrefix("p_agent")

// AgentsKey is the prefix for the agent registry (Map[string, AgentInfo])
var AgentsKey = collections.NewPrefix("a_agent")

// AgentCountKey is the prefix for the agent count sequence
var AgentCountKey = collections.NewPrefix("c_agent")

// AgentActionsKey is the prefix for the agent action log (Map[uint64, AgentActionRecord])
var AgentActionsKey = collections.NewPrefix("x_agent")

// AgentActionCountKey is the prefix for the agent action count sequence (used for action IDs)
var AgentActionCountKey = collections.NewPrefix("n_agent")
