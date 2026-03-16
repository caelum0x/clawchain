package governance

import (
	autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"

	"clawchain/x/governance/types"
)

// AutoCLIOptions implements the autocli.HasAutoCLIConfig interface.
func (am AppModule) AutoCLIOptions() *autocliv1.ModuleOptions {
	return &autocliv1.ModuleOptions{
		Query: &autocliv1.ServiceCommandDescriptor{
			Service: types.Query_serviceDesc.ServiceName,
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod:      "Proposal",
					Use:            "proposal [proposal-id]",
					Short:          "Query a single governance proposal by ID",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "proposal_id"}},
				},
				{
					RpcMethod: "Proposals",
					Use:       "proposals",
					Short:     "Query all governance proposals",
				},
				{
					RpcMethod:      "Votes",
					Use:            "votes [proposal-id]",
					Short:          "Query all votes for a proposal",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "proposal_id"}},
				},
			},
		},
		Tx: &autocliv1.ServiceCommandDescriptor{
			Service:              types.Msg_serviceDesc.ServiceName,
			EnhanceCustomCommand: true,
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod:      "SubmitProposal",
					Use:            "submit-proposal [title] [description] [module] [param-key] [proposed-value] [deposit-amount]",
					Short:          "Submit a parameter change proposal",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "title"}, {ProtoField: "description"}, {ProtoField: "module"}, {ProtoField: "param_key"}, {ProtoField: "proposed_value"}, {ProtoField: "deposit_amount"}},
				},
				{
					RpcMethod:      "Vote",
					Use:            "vote [proposal-id] [option]",
					Short:          "Vote on a governance proposal (yes/no/abstain)",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "proposal_id"}, {ProtoField: "option"}},
				},
			},
		},
	}
}
