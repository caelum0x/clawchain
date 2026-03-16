package types

import (
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/msgservice"
)

func RegisterInterfaces(registrar codectypes.InterfaceRegistry) {
	registrar.RegisterImplementations((*sdk.Msg)(nil),
		&MsgUnshield{},
	)

	registrar.RegisterImplementations((*sdk.Msg)(nil),
		&MsgShield{},
	)

	registrar.RegisterImplementations((*sdk.Msg)(nil),
		&MsgPrivateTransfer{},
	)

	registrar.RegisterImplementations((*sdk.Msg)(nil),
		&MsgUpdateParams{},
	)
	registrar.RegisterImplementations((*sdk.Msg)(nil),
		&MsgRegisterViewKey{},
	)
	registrar.RegisterImplementations((*sdk.Msg)(nil),
		&MsgBatchPrivateTransfer{},
	)
	msgservice.RegisterMsgServiceDesc(registrar, &_Msg_serviceDesc)
}
