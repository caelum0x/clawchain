package keeper

import (
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/cosmos/cosmos-sdk/codec"

	"clawchain/x/privacy/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	addressCodec address.Codec
	// Address capable of executing a MsgUpdateParams message.
	// Typically, this should be the x/gov module account.
	authority []byte

	// bankKeeper provides access to the bank module for sending coins.
	bankKeeper types.BankKeeper

	Schema collections.Schema
	Params collections.Item[types.Params]

	// Commitments stores commitment values indexed by their sequential index.
	// Key: uint64 (leaf index), Value: []byte (commitment bytes, 32 bytes).
	Commitments collections.Map[uint64, []byte]

	// Nullifiers tracks spent nullifiers to prevent double-spending.
	// Key: string (nullifier hex), Value: bool (always true when present).
	Nullifiers collections.Map[string, bool]

	// MerkleRoots stores valid historical Merkle roots.
	// Key: string (root hex), Value: bool (always true when present).
	MerkleRoots collections.Map[string, bool]

	// CommitmentCount tracks the next commitment index (number of commitments inserted).
	CommitmentCount collections.Sequence

	// MerkleNodes stores Merkle tree nodes for on-chain tree state.
	// Key: string ("level:index"), Value: []byte (node hash bytes, 32 bytes).
	MerkleNodes collections.Map[string, []byte]

	// TransferVerifyingKey is the Groth16 verifying key for the transfer circuit.
	// Loaded at initialization (genesis or module init).
	TransferVerifyingKey groth16.VerifyingKey

	// UnshieldVerifyingKey is the Groth16 verifying key for the unshield circuit.
	// Loaded at initialization (genesis or module init).
	UnshieldVerifyingKey groth16.VerifyingKey
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,
	bankKeeper types.BankKeeper,
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
		bankKeeper:   bankKeeper,

		Params: collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),

		Commitments: collections.NewMap(
			sb, types.CommitmentsKey, "commitments",
			collections.Uint64Key, collections.BytesValue,
		),

		Nullifiers: collections.NewMap(
			sb, types.NullifiersKey, "nullifiers",
			collections.StringKey, collections.BoolValue,
		),

		MerkleRoots: collections.NewMap(
			sb, types.MerkleRootsKey, "merkle_roots",
			collections.StringKey, collections.BoolValue,
		),

		CommitmentCount: collections.NewSequence(
			sb, types.CommitmentCountKey, "commitment_count",
		),

		MerkleNodes: collections.NewMap(
			sb, types.MerkleTreeKey, "merkle_nodes",
			collections.StringKey, collections.BytesValue,
		),
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

// GetBankKeeper returns the bank keeper.
func (k Keeper) GetBankKeeper() types.BankKeeper {
	return k.bankKeeper
}
