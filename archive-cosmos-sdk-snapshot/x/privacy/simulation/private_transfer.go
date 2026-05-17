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

func SimulateMsgPrivateTransfer(
	ak types.AuthKeeper,
	bk types.BankKeeper,
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		simAccount, _ := simtypes.RandomAcc(r, accs)
		msg := &types.MsgPrivateTransfer{
			Creator: simAccount.Address.String(),
		}

		// Private transfer simulation requires valid proof material and existing
		// shielded notes/nullifiers. Those are generated off-chain and are not
		// available in generic simulation mode, so keep this operation as a no-op.

		return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), "private transfer requires off-chain zk proof inputs"), nil, nil
	}
}
