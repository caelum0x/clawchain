package keeper

import (
	"context"
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/agent/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	addressCodec address.Codec
	bankKeeper   types.BankKeeper
	mintKeeper   types.MintKeeper
	// Address capable of executing a MsgUpdateParams message.
	// Typically, this should be the x/gov module account.
	authority []byte

	Schema           collections.Schema
	Params           collections.Item[types.Params]
	Agents           collections.Map[string, types.AgentInfo]
	AgentCount       collections.Sequence
	AgentActions     collections.Map[uint64, types.AgentActionRecord]
	AgentActionCount collections.Sequence
	AgentStats       collections.Map[string, types.AgentStats]
	AgentActionRate  collections.Map[string, uint64]

	// Coordination primitives
	Intents         collections.Map[uint64, types.CoordinationIntent]
	IntentResponses collections.Map[string, types.IntentResponse]
	IntentCount     collections.Sequence

	// Heartbeat liveness tracking
	AgentLiveness collections.Map[string, types.AgentLiveness]

	// Task delegation
	Tasks     collections.Map[uint64, types.TaskRecord]
	TaskCount collections.Sequence

	// Per-message-type rate limit collections
	IntentActionRate collections.Map[string, uint64]
	TaskActionRate   collections.Map[string, uint64]

	// Cumulative rewards per agent (address → amount string in uclaw)
	AgentRewards collections.Map[string, string]
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,
	bankKeeper types.BankKeeper,
	mintKeeper types.MintKeeper,
) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		cdc:          cdc,
		addressCodec: addressCodec,
		bankKeeper:   bankKeeper,
		mintKeeper:   mintKeeper,
		authority:    authority,

		Params:           collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),
		Agents:           collections.NewMap(sb, types.AgentsKey, "agents", collections.StringKey, codec.CollValue[types.AgentInfo](cdc)),
		AgentCount:       collections.NewSequence(sb, types.AgentCountKey, "agent_count"),
		AgentActions:     collections.NewMap(sb, types.AgentActionsKey, "agent_actions", collections.Uint64Key, codec.CollValue[types.AgentActionRecord](cdc)),
		AgentActionCount: collections.NewSequence(sb, types.AgentActionCountKey, "agent_action_count"),
		AgentStats:       collections.NewMap(sb, types.AgentStatsKey, "agent_stats", collections.StringKey, codec.CollValue[types.AgentStats](cdc)),
		AgentActionRate:  collections.NewMap(sb, types.AgentActionRateLimitKey, "agent_action_rate", collections.StringKey, collections.Uint64Value),

		Intents:         collections.NewMap(sb, types.IntentsKey, "intents", collections.Uint64Key, codec.CollValue[types.CoordinationIntent](cdc)),
		IntentResponses: collections.NewMap(sb, types.IntentResponsesKey, "intent_responses", collections.StringKey, codec.CollValue[types.IntentResponse](cdc)),
		IntentCount:     collections.NewSequence(sb, types.IntentCountKey, "intent_count"),

		AgentLiveness: collections.NewMap(sb, types.AgentLivenessKey, "agent_liveness", collections.StringKey, codec.CollValue[types.AgentLiveness](cdc)),

		Tasks:     collections.NewMap(sb, types.TasksKey, "tasks", collections.Uint64Key, codec.CollValue[types.TaskRecord](cdc)),
		TaskCount: collections.NewSequence(sb, types.TaskCountKey, "task_count"),

		IntentActionRate: collections.NewMap(sb, types.IntentRateLimitKey, "intent_action_rate", collections.StringKey, collections.Uint64Value),
		TaskActionRate:   collections.NewMap(sb, types.TaskRateLimitKey, "task_action_rate", collections.StringKey, collections.Uint64Value),

		AgentRewards: collections.NewMap(sb, types.AgentRewardsKey, "agent_rewards", collections.StringKey, collections.StringValue),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority() []byte {
	return k.authority
}

// CreateTaskForSkillPurchase creates a TaskRecord for a purchased skill so
// that the seller's agent can execute it.
func (k Keeper) CreateTaskForSkillPurchase(ctx context.Context, buyer string, seller string, skillID uint64, skillName string, budget string, denom string) (uint64, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	taskID, err := k.TaskCount.Next(ctx)
	if err != nil {
		return 0, err
	}

	task := types.TaskRecord{
		TaskId:           taskID,
		DelegatorAddress: buyer,
		AssigneeAddress:  seller,
		Description:      fmt.Sprintf("Execute skill: %s (ID: %d)", skillName, skillID),
		Requirements:     fmt.Sprintf(`{"skill_id":%d}`, skillID),
		SkillId:          skillID,
		Budget:           budget + denom,
		DeadlineBlocks:   200, // ~20 min at 6s blocks
		CreatedAt:        sdkCtx.BlockHeight(),
		Status:           "pending",
	}

	if err := k.Tasks.Set(ctx, taskID, task); err != nil {
		return 0, err
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"skill_task_created",
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", taskID)),
			sdk.NewAttribute("skill_id", fmt.Sprintf("%d", skillID)),
			sdk.NewAttribute("buyer", buyer),
			sdk.NewAttribute("seller", seller),
		),
	)

	return taskID, nil
}
