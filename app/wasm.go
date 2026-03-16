package app

import (
	"fmt"
	"path/filepath"

	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	servertypes "github.com/cosmos/cosmos-sdk/server/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	distrkeeper "github.com/cosmos/cosmos-sdk/x/distribution/keeper"
	govtypes "github.com/cosmos/cosmos-sdk/x/gov/types"

	"github.com/CosmWasm/wasmd/x/wasm"
	wasmkeeper "github.com/CosmWasm/wasmd/x/wasm/keeper"
	wasmtypes "github.com/CosmWasm/wasmd/x/wasm/types"
)

// initWasmKeeper creates the WasmKeeper and registers its store key.
// Must be called after IBC keeper is created but before the IBC router is sealed.
// Returns the wasm IBC handler to be added to the IBC router in ibc.go.
func (app *App) initWasmKeeper(appOpts servertypes.AppOptions) error {
	// Register store key
	if err := app.RegisterStores(
		storetypes.NewKVStoreKey(wasmtypes.StoreKey),
	); err != nil {
		return err
	}

	govModuleAddr, _ := app.AuthKeeper.AddressCodec().BytesToString(
		authtypes.NewModuleAddress(govtypes.ModuleName),
	)

	// Read wasm config from app options
	wasmDir := filepath.Join(DefaultNodeHome, "wasm")
	nodeConfig, err := wasm.ReadNodeConfig(appOpts)
	if err != nil {
		return fmt.Errorf("error while reading wasm config: %w", err)
	}

	// Create WasmKeeper with tokenfactory message handler decorator.
	// The decorator intercepts Osmosis tokenfactory messages from contracts
	// and routes them directly to our keeper, bypassing proto descriptor lookup.
	app.WasmKeeper = wasmkeeper.NewKeeper(
		app.appCodec,
		runtime.NewKVStoreService(app.GetKey(wasmtypes.StoreKey)),
		app.AuthKeeper,
		app.BankKeeper,
		app.StakingKeeper,
		distrkeeper.NewQuerier(app.DistrKeeper),
		app.IBCKeeper.ChannelKeeper,
		app.IBCKeeper.ChannelKeeper,
		app.IBCKeeper.ChannelKeeperV2,
		app.TransferKeeper,
		app.MsgServiceRouter(),
		app.GRPCQueryRouter(),
		wasmDir,
		nodeConfig,
		wasmtypes.VMConfig{},
		append(wasmkeeper.BuiltInCapabilities(), "token_factory"),
		govModuleAddr,
		wasmkeeper.WithMessageHandlerDecorator(
			newTokenFactoryMessageDecorator(&app.TokenFactoryKeeper),
		),
	)

	return nil
}

// registerWasmModule registers the CosmWasm module and snapshot extensions.
// Must be called after the IBC router is sealed and modules are registered.
func (app *App) registerWasmModule() error {
	if err := app.RegisterModules(
		wasm.NewAppModule(app.appCodec, &app.WasmKeeper, app.StakingKeeper, app.AuthKeeper, app.BankKeeper, app.MsgServiceRouter(), nil),
	); err != nil {
		return err
	}

	// Register wasm snapshot extension for state sync
	if manager := app.SnapshotManager(); manager != nil {
		if err := manager.RegisterExtensions(
			wasmkeeper.NewWasmSnapshotter(app.CommitMultiStore(), &app.WasmKeeper),
		); err != nil {
			return fmt.Errorf("failed to register wasm snapshot extension: %w", err)
		}
	}

	return nil
}
