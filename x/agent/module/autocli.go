package agent

import (
	autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"

	"clawchain/x/agent/types"
)

// AutoCLIOptions implements the autocli.HasAutoCLIConfig interface.
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
					RpcMethod:      "Agent",
					Use:            "agent [address]",
					Short:          "Query agent",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "address"}},
				},

				// this line is used by ignite scaffolding # autocli/query
			},
		},
		Tx: &autocliv1.ServiceCommandDescriptor{
			Service:              types.Msg_serviceDesc.ServiceName,
			EnhanceCustomCommand: true, // only required if you want to use the custom command
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod: "UpdateParams",
					Skip:      true, // skipped because authority gated
				},
				{
					RpcMethod:      "RegisterAgent",
					Use:            "register-agent [pubkey] [endpoint] [name]",
					Short:          "Send a register-agent tx",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "pubkey"}, {ProtoField: "endpoint"}, {ProtoField: "name"}},
				},
				{
					RpcMethod:      "AgentAction",
					Use:            "agent-action [action-type] [payload] [proof]",
					Short:          "Send a agent-action tx",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "action_type"}, {ProtoField: "payload"}, {ProtoField: "proof"}},
				},
				// this line is used by ignite scaffolding # autocli/tx
			},
		},
	}
}
