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

func SimulateMsgUnshield(
	ak types.AuthKeeper,
	bk types.BankKeeper,
	k keeper.Keeper,
	txGen client.TxConfig,
) simtypes.Operation {
	return func(r *rand.Rand, app *baseapp.BaseApp, ctx sdk.Context, accs []simtypes.Account, chainID string,
	) (simtypes.OperationMsg, []simtypes.FutureOperation, error) {
		simAccount, _ := simtypes.RandomAcc(r, accs)
		msg := &types.MsgUnshield{
			Creator: simAccount.Address.String(),
		}

		// Unshield simulation requires a valid proof and an unspent shielded note.
		// These values are generated off-chain and cannot be synthesized here.

		return simtypes.NoOpMsg(types.ModuleName, sdk.MsgTypeURL(msg), "unshield requires off-chain zk proof inputs"), nil, nil
	}
}
