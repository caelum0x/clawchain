package keeper_test

import (
	"testing"

	"fmt"

	"github.com/stretchr/testify/require"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/agent/keeper"
	"clawchain/x/agent/types"
)

func TestDelegateTaskReputationGating(t *testing.T) {
	delegatorAddr := sdk.AccAddress([]byte("delegator___________"))
	delegator := delegatorAddr.String()
	assignee := sdk.AccAddress([]byte("assignee____________")).String()

	// Assignee has low reputation (2000 bps = 20%), below the default 5000 bps minimum.
	f := initFixtureWithReputation(t, map[string]uint64{
		assignee: 2000,
	})

	// Fund delegator for escrow.
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	ms := keeper.NewMsgServerImpl(f.keeper)

	// Register both agents.
	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: delegator,
		Name:    "delegator-agent",
		Pubkey:  "pk_delegator",
	})
	require.NoError(t, err)

	_, err = ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: assignee,
		Name:    "assignee-agent",
		Pubkey:  "pk_assignee",
	})
	require.NoError(t, err)

	// HighImpactMinDepositUclaw default is set in params.
	// A high-value task budget exceeds this threshold.
	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Greater(t, params.HighImpactMinDepositUclaw, uint64(0))

	highBudget := params.HighImpactMinDepositUclaw + 1

	// Delegate a high-value task to low-reputation agent → should fail.
	_, err = ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "High-value task",
		Budget:         fmt.Sprintf("%d", highBudget),
		DeadlineBlocks: 200,
	})
	require.Error(t, err)
	require.ErrorIs(t, err, types.ErrInsufficientReputation)
}

func TestDelegateTaskLowBudgetBypassesReputation(t *testing.T) {
	delegatorAddr := sdk.AccAddress([]byte("delegator___________"))
	delegator := delegatorAddr.String()
	assignee := sdk.AccAddress([]byte("assignee____________")).String()

	// Assignee has low reputation.
	f := initFixtureWithReputation(t, map[string]uint64{
		assignee: 2000,
	})

	// Fund delegator for escrow.
	f.bankKeeper.fundAccount(delegatorAddr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	ms := keeper.NewMsgServerImpl(f.keeper)

	// Register both agents.
	_, err := ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: delegator,
		Name:    "delegator-agent",
		Pubkey:  "pk_delegator",
	})
	require.NoError(t, err)

	_, err = ms.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator: assignee,
		Name:    "assignee-agent",
		Pubkey:  "pk_assignee",
	})
	require.NoError(t, err)

	// A low-budget task should not be gated by reputation.
	_, err = ms.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Low-value task",
		Budget:         "100",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)
}
