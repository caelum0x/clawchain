package app

import (
	"context"

	storetypes "cosmossdk.io/store/types"
	upgradetypes "cosmossdk.io/x/upgrade/types"

	"github.com/cosmos/cosmos-sdk/types/module"
)

const (
	// UpgradeNameV2 is the upgrade plan name for the v2 chain upgrade.
	// Bump this for each new consensus-breaking upgrade.
	UpgradeNameV2 = "v2"

	// UpgradeNameTestnetRehearsal is a no-op migration target used to rehearse
	// the governance-driven upgrade path on local/testnet networks.
	UpgradeNameTestnetRehearsal = "testnet-v1-rehearsal"
)

// RegisterUpgradeHandlers registers all upgrade handlers for the application.
// This must be called after all keepers are initialized but before the app is loaded.
func (app *App) RegisterUpgradeHandlers() {
	app.UpgradeKeeper.SetUpgradeHandler(
		UpgradeNameV2,
		func(ctx context.Context, plan upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {
			// RunMigrations will detect ConsensusVersion changes and invoke
			// registered module migration functions automatically.
			return app.ModuleManager.RunMigrations(ctx, app.Configurator(), fromVM)
		},
	)

	app.UpgradeKeeper.SetUpgradeHandler(
		UpgradeNameTestnetRehearsal,
		func(ctx context.Context, plan upgradetypes.Plan, fromVM module.VersionMap) (module.VersionMap, error) {
			// Rehearses the x/upgrade governance path without changing the store
			// layout; useful for local/testnet networks that already include all
			// current module stores at genesis.
			return app.ModuleManager.RunMigrations(ctx, app.Configurator(), fromVM)
		},
	)

	// When a node starts at a height where an upgrade was applied,
	// the upgrade module needs to know which store keys were added/renamed.
	upgradeInfo, err := app.UpgradeKeeper.ReadUpgradeInfoFromDisk()
	if err != nil {
		panic(err)
	}

	if upgradeInfo.Name == UpgradeNameV2 && !app.UpgradeKeeper.IsSkipHeight(upgradeInfo.Height) {
		storeUpgrades := storetypes.StoreUpgrades{
			// Add new store keys here when introducing new modules.
			Added: []string{"oracle"},
		}
		app.SetStoreLoader(upgradetypes.UpgradeStoreLoader(upgradeInfo.Height, &storeUpgrades))
	}
}
