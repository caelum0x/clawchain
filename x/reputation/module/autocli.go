package reputation

import autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"
import "clawchain/x/reputation/types"

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
					RpcMethod:      "Reputation",
					Use:            "reputation [agent-address]",
					Short:          "Query reputation for one agent",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "agent_address"}},
				},
				{
					RpcMethod:      "Ratings",
					Use:            "ratings [agent-address]",
					Short:          "Query ratings for one agent",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "agent_address"}},
				},
				{
					RpcMethod:      "Endorsements",
					Use:            "endorsements [agent-address]",
					Short:          "Query endorsements for one agent",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "agent_address"}},
				},
				{
					RpcMethod: "TopAgents",
					Use:       "top-agents",
					Short:     "Query top agents by reputation",
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
					RpcMethod:      "RateAgent",
					Use:            "rate-agent [agent-address] [skill-id] [score] [comment]",
					Short:          "Rate an agent after a valid skill purchase",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "agent_address"}, {ProtoField: "skill_id"}, {ProtoField: "score"}, {ProtoField: "comment"}},
				},
				{
					RpcMethod:      "EndorseAgent",
					Use:            "endorse-agent [agent-address] [reason]",
					Short:          "Endorse an agent",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "agent_address"}, {ProtoField: "reason"}},
				},
			},
		},
	}
}
