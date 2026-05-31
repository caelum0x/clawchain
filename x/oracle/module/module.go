// Package module provides the depinject bridge for the Terra-forked oracle module.
// It adapts the oracle.AppModule (which uses classic Cosmos SDK patterns) for use
// with depinject-based app wiring in ClawChain.
package module

import (
	"clawchain/x/oracle"
	"clawchain/x/oracle/keeper"
	"clawchain/x/oracle/types"

	"cosmossdk.io/core/appmodule"
	"cosmossdk.io/depinject"
	"cosmossdk.io/depinject/appconfig"
	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/codec"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	distrkeeper "github.com/cosmos/cosmos-sdk/x/distribution/keeper"
	paramstypes "github.com/cosmos/cosmos-sdk/x/params/types"
	stakingkeeper "github.com/cosmos/cosmos-sdk/x/staking/keeper"
)

func init() {
	appconfig.Register(
		&types.Module{},
		appconfig.Provide(ProvideModule),
	)
}

// ModuleInputs defines the depinject inputs for the oracle module.
type ModuleInputs struct {
	depinject.In

	// NOTE: request only the raw KVStoreKey (the keeper is legacy-style). Do NOT
	// also request store.KVStoreService — the runtime would create and mount a
	// second "oracle" store key, causing a duplicate-store-key panic at startup.
	Config *types.Module
	Cdc    codec.Codec
	Key    *storetypes.KVStoreKey

	AccountKeeper types.AccountKeeper
	BankKeeper    types.BankKeeper
	DistrKeeper   distrkeeper.Keeper
	StakingKeeper *stakingkeeper.Keeper

	ParamsKeeper interface {
		GetSubspace(moduleName string) (paramstypes.Subspace, bool)
		Subspace(s string) paramstypes.Subspace
	} `optional:"true"`
}

// ModuleOutputs defines the depinject outputs for the oracle module.
type ModuleOutputs struct {
	depinject.Out

	OracleKeeper keeper.Keeper
	Module       appmodule.AppModule
}

// ProvideModule creates and returns the oracle module components.
func ProvideModule(in ModuleInputs) ModuleOutputs {
	// Get or create the param subspace — oracle module requires a valid subspace
	var paramSpace paramstypes.Subspace
	if in.ParamsKeeper != nil {
		ps, ok := in.ParamsKeeper.GetSubspace(types.ModuleName)
		if !ok {
			// The oracle subspace hasn't been registered yet — register it now.
			// The keeper installs its own key table (see NewKeeper), so a bare
			// subspace is sufficient here.
			ps = in.ParamsKeeper.Subspace(types.ModuleName)
		}
		paramSpace = ps
	}
	if paramSpace.Name() == "" {
		panic("oracle module requires a valid params subspace; ensure ParamsKeeper is wired in depinject")
	}

	// Get the KV store key — use the injected one or derive from StoreService
	storeKey := in.Key
	if storeKey == nil {
		storeKey = storetypes.NewKVStoreKey(types.StoreKey)
	}

	k := keeper.NewKeeper(
		in.Cdc,
		storeKey,
		paramSpace,
		in.AccountKeeper,
		in.BankKeeper,
		in.DistrKeeper,
		in.StakingKeeper,
		authtypes.FeeCollectorName,
	)

	m := oracle.NewAppModule(
		in.Cdc,
		k,
		in.AccountKeeper,
		in.BankKeeper,
	)

	return ModuleOutputs{OracleKeeper: k, Module: m}
}
