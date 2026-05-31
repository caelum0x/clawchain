package simulation

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	sdk "github.com/cosmos/cosmos-sdk/types"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"

	"clawchain/x/privacy/keeper"
	"clawchain/x/privacy/types"
)

func SimulateMsgShield(
	ak types.AuthKeeper,
	bk types.BankKeeper,
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		simAccount, _ := simtypes.RandomAcc(r, accs)
		msgSrv := keeper.NewMsgServerImpl(k)
		msg := &types.MsgShield{
			Creator: simAccount.Address.String(),
			Amount:  uint64(r.Intn(10) + 1),
			Coins:   types.PoolDenom(),
		}

		_, err := msgSrv.Shield(sdk.WrapSDKContext(ctx), msg)
		if err != nil {
			return simtypes.NewOperationMsg(msg, false, err.Error()), nil, nil
		}

		return simtypes.NewOperationMsg(msg, true, ""), nil, nil
	}
}
