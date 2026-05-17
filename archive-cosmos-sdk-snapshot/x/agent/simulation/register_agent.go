package simulation

import (
	"math/rand"
	"strings"

	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	sdk "github.com/cosmos/cosmos-sdk/types"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"

	"clawchain/x/agent/keeper"
	"clawchain/x/agent/types"
)

func SimulateMsgRegisterAgent(
	ak types.AuthKeeper,
	bk types.BankKeeper,
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		simAccount, _ := simtypes.RandomAcc(r, accs)
		msgSrv := keeper.NewMsgServerImpl(k)
		msg := &types.MsgRegisterAgent{
			Creator: simAccount.Address.String(),
			Name:    "sim-agent-" + strings.ToLower(simtypes.RandStringOfLength(r, 6)),
			Pubkey:  strings.ToLower(simtypes.RandStringOfLength(r, 66)),
		}

		_, err := msgSrv.RegisterAgent(sdk.WrapSDKContext(ctx), msg)
		if err != nil {
			return simtypes.NewOperationMsg(msg, false, err.Error()), nil, nil
		}

		return simtypes.NewOperationMsg(msg, true, ""), nil, nil
	}
}
