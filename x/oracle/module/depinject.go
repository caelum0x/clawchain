package oracle

import (
	"cosmossdk.io/core/appmodule"
	"cosmossdk.io/core/store"
	"cosmossdk.io/depinject"
	"cosmossdk.io/depinject/appconfig"
	"github.com/cosmos/cosmos-sdk/codec"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	"clawchain/x/oracle/keeper"
	"clawchain/x/oracle/types"
)

var _ depinject.OnePerModuleType = AppModule{}

// IsOnePerModuleType implements the depinject.OnePerModuleType interface.
func (AppModule) IsOnePerModuleType() {}

func init() {
	appconfig.Register(
		&types.Module{},
		appconfig.Provide(ProvideModule),
	)
}

// ModuleInputs defines the inputs for the oracle module provider.
type ModuleInputs struct {
	depinject.In

	Config       *types.Module
	StoreService store.KVStoreService
	Cdc          codec.Codec

	StakingKeeper types.StakingKeeper `optional:"true"`
	BankKeeper    types.BankKeeper    `optional:"true"`
}

// ModuleOutputs defines the outputs for the oracle module provider.
type ModuleOutputs struct {
	depinject.Out

	OracleKeeper keeper.Keeper
	Module       appmodule.AppModule
}

// ProvideModule creates and returns the oracle module components.
func ProvideModule(in ModuleInputs) ModuleOutputs {
	authority := authtypes.NewModuleAddress(types.GovModuleName)
	if in.Config.Authority != "" {
		authority = authtypes.NewModuleAddressOrBech32Address(in.Config.Authority)
	}

	k := keeper.NewKeeper(
		in.StoreService,
		in.Cdc,
		authority,
		in.StakingKeeper,
		in.BankKeeper,
	)
	m := NewAppModule(in.Cdc, k)

	return ModuleOutputs{OracleKeeper: k, Module: m}
}
