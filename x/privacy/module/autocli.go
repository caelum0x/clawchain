package privacy

import (
	autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"

	"clawchain/x/privacy/types"
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
					RpcMethod:      "MerkleRoot",
					Use:            "merkle-root ",
					Short:          "Query merkle-root",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{},
				},

				{
					RpcMethod:      "NullifierExists",
					Use:            "nullifier-exists [nullifier]",
					Short:          "Query nullifier-exists",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "nullifier"}},
				},
				{
					RpcMethod:      "RootHistory",
					Use:            "root-history [offset] [limit]",
					Short:          "Query paginated merkle root history",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "offset"}, {ProtoField: "limit"}},
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
					RpcMethod:      "PrivateTransfer",
					Use:            "private-transfer [old-commitments] [new-commitments] [nullifiers] [root] [proof]",
					Short:          "Send a private-transfer tx",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "old_commitments"}, {ProtoField: "new_commitments"}, {ProtoField: "nullifiers"}, {ProtoField: "root"}, {ProtoField: "proof"}},
				},
				{
					RpcMethod:      "Shield",
					Use:            "shield [amount] [coins]",
					Short:          "Send a shield tx",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "amount"}, {ProtoField: "coins"}},
				},
				{
					RpcMethod:      "Unshield",
					Use:            "unshield [commitment] [nullifier] [proof] [amount] [recipient]",
					Short:          "Send a unshield tx",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "commitment"}, {ProtoField: "nullifier"}, {ProtoField: "proof"}, {ProtoField: "amount"}, {ProtoField: "recipient"}},
				},
				// this line is used by ignite scaffolding # autocli/tx
			},
		},
	}
}
