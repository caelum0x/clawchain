package messaging

import (
	autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"

	"clawchain/x/messaging/types"
)

func (am AppModule) AutoCLIOptions() *autocliv1.ModuleOptions {
	return &autocliv1.ModuleOptions{
		Query: &autocliv1.ServiceCommandDescriptor{
			Service: types.Query_serviceDesc.ServiceName,
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod: "Params",
					Use:       "params",
					Short:     "Shows the parameters of the module",
				},
				{
					RpcMethod:      "Messages",
					Use:            "messages [address]",
					Short:          "Query messages for an address",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "address"}},
				},
				{
					RpcMethod:      "Conversation",
					Use:            "conversation [address-a] [address-b]",
					Short:          "Query conversation between two addresses",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "address_a"}, {ProtoField: "address_b"}},
				},
			},
		},
		Tx: &autocliv1.ServiceCommandDescriptor{
			Service:              types.Msg_serviceDesc.ServiceName,
			EnhanceCustomCommand: true,
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod: "UpdateParams",
					Skip:      true,
				},
				{
					RpcMethod:      "SendMessage",
					Use:            "send-message [recipient] [ciphertext] [nonce]",
					Short:          "Send an encrypted on-chain message",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "recipient"}, {ProtoField: "ciphertext"}, {ProtoField: "nonce"}},
				},
				{
					RpcMethod:      "AckMessage",
					Use:            "ack-message [message-id]",
					Short:          "Acknowledge receipt of a message",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "message_id"}},
				},
			},
		},
	}
}
