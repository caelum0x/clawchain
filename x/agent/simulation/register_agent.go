package simulation

import (
	"math/rand"

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
		msg := &types.MsgRegisterAgent{
			Creator: simAccount.Address.String(),
		}

		// TODO: Handle the RegisterAgent simulation

		return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), "RegisterAgent simulation not implemented"), nil, nil
	}
}
