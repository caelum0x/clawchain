package simulation

import (
	"errors"
	"math/rand"
	"strings"

	"cosmossdk.io/collections"
	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	sdk "github.com/cosmos/cosmos-sdk/types"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"

	"clawchain/x/agent/keeper"
	"clawchain/x/agent/types"
)

func SimulateMsgAgentAction(
	ak types.AuthKeeper,
	bk types.BankKeeper,
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		simAccount, _ := simtypes.RandomAcc(r, accs)
		msgSrv := keeper.NewMsgServerImpl(k)
		agentAddress := simAccount.Address.String()

		_, err := k.Agents.Get(ctx, agentAddress)
		if err != nil {
			if !errors.Is(err, collections.ErrNotFound) {
				return simtypes.NoOpMsg(types.ModuleName, "msg_agent_action", "failed to check agent existence"), nil, nil
			}
			_, err = msgSrv.RegisterAgent(sdk.WrapSDKContext(ctx), &types.MsgRegisterAgent{
				Creator: agentAddress,
				Name:    "sim-agent-" + strings.ToLower(simtypes.RandStringOfLength(r, 6)),
				Pubkey:  strings.ToLower(simtypes.RandStringOfLength(r, 66)),
			})
			if err != nil {
				return simtypes.NoOpMsg(types.ModuleName, "msg_agent_action", "unable to auto-register simulation agent"), nil, nil
			}
		}

		actionTypes := []string{"query", "heartbeat"}
		msg := &types.MsgAgentAction{
			Creator:    agentAddress,
			ActionType: actionTypes[r.Intn(len(actionTypes))],
			Payload:    "sim-payload-" + strings.ToLower(simtypes.RandStringOfLength(r, 12)),
		}

		_, err = msgSrv.AgentAction(sdk.WrapSDKContext(ctx), msg)
		if err != nil {
			return simtypes.NewOperationMsg(msg, false, err.Error()), nil, nil
		}

		return simtypes.NewOperationMsg(msg, true, ""), nil, nil
	}
}
