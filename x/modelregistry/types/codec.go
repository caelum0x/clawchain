package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/msgservice"
)

func RegisterCodec(cdc *codec.LegacyAmino) {
	cdc.RegisterConcrete(&MsgRegisterModel{}, "clawchain/modelregistry/MsgRegisterModel", nil)
	cdc.RegisterConcrete(&MsgPublishVersion{}, "clawchain/modelregistry/MsgPublishVersion", nil)
	cdc.RegisterConcrete(&MsgDelistModel{}, "clawchain/modelregistry/MsgDelistModel", nil)
	cdc.RegisterConcrete(&MsgPurchaseAccess{}, "clawchain/modelregistry/MsgPurchaseAccess", nil)
	cdc.RegisterConcrete(&MsgRateModel{}, "clawchain/modelregistry/MsgRateModel", nil)
	cdc.RegisterConcrete(&MsgSubmitInferenceJob{}, "clawchain/modelregistry/MsgSubmitInferenceJob", nil)
	cdc.RegisterConcrete(&MsgRenewSubscription{}, "clawchain/modelregistry/MsgRenewSubscription", nil)
}

func RegisterInterfaces(registry cdctypes.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgRegisterModel{},
		&MsgPublishVersion{},
		&MsgDelistModel{},
		&MsgPurchaseAccess{},
		&MsgRateModel{},
		&MsgSubmitInferenceJob{},
		&MsgRenewSubscription{},
	)
	msgservice.RegisterMsgServiceDesc(registry, &Msg_serviceDesc)
}
