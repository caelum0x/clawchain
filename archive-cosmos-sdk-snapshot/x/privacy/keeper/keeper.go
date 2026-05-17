package keeper

import (
	"fmt"
	"os"
	"path/filepath"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/cosmos/cosmos-sdk/codec"

	"clawchain/x/privacy/circuit"
	"clawchain/x/privacy/types"
)

// VKHolder holds Groth16 verifying keys behind a pointer so that all
// value-copies of Keeper share the same key material.
type VKHolder struct {
	TransferVK groth16.VerifyingKey
	UnshieldVK groth16.VerifyingKey
	ViewKeyVK  groth16.VerifyingKey
}

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

	// ViewKeys stores encrypted notes indexed by commitment hex for selective disclosure.
	// Key: string (commitment hex), Value: []byte (encrypted note bytes).
	ViewKeys collections.Map[string, []byte]

	// CommitmentIndex is a reverse lookup from commitment hex to its leaf index.
	// Key: string (commitment hex), Value: uint64 (leaf index).
	CommitmentIndex collections.Map[string, uint64]

	// RootHistory stores an ordered history of Merkle roots by transition index.
	// Key: uint64 (history index), Value: string (root hex).
	RootHistory collections.Map[uint64, string]

	// RootHistoryCount tracks the next root history index.
	RootHistoryCount collections.Sequence

	// VKs holds the Groth16 verifying keys via pointer indirection so that
	// all Keeper value-copies (depinject, module, msgServer) share the same keys.
	VKs *VKHolder
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
		VKs:          &VKHolder{},

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

		ViewKeys: collections.NewMap(
			sb, types.ViewKeysKey, "view_keys",
			collections.StringKey, collections.BytesValue,
		),

		CommitmentIndex: collections.NewMap(
			sb, types.CommitmentIndexKey, "commitment_index",
			collections.StringKey, collections.Uint64Value,
		),

		RootHistory: collections.NewMap(
			sb, types.RootHistoryKey, "root_history",
			collections.Uint64Key, collections.StringValue,
		),

		RootHistoryCount: collections.NewSequence(
			sb, types.RootHistoryCountKey, "root_history_count",
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

// LoadVerifyingKeys reads transfer_vk.bin and unshield_vk.bin from keysDir
// and deserializes them into the shared VKHolder.
func (k Keeper) LoadVerifyingKeys(keysDir string) error {
	transferVKPath := filepath.Join(keysDir, "transfer_vk.bin")
	transferVKData, err := os.ReadFile(transferVKPath)
	if err != nil {
		return fmt.Errorf("failed to read transfer verifying key from %s: %w", transferVKPath, err)
	}
	transferVK, err := circuit.DeserializeVerifyingKey(transferVKData)
	if err != nil {
		return fmt.Errorf("failed to deserialize transfer verifying key: %w", err)
	}

	unshieldVKPath := filepath.Join(keysDir, "unshield_vk.bin")
	unshieldVKData, err := os.ReadFile(unshieldVKPath)
	if err != nil {
		return fmt.Errorf("failed to read unshield verifying key from %s: %w", unshieldVKPath, err)
	}
	unshieldVK, err := circuit.DeserializeVerifyingKey(unshieldVKData)
	if err != nil {
		return fmt.Errorf("failed to deserialize unshield verifying key: %w", err)
	}

	k.VKs.TransferVK = transferVK
	k.VKs.UnshieldVK = unshieldVK
	return nil
}

// SetVerifyingKeys directly sets the verifying keys on the shared VKHolder.
// This is primarily used for testing.
func (k Keeper) SetVerifyingKeys(transferVK, unshieldVK groth16.VerifyingKey) {
	k.VKs.TransferVK = transferVK
	k.VKs.UnshieldVK = unshieldVK
}

// SetViewKeyVerifyingKey sets the view key verifying key on the shared VKHolder.
func (k Keeper) SetViewKeyVerifyingKey(vk groth16.VerifyingKey) {
	k.VKs.ViewKeyVK = vk
}
