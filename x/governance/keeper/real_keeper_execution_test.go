package keeper_test

import (
	"context"
	"testing"

	"cosmossdk.io/core/address"
	"cosmossdk.io/math"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	govkeeper "clawchain/x/governance/keeper"
	govmodule "clawchain/x/governance/module"
	govtypes "clawchain/x/governance/types"
	messagingkeeper "clawchain/x/messaging/keeper"
	messagingmodule "clawchain/x/messaging/module"
	messagingtypes "clawchain/x/messaging/types"
	reputationkeeper "clawchain/x/reputation/keeper"
	reputationmodule "clawchain/x/reputation/module"
	reputationtypes "clawchain/x/reputation/types"
)

type realKeeperFixture struct {
	ctx              context.Context
	addressCodec     address.Codec
	bankKeeper       *mockBankKeeper
	stakingKeeper    *mockStakingKeeper
	governanceKeeper govkeeper.Keeper
	messagingKeeper  messagingkeeper.Keeper
	reputationKeeper reputationkeeper.Keeper
}

type repMockAgentKeeper struct{}

func (repMockAgentKeeper) IsAgentRegistered(_ context.Context, _ string) (bool, error) {
	return true, nil
}
func (repMockAgentKeeper) GetMaxHeartbeatGapBlocks(_ context.Context) (int64, error) { return 100, nil }
func (repMockAgentKeeper) WalkHeartbeatStatuses(_ context.Context, _ func(string, int64) (bool, error)) error {
	return nil
}
func (repMockAgentKeeper) WalkCompletedTaskSLAEvents(_ context.Context, _ uint64, _ func(uint64, string, bool, int64) (bool, error)) error {
	return nil
}
func (repMockAgentKeeper) GetDepositSlashBps(_ context.Context) (uint64, error) { return 100, nil }
func (repMockAgentKeeper) SlashAgentDeposit(_ context.Context, _ string, _ uint64) error {
	return nil
}

type repMockMarketplaceKeeper struct{}

func (repMockMarketplaceKeeper) HasPurchased(_ context.Context, _, _ string) (bool, error) {
	return true, nil
}

func initRealKeeperFixture(t *testing.T) *realKeeperFixture {
	t.Helper()

	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey("governance_real_execution_test")
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(govtypes.GovModuleName)
	bankKeeper := newMockBankKeeper()

	govEncCfg := moduletestutil.MakeTestEncodingConfig(govmodule.AppModule{})
	msgEncCfg := moduletestutil.MakeTestEncodingConfig(messagingmodule.AppModule{})
	repEncCfg := moduletestutil.MakeTestEncodingConfig(reputationmodule.AppModule{})

	govKeeper := govkeeper.NewKeeper(storeService, govEncCfg.Codec, addressCodec, authority, bankKeeper)
	msgKeeper := messagingkeeper.NewKeeper(storeService, msgEncCfg.Codec, addressCodec, authority)
	repKeeper := reputationkeeper.NewKeeper(
		storeService,
		repEncCfg.Codec,
		addressCodec,
		authority,
		repMockAgentKeeper{},
		repMockMarketplaceKeeper{},
	)

	require.NoError(t, msgKeeper.Params.Set(ctx, messagingtypes.DefaultParams()))
	require.NoError(t, repKeeper.Params.Set(ctx, reputationtypes.DefaultParams()))

	govKeeper.RegisterModuleParamExecutor("messaging", msgKeeper)
	govKeeper.RegisterModuleParamExecutor("reputation", repKeeper)

	// Governance is stake-weighted and now requires a staking keeper.
	stakingKeeper := newMockStakingKeeper()
	govKeeper.SetStakingKeeper(stakingKeeper)

	return &realKeeperFixture{
		ctx:              ctx,
		addressCodec:     addressCodec,
		bankKeeper:       bankKeeper,
		stakingKeeper:    stakingKeeper,
		governanceKeeper: govKeeper,
		messagingKeeper:  msgKeeper,
		reputationKeeper: repKeeper,
	}
}

func TestExecuteProposal_RealMessagingKeeper(t *testing.T) {
	f := initRealKeeperFixture(t)
	proposer := sdk.AccAddress([]byte("gov_msg_proposer____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	id, err := f.governanceKeeper.SubmitProposal(
		f.ctx,
		"Increase max message size",
		"Allow larger encrypted payloads",
		"messaging",
		"max_message_size",
		"8192",
		proposerStr,
		sdk.NewCoins(sdk.NewInt64Coin("uclaw", govtypes.DefaultMinDepositUclaw)),
	)
	require.NoError(t, err)

	require.NoError(t, f.governanceKeeper.ExecuteProposal(f.ctx, id))

	params, err := f.messagingKeeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.EqualValues(t, 8192, params.MaxMessageSize)
}

func TestEndBlocker_RealReputationKeeper(t *testing.T) {
	f := initRealKeeperFixture(t)

	proposer := sdk.AccAddress([]byte("gov_rep_proposer____"))
	voter := sdk.AccAddress([]byte("gov_rep_voter_______"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.governanceKeeper.SubmitProposal(
		f.ctx,
		"Increase heartbeat penalty",
		"Apply stricter heartbeat penalty",
		"reputation",
		"heartbeat_penalty_bps",
		"750",
		proposerStr,
		sdk.NewCoins(sdk.NewInt64Coin("uclaw", govtypes.DefaultMinDepositUclaw)),
	)
	require.NoError(t, err)
	f.stakingKeeper.setBonded(voter, math.NewInt(1_000_000))
	require.NoError(t, f.governanceKeeper.CastVote(f.ctx, id, voterStr, govtypes.VoteOptionYes))

	// Force proposal voting period to end in this block.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(govtypes.DefaultVotingPeriodBlocks + 1)

	require.NoError(t, f.governanceKeeper.EndBlocker(f.ctx))

	params, err := f.reputationKeeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.EqualValues(t, 750, params.HeartbeatPenaltyBps)
}

func TestEndBlocker_RealKeeperProposalRejected_NoParamChange(t *testing.T) {
	f := initRealKeeperFixture(t)

	// Capture baseline.
	beforeParams, err := f.messagingKeeper.Params.Get(f.ctx)
	require.NoError(t, err)

	proposer := sdk.AccAddress([]byte("gov_reject_proposer_"))
	voter := sdk.AccAddress([]byte("gov_reject_voter____"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.governanceKeeper.SubmitProposal(
		f.ctx,
		"Reject message size change",
		"Proposal should fail with no votes",
		"messaging",
		"max_message_size",
		"16384",
		proposerStr,
		sdk.NewCoins(sdk.NewInt64Coin("uclaw", govtypes.DefaultMinDepositUclaw)),
	)
	require.NoError(t, err)
	f.stakingKeeper.setBonded(voter, math.NewInt(1_000_000))
	require.NoError(t, f.governanceKeeper.CastVote(f.ctx, id, voterStr, govtypes.VoteOptionNo))

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(govtypes.DefaultVotingPeriodBlocks + 1)
	require.NoError(t, f.governanceKeeper.EndBlocker(f.ctx))

	afterParams, err := f.messagingKeeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, beforeParams.MaxMessageSize, afterParams.MaxMessageSize)

	proposal, err := f.governanceKeeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.Equal(t, govtypes.ProposalStatusRejected, proposal.Status)
}
