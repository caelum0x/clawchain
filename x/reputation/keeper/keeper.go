package keeper

import (
	"context"
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"

	"clawchain/x/reputation/types"
)

type Keeper struct {
	storeService      corestore.KVStoreService
	cdc               codec.Codec
	addressCodec      address.Codec
	authority         []byte
	agentKeeper       types.AgentKeeper
	marketplaceKeeper types.MarketplaceKeeper

	Schema           collections.Schema
	Params           collections.Item[types.Params]
	Reputations      collections.Map[string, types.ReputationRecord]
	Ratings          collections.Map[uint64, types.Rating]
	RatingCount      collections.Sequence
	Endorsements     collections.Map[uint64, types.Endorsement]
	EndorsementCount collections.Sequence
	// Tracks whether an agent was stale at the last SLA evaluation.
	HeartbeatStaleState collections.Map[string, bool]
	// Cursor of the last task ID processed for task-SLA reputation coupling.
	TaskSLACursor collections.Item[uint64]
	// Tracks the last block height at which reputation decay was applied.
	LastDecayBlock collections.Item[int64]
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,
	agentKeeper types.AgentKeeper,
	marketplaceKeeper types.MarketplaceKeeper,
) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)
	k := Keeper{
		storeService:      storeService,
		cdc:               cdc,
		addressCodec:      addressCodec,
		authority:         authority,
		agentKeeper:       agentKeeper,
		marketplaceKeeper: marketplaceKeeper,

		Params:           collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),
		Reputations:      collections.NewMap(sb, types.ReputationsKey, "reputations", collections.StringKey, codec.CollValue[types.ReputationRecord](cdc)),
		Ratings:          collections.NewMap(sb, types.RatingsKey, "ratings", collections.Uint64Key, codec.CollValue[types.Rating](cdc)),
		RatingCount:      collections.NewSequence(sb, types.RatingCountKey, "rating_count"),
		Endorsements:     collections.NewMap(sb, types.EndorsementsKey, "endorsements", collections.Uint64Key, codec.CollValue[types.Endorsement](cdc)),
		EndorsementCount: collections.NewSequence(sb, types.EndorsementCountKey, "endorsement_count"),
		HeartbeatStaleState: collections.NewMap(
			sb,
			types.HeartbeatStaleStateKey,
			"heartbeat_stale_state",
			collections.StringKey,
			collections.BoolValue,
		),
		TaskSLACursor: collections.NewItem(
			sb,
			types.TaskSLACursorKey,
			"task_sla_cursor",
			collections.Uint64Value,
		),
		LastDecayBlock: collections.NewItem(
			sb,
			types.LastDecayBlockKey,
			"last_decay_block",
			collections.Int64Value,
		),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema
	return k
}

func (k Keeper) GetAuthority() []byte {
	return k.authority
}

// GetReputation returns the uptime score for an agent.
// Returns (score, found, err).
func (k Keeper) GetReputation(ctx context.Context, agentAddress string) (uint64, bool, error) {
	rep, err := k.Reputations.Get(ctx, agentAddress)
	if err != nil {
		// Check if it's a not-found error
		return 0, false, nil
	}
	return rep.UptimeScoreBps, true, nil
}
