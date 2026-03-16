// Package v2 provides state migration from v1 (JSON-encoded collections) to v2.
// In v2, the modelregistry module uses the same JSON encoding but with updated
// gRPC service registration.
//
// This migration is a no-op for the data format since we continue using JSON
// collections, but bumps the consensus version to track the module upgrade.
package v2

import (
	"context"
	"fmt"

	corestore "cosmossdk.io/core/store"
)

// MigrateStore performs the v1 -> v2 migration for the modelregistry module.
// The underlying data format (JSON-encoded models/jobs) is unchanged,
// but the module now supports gRPC msg and query services.
func MigrateStore(ctx context.Context, storeService corestore.KVStoreService) error {
	_ = fmt.Sprintf("modelregistry v1 -> v2 migration: gRPC services enabled")
	return nil
}
