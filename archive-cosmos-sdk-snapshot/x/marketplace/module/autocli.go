package marketplace

import (
	autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"

	"clawchain/x/marketplace/types"
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
					RpcMethod: "Skills",
					Use:       "skills",
					Short:     "Query all marketplace skills",
				},
				{
					RpcMethod:      "Skill",
					Use:            "skill [skill-id]",
					Short:          "Query a skill by ID",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "skill_id"}},
				},
				{
					RpcMethod:      "SkillsByCategory",
					Use:            "skills-by-category [category]",
					Short:          "Query skills by category",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "category"}},
				},
				{
					RpcMethod:      "SkillsByOwner",
					Use:            "skills-by-owner [owner]",
					Short:          "Query skills by owner address",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "owner"}},
				},
				{
					RpcMethod:      "SkillSearch",
					Use:            "skill-search [query]",
					Short:          "Search skills by name, description, and tags",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "query"}},
				},
				{
					RpcMethod:      "SkillAnalytics",
					Use:            "skill-analytics [skill-id]",
					Short:          "Query analytics for a skill",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "skill_id"}},
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
					RpcMethod:      "ListSkill",
					Use:            "list-skill [name] [description] [price] [denom]",
					Short:          "List a skill on the marketplace",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "name"}, {ProtoField: "description"}, {ProtoField: "price"}, {ProtoField: "denom"}},
				},
				{
					RpcMethod:      "DelistSkill",
					Use:            "delist-skill [skill-id]",
					Short:          "Delist a skill from the marketplace",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "skill_id"}},
				},
				{
					RpcMethod:      "PurchaseSkill",
					Use:            "purchase-skill [skill-id]",
					Short:          "Purchase a skill from the marketplace",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "skill_id"}},
				},
			},
		},
	}
}
