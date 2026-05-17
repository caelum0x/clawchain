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
				{
					RpcMethod:      "Intent",
					Use:            "intent [intent-id]",
					Short:          "Query coordination intent by ID",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "intent_id"}},
				},
				{
					RpcMethod:      "AgentActivity",
					Use:            "agent-activity [address] [limit]",
					Short:          "Query recent activity for one agent",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "address"}, {ProtoField: "limit"}},
				},
				{
					RpcMethod:      "AgentStats",
					Use:            "agent-stats [address]",
					Short:          "Query aggregate stats for one agent",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "address"}},
				},
				{
					RpcMethod:      "RecentActivity",
					Use:            "recent-activity [limit]",
					Short:          "Query recent global activity",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "limit"}},
				},
				{
					RpcMethod:      "AgentLiveness",
					Use:            "agent-liveness [address]",
					Short:          "Query liveness status (heartbeat) for an agent",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "address"}},
				},
				{
					RpcMethod: "LiveAgents",
					Use:       "live-agents",
					Short:     "List all agents with recent heartbeats (currently live on network)",
				},
				{
					RpcMethod:      "Task",
					Use:            "task [task-id]",
					Short:          "Query task by ID",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "task_id"}},
				},
				{
					RpcMethod:      "TasksByDelegator",
					Use:            "tasks-by-delegator [address]",
					Short:          "Query tasks created by a delegator",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "address"}},
				},
				{
					RpcMethod:      "TasksByAssignee",
					Use:            "tasks-by-assignee [address]",
					Short:          "Query tasks assigned to an assignee",
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
				{
					RpcMethod:      "AgentHeartbeat",
					Use:            "agent-heartbeat [node-height] [endpoint] [metadata]",
					Short:          "Send an on-chain heartbeat liveness signal",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "node_height"}, {ProtoField: "endpoint"}, {ProtoField: "metadata"}},
				},
				{
					RpcMethod:      "DelegateTask",
					Use:            "delegate-task [assignee] [description] [requirements] [skill-id] [budget] [deadline-blocks]",
					Short:          "Delegate a task to another agent",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "assignee"}, {ProtoField: "description"}, {ProtoField: "requirements"}, {ProtoField: "skill_id"}, {ProtoField: "budget"}, {ProtoField: "deadline_blocks"}},
				},
				{
					RpcMethod:      "AcceptTask",
					Use:            "accept-task [task-id]",
					Short:          "Accept a delegated task",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "task_id"}},
				},
				{
					RpcMethod:      "CompleteTask",
					Use:            "complete-task [task-id] [result]",
					Short:          "Complete a task with a result",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "task_id"}, {ProtoField: "result"}},
				},
				{
					RpcMethod: "DeregisterAgent",
					Use:       "deregister-agent",
					Short:     "Deregister an agent and withdraw deposit",
				},
				// this line is used by ignite scaffolding # autocli/tx
			},
		},
	}
}
