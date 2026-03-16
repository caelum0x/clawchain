package keeper

import (
	"context"
	"encoding/json"
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	agentibc "clawchain/x/agent/ibc"
	"clawchain/x/agent/types"
)

type Keeper struct {
	storeService     corestore.KVStoreService
	cdc              codec.Codec
	addressCodec     address.Codec
	bankKeeper       types.BankKeeper
	mintKeeper       types.MintKeeper
	reputationKeeper types.ReputationKeeper // optional, nil-safe
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

	// Remote agents discovered via IBC (key: "chainID:address", value: JSON of RemoteAgentInfo)
	RemoteAgents collections.Map[string, string]

	// Agent-to-agent negotiations (ID → JSON of Negotiation)
	Negotiations     collections.Map[uint64, string]
	NegotiationCount collections.Sequence

	// Task checkpoint data for crash recovery (taskID → JSON checkpoint)
	TaskCheckpoints collections.Map[uint64, string]

	// In-memory per-block rate limiter (reset in BeginBlocker).
	rateLimiter *blockRateLimiter
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,
	bankKeeper types.BankKeeper,
	mintKeeper types.MintKeeper,
	reputationKeeper types.ReputationKeeper,
) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService:     storeService,
		cdc:              cdc,
		addressCodec:     addressCodec,
		bankKeeper:       bankKeeper,
		mintKeeper:       mintKeeper,
		reputationKeeper: reputationKeeper,
		authority:        authority,

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

		RemoteAgents: collections.NewMap(sb, types.RemoteAgentsKey, "remote_agents", collections.StringKey, collections.StringValue),

		Negotiations:     collections.NewMap(sb, types.NegotiationsKey, "negotiations", collections.Uint64Key, collections.StringValue),
		NegotiationCount: collections.NewSequence(sb, types.NegotiationCountKey, "negotiation_count"),

		TaskCheckpoints: collections.NewMap(sb, types.TaskCheckpointsKey, "task_checkpoints", collections.Uint64Key, collections.StringValue),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema
	k.rateLimiter = newBlockRateLimiter()

	return k
}

// SetReputationKeeper wires the reputation keeper after depinject resolution
// to break the Agent↔Reputation circular dependency.
func (k *Keeper) SetReputationKeeper(rk types.ReputationKeeper) {
	k.reputationKeeper = rk
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority() []byte {
	return k.authority
}

// DiscoverAgents iterates active agents, filters by capabilities (if any tool
// in capabilities matches a tool in agent.SupportedTools), and returns up to
// maxResults matching agents.
func (k Keeper) DiscoverAgents(ctx sdk.Context, capabilities []string, maxResults int) []agentibc.DiscoveredAgent {
	if maxResults <= 0 {
		maxResults = 10
	}
	if maxResults > 50 {
		maxResults = 50
	}

	capSet := make(map[string]bool, len(capabilities))
	for _, c := range capabilities {
		capSet[c] = true
	}

	var results []agentibc.DiscoveredAgent

	iter, err := k.Agents.Iterate(ctx, nil)
	if err != nil {
		return results
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		if len(results) >= maxResults {
			break
		}

		agent, err := iter.Value()
		if err != nil {
			continue
		}

		if !agent.Active {
			continue
		}

		// Filter by capabilities if specified.
		if len(capSet) > 0 {
			matched := false
			for _, tool := range agent.SupportedTools {
				if capSet[tool] {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}

		// Look up heartbeat count from liveness data.
		var heartbeats uint64
		liveness, err := k.AgentLiveness.Get(ctx, agent.Address)
		if err == nil {
			heartbeats = liveness.HeartbeatCount
		}

		results = append(results, agentibc.DiscoveredAgent{
			Address:    agent.Address,
			Name:       agent.Name,
			Endpoint:   agent.Endpoint,
			Tools:      agent.SupportedTools,
			Active:     agent.Active,
			Heartbeats: heartbeats,
		})
	}

	return results
}

// StoreRemoteAgent persists a remote agent announcement from a cross-chain
// source into the RemoteAgents collection. It sets the agent as "active"
// and records the current block height as the last heartbeat.
func (k Keeper) StoreRemoteAgent(ctx sdk.Context, sourceChain string, sourceChannel string, agent agentibc.RemoteAgentInfo) error {
	key := sourceChain + ":" + agent.Address

	// Set status and heartbeat on store/update.
	if agent.Status == "" {
		agent.Status = "active"
	}
	agent.LastHeartbeat = ctx.BlockHeight()

	data, err := json.Marshal(agent)
	if err != nil {
		return fmt.Errorf("failed to marshal remote agent info: %w", err)
	}
	return k.RemoteAgents.Set(ctx, key, string(data))
}

// CreateTaskFromIBC creates a task delegated from a remote chain via IBC.
// The delegator address is prefixed with "ibc:" to indicate cross-chain origin,
// and the sourceChain is recorded in the requirements metadata.
func (k Keeper) CreateTaskFromIBC(ctx sdk.Context, delegator string, sourceChain string, assignee string, description string, requirements string, skillId uint64, budget string, deadlineBlocks int64) (uint64, error) {
	// Verify the assignee is a registered agent.
	_, err := k.Agents.Get(ctx, assignee)
	if err != nil {
		return 0, fmt.Errorf("assignee %s is not a registered agent", assignee)
	}

	taskID, err := k.TaskCount.Next(ctx)
	if err != nil {
		return 0, err
	}

	if deadlineBlocks <= 0 {
		deadlineBlocks = 200
	}

	// Embed IBC metadata in requirements if not already present.
	if requirements == "" {
		requirements = fmt.Sprintf(`{"source_chain":"%s"}`, sourceChain)
	} else {
		requirements = fmt.Sprintf(`{"source_chain":"%s","original":%s}`, sourceChain, requirements)
	}

	task := types.TaskRecord{
		TaskId:           taskID,
		DelegatorAddress: "ibc:" + sourceChain + ":" + delegator,
		AssigneeAddress:  assignee,
		Description:      description,
		Requirements:     requirements,
		SkillId:          skillId,
		Budget:           budget,
		DeadlineBlocks:   deadlineBlocks,
		CreatedAt:        ctx.BlockHeight(),
		Status:           "pending",
	}

	if err := k.Tasks.Set(ctx, taskID, task); err != nil {
		return 0, err
	}

	ctx.EventManager().EmitEvent(
		sdk.NewEvent(
			"ibc_task_created",
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", taskID)),
			sdk.NewAttribute("source_chain", sourceChain),
			sdk.NewAttribute("delegator", delegator),
			sdk.NewAttribute("assignee", assignee),
			sdk.NewAttribute("budget", budget),
		),
	)

	return taskID, nil
}

// QueryTaskResult returns the status and result of a task.
func (k Keeper) QueryTaskResult(ctx sdk.Context, taskId uint64) (string, string, error) {
	task, err := k.Tasks.Get(ctx, taskId)
	if err != nil {
		return "", "", fmt.Errorf("task %d not found", taskId)
	}
	return task.Status, task.Result, nil
}

// ExpireRemoteAgents iterates all remote agents and marks those whose
// LastHeartbeat is older than the TTL as "inactive". This is called
// from the EndBlocker.
func (k Keeper) ExpireRemoteAgents(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentHeight := sdkCtx.BlockHeight()
	ttl := agentibc.DefaultRemoteAgentTTL

	iter, err := k.RemoteAgents.Iterate(ctx, nil)
	if err != nil {
		return err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			continue
		}

		var info agentibc.RemoteAgentInfo
		if err := json.Unmarshal([]byte(kv.Value), &info); err != nil {
			continue
		}

		// Skip agents already marked inactive or expired.
		if info.Status == "inactive" || info.Status == "expired" {
			continue
		}

		// If LastHeartbeat is 0, it was never set — use a grace period
		// (treat it as having started at block 0).
		lastHB := info.LastHeartbeat

		if currentHeight-lastHB > ttl {
			info.Status = "inactive"
			data, err := json.Marshal(info)
			if err != nil {
				continue
			}
			if err := k.RemoteAgents.Set(ctx, kv.Key, string(data)); err != nil {
				continue
			}

			sdkCtx.EventManager().EmitEvent(
				sdk.NewEvent(
					"remote_agent_expired",
					sdk.NewAttribute("key", kv.Key),
					sdk.NewAttribute("chain_id", info.ChainID),
					sdk.NewAttribute("agent_address", info.Address),
					sdk.NewAttribute("last_heartbeat", fmt.Sprintf("%d", lastHB)),
				),
			)
		}
	}

	return nil
}

// CompleteTaskWithIBCACK marks a task as completed and records the result hash.
// This is used for tasks that originated via IBC, where the completion
// acknowledgement needs to be sent back to the source chain.
func (k Keeper) CompleteTaskWithIBCACK(ctx sdk.Context, taskID uint64, resultHash string) error {
	task, err := k.Tasks.Get(ctx, taskID)
	if err != nil {
		return fmt.Errorf("task %d not found", taskID)
	}

	if task.Status != "accepted" && task.Status != "pending" {
		return fmt.Errorf("task %d has status %q, expected accepted or pending", taskID, task.Status)
	}

	task.Status = "completed"
	task.Result = resultHash
	task.CompletedAt = ctx.BlockHeight()

	if err := k.Tasks.Set(ctx, taskID, task); err != nil {
		return fmt.Errorf("failed to update task %d: %w", taskID, err)
	}

	ctx.EventManager().EmitEvent(
		sdk.NewEvent(
			"ibc_task_completed",
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", taskID)),
			sdk.NewAttribute("result_hash", resultHash),
			sdk.NewAttribute("delegator", task.DelegatorAddress),
			sdk.NewAttribute("assignee", task.AssigneeAddress),
		),
	)

	return nil
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
