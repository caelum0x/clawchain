package keeper

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// Migrator is a struct for handling in-place store migrations.
type Migrator struct {
	keeper Keeper
}

// NewMigrator returns a new Migrator.
func NewMigrator(k Keeper) Migrator {
	return Migrator{keeper: k}
}

// Migrate1to2 migrates from version 1 to 2.
func (m Migrator) Migrate1to2(_ sdk.Context) error {
	return nil // no-op: state compatible
}

// Migrate2to3 migrates from version 2 to 3.
func (m Migrator) Migrate2to3(_ sdk.Context) error {
	return nil // no-op: state compatible
}

// Migrate3to4 migrates from version 3 to 4.
func (m Migrator) Migrate3to4(_ sdk.Context) error {
	return nil // no-op: state compatible
}
