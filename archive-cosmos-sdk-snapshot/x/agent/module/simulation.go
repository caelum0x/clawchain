package agent

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/types/module"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"
	"github.com/cosmos/cosmos-sdk/x/simulation"

	agentsimulation "clawchain/x/agent/simulation"
	"clawchain/x/agent/types"
)

// GenerateGenesisState creates a randomized GenState of the module.
func (AppModule) GenerateGenesisState(simState *module.SimulationState) {
	accs := make([]string, len(simState.Accounts))
	for i, acc := range simState.Accounts {
		accs[i] = acc.Address.String()
	}
	agentGenesis := types.GenesisState{
		Params: types.DefaultParams(),
	}
	simState.GenState[types.ModuleName] = simState.Cdc.MustMarshalJSON(&agentGenesis)
}

// RegisterStoreDecoder registers a decoder.
func (am AppModule) RegisterStoreDecoder(_ simtypes.StoreDecoderRegistry) {}

// WeightedOperations returns the all the gov module operations with their respective weights.
func (am AppModule) WeightedOperations(simState module.SimulationState) []simtypes.WeightedOperation {
	operations := make([]simtypes.WeightedOperation, 0)
	const (
		opWeightMsgRegisterAgent          = "op_weight_msg_register_agent"
		defaultWeightMsgRegisterAgent int = 100
	)

	var weightMsgRegisterAgent int
	simState.AppParams.GetOrGenerate(opWeightMsgRegisterAgent, &weightMsgRegisterAgent, nil,
		func(_ *rand.Rand) {
			weightMsgRegisterAgent = defaultWeightMsgRegisterAgent
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgRegisterAgent,
		agentsimulation.SimulateMsgRegisterAgent(am.authKeeper, am.bankKeeper, am.keeper, simState.TxConfig),
	))
	const (
		opWeightMsgAgentAction          = "op_weight_msg_agent_action"
		defaultWeightMsgAgentAction int = 100
	)

	var weightMsgAgentAction int
	simState.AppParams.GetOrGenerate(opWeightMsgAgentAction, &weightMsgAgentAction, nil,
		func(_ *rand.Rand) {
			weightMsgAgentAction = defaultWeightMsgAgentAction
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgAgentAction,
		agentsimulation.SimulateMsgAgentAction(am.authKeeper, am.bankKeeper, am.keeper, simState.TxConfig),
	))

	return operations
}

// ProposalMsgs returns msgs used for governance proposals for simulations.
func (am AppModule) ProposalMsgs(simState module.SimulationState) []simtypes.WeightedProposalMsg {
	return []simtypes.WeightedProposalMsg{}
}
