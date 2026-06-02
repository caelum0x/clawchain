package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/msgservice"
)

func RegisterCodec(cdc *codec.LegacyAmino) {
	cdc.RegisterConcrete(&MsgRegisterModel{}, "clawchain/modelregistry/MsgRegisterModel", nil)
	cdc.RegisterConcrete(&MsgUpdateModel{}, "clawchain/modelregistry/MsgUpdateModel", nil)
	cdc.RegisterConcrete(&MsgPublishVersion{}, "clawchain/modelregistry/MsgPublishVersion", nil)
	cdc.RegisterConcrete(&MsgDelistModel{}, "clawchain/modelregistry/MsgDelistModel", nil)
	cdc.RegisterConcrete(&MsgPurchaseAccess{}, "clawchain/modelregistry/MsgPurchaseAccess", nil)
	cdc.RegisterConcrete(&MsgRenewSubscription{}, "clawchain/modelregistry/MsgRenewSubscription", nil)
	cdc.RegisterConcrete(&MsgRateModel{}, "clawchain/modelregistry/MsgRateModel", nil)
	cdc.RegisterConcrete(&MsgRegisterInferenceProvider{}, "clawchain/modelregistry/MsgRegisterInferenceProvider", nil)
	cdc.RegisterConcrete(&MsgSetInferencePricing{}, "clawchain/modelregistry/MsgSetInferencePricing", nil)
	cdc.RegisterConcrete(&MsgSubmitInferenceJob{}, "clawchain/modelregistry/MsgSubmitInferenceJob", nil)
	cdc.RegisterConcrete(&MsgStartInferenceJob{}, "clawchain/modelregistry/MsgStartInferenceJob", nil)
	cdc.RegisterConcrete(&MsgCompleteInferenceJob{}, "clawchain/modelregistry/MsgCompleteInferenceJob", nil)
	cdc.RegisterConcrete(&MsgFailInferenceJob{}, "clawchain/modelregistry/MsgFailInferenceJob", nil)
	cdc.RegisterConcrete(&MsgProviderHeartbeat{}, "clawchain/modelregistry/MsgProviderHeartbeat", nil)
	cdc.RegisterConcrete(&MsgSubmitUsageAttestation{}, "clawchain/modelregistry/MsgSubmitUsageAttestation", nil)
	cdc.RegisterConcrete(&MsgDisputeInferenceJob{}, "clawchain/modelregistry/MsgDisputeInferenceJob", nil)
	cdc.RegisterConcrete(&MsgResolveInferenceDispute{}, "clawchain/modelregistry/MsgResolveInferenceDispute", nil)
}

func RegisterInterfaces(registry cdctypes.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgRegisterModel{},
		&MsgUpdateModel{},
		&MsgPublishVersion{},
		&MsgDelistModel{},
		&MsgPurchaseAccess{},
		&MsgRenewSubscription{},
		&MsgRateModel{},
		&MsgRegisterInferenceProvider{},
		&MsgSetInferencePricing{},
		&MsgSubmitInferenceJob{},
		&MsgStartInferenceJob{},
		&MsgCompleteInferenceJob{},
		&MsgFailInferenceJob{},
		&MsgProviderHeartbeat{},
		&MsgSubmitUsageAttestation{},
		&MsgDisputeInferenceJob{},
		&MsgResolveInferenceDispute{},
	)
	msgservice.RegisterMsgServiceDesc(registry, &Msg_serviceDesc)
}
