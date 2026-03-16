package types

import "cosmossdk.io/collections"

const (
	// ModuleName defines the module name
	ModuleName = "privacy"

	// StoreKey defines the primary module store key
	StoreKey = ModuleName

	// GovModuleName duplicates the gov module's name to avoid a dependency with x/gov.
	// It should be synced with the gov module's name if it is ever changed.
	// See: https://github.com/cosmos/cosmos-sdk/blob/v0.52.0-beta.2/x/gov/types/keys.go#L9
	GovModuleName = "gov"
)

// Collection prefixes for state management.
var (
	// ParamsKey is the prefix to retrieve all Params
	ParamsKey = collections.NewPrefix("p_privacy")

	// CommitmentsKey is the prefix for the commitment store (index -> commitment bytes).
	CommitmentsKey = collections.NewPrefix("commitments")

	// NullifiersKey is the prefix for the nullifier set (nullifier hex -> spent bool).
	NullifiersKey = collections.NewPrefix("nullifiers")

	// MerkleRootsKey is the prefix for stored Merkle roots (root hex -> valid bool).
	MerkleRootsKey = collections.NewPrefix("merkle_roots")

	// CommitmentCountKey is the prefix for the commitment count sequence.
	CommitmentCountKey = collections.NewPrefix("commitment_count")

	// MerkleTreeKey is the prefix for Merkle tree nodes (keyed by "level:index" -> node bytes).
	MerkleTreeKey = collections.NewPrefix("merkle_tree")

	// ViewKeysKey is the prefix for view keys (commitment hex -> encrypted note bytes).
	ViewKeysKey = collections.NewPrefix("view_keys")

	// CommitmentIndexKey is the prefix for the commitment reverse index (commitment hex -> leaf index).
	CommitmentIndexKey = collections.NewPrefix("commitment_index")

	// RootHistoryKey is the prefix for ordered Merkle root history (index -> root hex).
	RootHistoryKey = collections.NewPrefix("h_privacy")

	// RootHistoryCountKey is the prefix for the root history sequence counter.
	RootHistoryCountKey = collections.NewPrefix("z_privacy")

	// PrivacyTxCountKey is the prefix for the per-block privacy transaction counter.
	// Key: int64 (block height), Value: uint64 (count of privacy txs in that block).
	PrivacyTxCountKey = collections.NewPrefix("ptx_count")
)
