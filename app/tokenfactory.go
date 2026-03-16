package app

import (
	"fmt"

	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	tokenfactorykeeper "clawchain/x/tokenfactory/keeper"
	tokenfactorymodule "clawchain/x/tokenfactory/module"
	tokenfactorytypes "clawchain/x/tokenfactory/types"
)

// initTokenFactoryKeeper creates the TokenFactory store key and keeper.
// Must be called before initWasmKeeper so the wasm message handler decorator
// can reference the tokenfactory keeper for intercepting Osmosis-style messages.
func (app *App) initTokenFactoryKeeper() error {
	// Register store key
	if err := app.RegisterStores(
		storetypes.NewKVStoreKey(tokenfactorytypes.StoreKey),
	); err != nil {
		return fmt.Errorf("failed to register tokenfactory store: %w", err)
	}

	// Module authority (governance module address)
	authority := authtypes.NewModuleAddress(tokenfactorytypes.ModuleName)

	// Create keeper
	app.TokenFactoryKeeper = tokenfactorykeeper.NewKeeper(
		runtime.NewKVStoreService(app.GetKey(tokenfactorytypes.StoreKey)),
		app.AuthKeeper.AddressCodec(),
		authority,
		app.BankKeeper,
	)

	return nil
}

// registerTokenFactoryModule registers the TokenFactory AppModule.
// Must be called after the keeper is initialized via initTokenFactoryKeeper.
func (app *App) registerTokenFactoryModule() error {
	if err := app.RegisterModules(
		tokenfactorymodule.NewAppModule(app.appCodec, app.TokenFactoryKeeper),
	); err != nil {
		return fmt.Errorf("failed to register tokenfactory module: %w", err)
	}

	return nil
}
