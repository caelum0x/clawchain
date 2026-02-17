package keeper

import (
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"

	"clawchain/x/agent/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	addressCodec address.Codec
	// Address capable of executing a MsgUpdateParams message.
	// Typically, this should be the x/gov module account.
	authority []byte

	Schema           collections.Schema
	Params           collections.Item[types.Params]
	Agents           collections.Map[string, types.AgentInfo]
	AgentCount       collections.Sequence
	AgentActions     collections.Map[uint64, types.AgentActionRecord]
	AgentActionCount collections.Sequence
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,

) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		cdc:          cdc,
		addressCodec: addressCodec,
		authority:    authority,

		Params:           collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),
		Agents:           collections.NewMap(sb, types.AgentsKey, "agents", collections.StringKey, types.AgentInfoValueCodec()),
		AgentCount:       collections.NewSequence(sb, types.AgentCountKey, "agent_count"),
		AgentActions:     collections.NewMap(sb, types.AgentActionsKey, "agent_actions", collections.Uint64Key, types.AgentActionRecordValueCodec()),
		AgentActionCount: collections.NewSequence(sb, types.AgentActionCountKey, "agent_action_count"),
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
