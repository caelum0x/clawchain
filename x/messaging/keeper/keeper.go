package keeper

import (
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"

	"clawchain/x/messaging/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	addressCodec address.Codec
	authority    []byte

	Schema            collections.Schema
	Params            collections.Item[types.Params]
	Messages          collections.Map[uint64, types.MessageEntry]
	MessageCount      collections.Sequence
	MessageNonceIndex collections.Map[string, uint64]
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

		Params:            collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),
		Messages:          collections.NewMap(sb, types.MessagesKey, "messages", collections.Uint64Key, codec.CollValue[types.MessageEntry](cdc)),
		MessageCount:      collections.NewSequence(sb, types.MessageCountKey, "message_count"),
		MessageNonceIndex: collections.NewMap(sb, types.MessageNonceIndexKey, "message_nonce_index", collections.StringKey, collections.Uint64Value),
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
