package governance

import (
	"cosmossdk.io/core/address"
	"cosmossdk.io/core/appmodule"
	"cosmossdk.io/core/store"
	"cosmossdk.io/depinject"
	"cosmossdk.io/depinject/appconfig"
	"github.com/cosmos/cosmos-sdk/codec"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	"clawchain/x/governance/keeper"
	"clawchain/x/governance/types"
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

type ModuleInputs struct {
	depinject.In

	Config       *types.Module
	StoreService store.KVStoreService
	Cdc          codec.Codec
	AddressCodec address.Codec

	BankKeeper types.BankKeeper
	// StakingKeeper is REQUIRED (not optional): governance is stake-weighted, so
	// a missing staking keeper must fail wiring at startup rather than silently
	// degrade voting to one-address-one-vote (a Sybil vector).
	StakingKeeper types.StakingKeeper
}

type ModuleOutputs struct {
	depinject.Out

	GovernanceKeeper keeper.Keeper
	Module           appmodule.AppModule
}

func ProvideModule(in ModuleInputs) ModuleOutputs {
	// Default to governance authority if not provided.
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
	)
	if in.StakingKeeper == nil {
		panic("governance module requires a non-nil StakingKeeper for stake-weighted voting")
	}
	k.SetStakingKeeper(in.StakingKeeper)
	m := NewAppModule(in.Cdc, k)

	return ModuleOutputs{GovernanceKeeper: k, Module: m}
}
