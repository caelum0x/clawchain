package modelregistry

import (
	"cosmossdk.io/core/address"
	"cosmossdk.io/core/appmodule"
	"cosmossdk.io/core/store"
	"cosmossdk.io/depinject"
	"cosmossdk.io/depinject/appconfig"
	txsigning "cosmossdk.io/x/tx/signing"
	"github.com/cosmos/cosmos-sdk/codec"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"

	"clawchain/x/modelregistry/keeper"
	"clawchain/x/modelregistry/types"
)

var _ depinject.OnePerModuleType = AppModule{}

func (AppModule) IsOnePerModuleType() {}

// ProvideCustomGetSigners registers the MsgRenewSubscription signer getter.
// The message type was added post-codegen so it lacks the cosmos.msg.v1.signer
// proto extension; this custom getter tells the signing context to extract the
// "buyer" field.
func ProvideCustomGetSigners(addressCodec address.Codec) txsigning.CustomGetSigner {
	return txsigning.CustomGetSigner{
		MsgType: "clawchain.modelregistry.v1.MsgRenewSubscription",
		Fn: func(msg proto.Message) ([][]byte, error) {
			// Get the "buyer" field via proto reflection.
			refMsg := msg.ProtoReflect()
			fd := refMsg.Descriptor().Fields().ByName(protoreflect.Name("buyer"))
			if fd == nil {
				return nil, nil
			}
			buyer := refMsg.Get(fd).String()
			addr, err := addressCodec.StringToBytes(buyer)
			if err != nil {
				return nil, err
			}
			return [][]byte{addr}, nil
		},
	}
}

func init() {
	appconfig.Register(
		&types.Module{},
		appconfig.Provide(ProvideModule, ProvideCustomGetSigners),
	)
}

type ModuleInputs struct {
	depinject.In

	Config       *types.Module
	StoreService store.KVStoreService
	Cdc          codec.Codec
	AddressCodec address.Codec

	BankKeeper types.BankKeeper
}

type ModuleOutputs struct {
	depinject.Out

	ModelRegistryKeeper keeper.Keeper
	Module              appmodule.AppModule
}

func ProvideModule(in ModuleInputs) ModuleOutputs {
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
	m := NewAppModule(in.Cdc, k, in.BankKeeper)

	return ModuleOutputs{ModelRegistryKeeper: k, Module: m}
}
