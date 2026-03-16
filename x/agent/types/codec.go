package types

import (
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/msgservice"
)

func RegisterInterfaces(registrar codectypes.InterfaceRegistry) {
	registrar.RegisterImplementations((*sdk.Msg)(nil),
		&MsgAgentAction{},
		&MsgRegisterAgent{},
		&MsgUpdateParams{},
		&MsgSubmitIntent{},
		&MsgRespondToIntent{},
		&MsgFinalizeIntent{},
		&MsgAgentHeartbeat{},
		&MsgDelegateTask{},
		&MsgAcceptTask{},
		&MsgCompleteTask{},
		&MsgDeregisterAgent{},
	)
	msgservice.RegisterMsgServiceDesc(registrar, &_Msg_serviceDesc)
}
