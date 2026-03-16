package agent

import (
	"cosmossdk.io/core/address"
	"cosmossdk.io/core/appmodule"
	"cosmossdk.io/core/store"
	"cosmossdk.io/depinject"
	"cosmossdk.io/depinject/appconfig"
	"github.com/cosmos/cosmos-sdk/codec"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	mintkeeper "github.com/cosmos/cosmos-sdk/x/mint/keeper"

	"clawchain/x/agent/keeper"
	"clawchain/x/agent/types"
)

// ProvideMintKeeperAdapter converts the SDK mint keeper to the agent module's
// MintKeeper interface so depinject can resolve it without a concrete-type cycle.
func ProvideMintKeeperAdapter(mk mintkeeper.Keeper) types.MintKeeper {
	return keeper.NewMintKeeperAdapter(mk)
}

var _ depinject.OnePerModuleType = AppModule{}

// IsOnePerModuleType implements the depinject.OnePerModuleType interface.
func (AppModule) IsOnePerModuleType() {}

func init() {
	appconfig.Register(
		&types.Module{},
		appconfig.Provide(ProvideModule, ProvideMintKeeperAdapter),
	)
}

type ModuleInputs struct {
	depinject.In

	Config       *types.Module
	StoreService store.KVStoreService
	Cdc          codec.Codec
	AddressCodec address.Codec

	AuthKeeper types.AuthKeeper
	BankKeeper types.BankKeeper
	MintKeeper types.MintKeeper
}

type ModuleOutputs struct {
	depinject.Out

	AgentKeeper keeper.Keeper
	Module      appmodule.AppModule
}

func ProvideModule(in ModuleInputs) ModuleOutputs {
	// default to governance authority if not provided
	authority := authtypes.NewModuleAddress(types.GovModuleName)
	if in.Config.Authority != "" {
		authority = authtypes.NewModuleAddressOrBech32Address(in.Config.Authority)
	}
	k := keeper.NewKeeper(
		in.StoreService,
		in.Cdc,
		in.AddressCodec,
		authority,
		in.BankKeeper,
		in.MintKeeper,
		nil, // ReputationKeeper wired post-init in app.go to break cycle
	)
	m := NewAppModule(in.Cdc, k, in.AuthKeeper, in.BankKeeper)

	return ModuleOutputs{AgentKeeper: k, Module: m}
}
