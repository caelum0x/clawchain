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

// AgentStatsKey is the prefix for aggregate agent activity stats (Map[string, AgentStats])
var AgentStatsKey = collections.NewPrefix("s_agent")

// IntentsKey is the prefix for coordination intents (Map[uint64, CoordinationIntent])
var IntentsKey = collections.NewPrefix("i_agent")

// IntentResponsesKey is the prefix for intent responses (Map[string, IntentResponse])
var IntentResponsesKey = collections.NewPrefix("r_agent")

// IntentCountKey is the prefix for the intent count sequence (used for intent IDs)
var IntentCountKey = collections.NewPrefix("ic_agent")

// AgentLivenessKey is the prefix for agent heartbeat liveness records (Map[string, AgentLiveness])
var AgentLivenessKey = collections.NewPrefix("l_agent")

// TasksKey is the prefix for delegated tasks (Map[uint64, TaskRecord])
var TasksKey = collections.NewPrefix("tk_agent")

// TaskCountKey is the prefix for the task count sequence (used for task IDs)
var TaskCountKey = collections.NewPrefix("tkc_agent")

// AgentActionRateLimitKey tracks per-agent per-block action counts
// (Map[string, uint64], key format: "<address>:<block_height>").
var AgentActionRateLimitKey = collections.NewPrefix("arl_agent")

// IntentRateLimitKey tracks per-agent per-block intent submission counts.
var IntentRateLimitKey = collections.NewPrefix("irl_agent")

// TaskRateLimitKey tracks per-agent per-block task delegation counts.
var TaskRateLimitKey = collections.NewPrefix("trl_agent")

// AgentRewardsKey is the prefix for cumulative agent rewards (Map[string, string]).
var AgentRewardsKey = collections.NewPrefix("rw_agent")
