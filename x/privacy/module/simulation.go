package privacy

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/types/module"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"
	"github.com/cosmos/cosmos-sdk/x/simulation"

	privacysimulation "clawchain/x/privacy/simulation"
	"clawchain/x/privacy/types"
)

// GenerateGenesisState creates a randomized GenState of the module.
func (AppModule) GenerateGenesisState(simState *module.SimulationState) {
	accs := make([]string, len(simState.Accounts))
	for i, acc := range simState.Accounts {
		accs[i] = acc.Address.String()
	}
	privacyGenesis := types.GenesisState{
		Params: types.DefaultParams(),
	}
	simState.GenState[types.ModuleName] = simState.Cdc.MustMarshalJSON(&privacyGenesis)
}

// RegisterStoreDecoder registers a decoder.
func (am AppModule) RegisterStoreDecoder(_ simtypes.StoreDecoderRegistry) {}

// WeightedOperations returns the all the gov module operations with their respective weights.
func (am AppModule) WeightedOperations(simState module.SimulationState) []simtypes.WeightedOperation {
	operations := make([]simtypes.WeightedOperation, 0)
	const (
		opWeightMsgPrivateTransfer          = "op_weight_msg_privacy"
		defaultWeightMsgPrivateTransfer int = 100
	)

	var weightMsgPrivateTransfer int
	simState.AppParams.GetOrGenerate(opWeightMsgPrivateTransfer, &weightMsgPrivateTransfer, nil,
		func(_ *rand.Rand) {
			weightMsgPrivateTransfer = defaultWeightMsgPrivateTransfer
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgPrivateTransfer,
		privacysimulation.SimulateMsgPrivateTransfer(am.authKeeper, am.bankKeeper, am.keeper, simState.TxConfig),
	))
	const (
		opWeightMsgShield          = "op_weight_msg_privacy"
		defaultWeightMsgShield int = 100
	)

	var weightMsgShield int
	simState.AppParams.GetOrGenerate(opWeightMsgShield, &weightMsgShield, nil,
		func(_ *rand.Rand) {
			weightMsgShield = defaultWeightMsgShield
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgShield,
		privacysimulation.SimulateMsgShield(am.authKeeper, am.bankKeeper, am.keeper, simState.TxConfig),
	))
	const (
		opWeightMsgUnshield          = "op_weight_msg_privacy"
		defaultWeightMsgUnshield int = 100
	)

	var weightMsgUnshield int
	simState.AppParams.GetOrGenerate(opWeightMsgUnshield, &weightMsgUnshield, nil,
		func(_ *rand.Rand) {
			weightMsgUnshield = defaultWeightMsgUnshield
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgUnshield,
		privacysimulation.SimulateMsgUnshield(am.authKeeper, am.bankKeeper, am.keeper, simState.TxConfig),
	))

	return operations
}

// ProposalMsgs returns msgs used for governance proposals for simulations.
func (am AppModule) ProposalMsgs(simState module.SimulationState) []simtypes.WeightedProposalMsg {
	return []simtypes.WeightedProposalMsg{}
}
