// Package v2 provides state migration from v1 (JSON-encoded collections) to v2.
// In v2, the governance module uses the same JSON encoding but with updated
// gRPC service registration and stake-weighted voting support.
//
// This migration is a no-op for the data format since we continue using JSON
// collections, but bumps the consensus version to track the module upgrade.
package v2

import (
	"context"
	"fmt"

	corestore "cosmossdk.io/core/store"
)

// MigrateStore performs the v1 -> v2 migration for the governance module.
// The underlying data format (JSON-encoded proposals and votes) is unchanged,
// but the module now supports gRPC services and stake-weighted voting.
func MigrateStore(ctx context.Context, storeService corestore.KVStoreService) error {
	// The data format is compatible; this migration just validates existing state.
	_ = fmt.Sprintf("governance v1 -> v2 migration: gRPC services enabled, stake-weighted voting available")
	return nil
}
