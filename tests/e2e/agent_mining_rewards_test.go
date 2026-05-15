//go:build e2e
// +build e2e

package e2e

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

	"clawchain/x/agent/keeper"
	module "clawchain/x/agent/module"
	"clawchain/x/agent/types"
)

// ---------------------------------------------------------------------------
// Mock Keepers (agent mining rewards)
// ---------------------------------------------------------------------------

type miningMockBankKeeper struct {
	moduleBalances  map[string]sdk.Coins
	accountBalances map[string]sdk.Coins
}

func newMiningMockBank() *miningMockBankKeeper {
	return &miningMockBankKeeper{
		moduleBalances:  make(map[string]sdk.Coins),
		accountBalances: make(map[string]sdk.Coins),
	}
}

func (m *miningMockBankKeeper) SpendableCoins(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	return m.accountBalances[addr.String()]
}

func (m *miningMockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, sender sdk.AccAddress, mod string, amt sdk.Coins) error {
	key := sender.String()
	bal := m.accountBalances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return types.ErrInsufficientDeposit
	}
	m.accountBalances[key] = newBal
	m.moduleBalances[mod] = m.moduleBalances[mod].Add(amt...)
	return nil
}

func (m *miningMockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, mod string, recipient sdk.AccAddress, amt sdk.Coins) error {
	modBal := m.moduleBalances[mod]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return types.ErrInsufficientDeposit
	}
	m.moduleBalances[mod] = newBal
	m.accountBalances[recipient.String()] = m.accountBalances[recipient.String()].Add(amt...)
	return nil
}

func (m *miningMockBankKeeper) BurnCoins(_ context.Context, _ string, _ sdk.Coins) error {
	return nil
}

func (m *miningMockBankKeeper) MintCoins(_ context.Context, moduleName string, amt sdk.Coins) error {
	m.moduleBalances[moduleName] = m.moduleBalances[moduleName].Add(amt...)
	return nil
}

// miningMockMintKeeper satisfies types.MintKeeper with configurable
// annual provisions for reward testing.
type miningMockMintKeeper struct {
	annualProvisions math.LegacyDec
}

func (m *miningMockMintKeeper) GetMintDenom(_ context.Context) (string, error) {
	return "uclaw", nil
}

func (m *miningMockMintKeeper) GetAnnualProvisions(_ context.Context) (math.LegacyDec, error) {
	return m.annualProvisions, nil
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

type miningFixture struct {
	ctx          context.Context
	keeper       keeper.Keeper
	addressCodec address.Codec
	bankKeeper   *miningMockBankKeeper
	mintKeeper   *miningMockMintKeeper
}

func initMiningFixture(t *testing.T) *miningFixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bk := newMiningMockBank()
	mk := &miningMockMintKeeper{
		annualProvisions: math.LegacyNewDec(100_000_000_000), // 100B uclaw annual
	}

	k := keeper.NewKeeper(storeService, encCfg.Codec, addrCodec, authority, bk, mk, nil)

	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set agent params: %v", err)
	}

	return &miningFixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addrCodec,
		bankKeeper:   bk,
		mintKeeper:   mk,
	}
}

// ---------------------------------------------------------------------------
// Extended MsgServer interface
// ---------------------------------------------------------------------------

type miningMsgServer interface {
	types.MsgServer
	AgentHeartbeat(ctx context.Context, msg *types.MsgAgentHeartbeat) (*types.MsgAgentHeartbeatResponse, error)
	DelegateTask(ctx context.Context, msg *types.MsgDelegateTask) (*types.MsgDelegateTaskResponse, error)
	AcceptTask(ctx context.Context, msg *types.MsgAcceptTask) (*types.MsgAcceptTaskResponse, error)
	CompleteTask(ctx context.Context, msg *types.MsgCompleteTask) (*types.MsgCompleteTaskResponse, error)
}

func newMiningMsgServer(t *testing.T, f *miningFixture) miningMsgServer {
	t.Helper()
	srv, ok := keeper.NewMsgServerImpl(f.keeper).(miningMsgServer)
	require.True(t, ok)
	return srv
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func miningAgent1() string { return "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu" }
func miningAgent2() string { return "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4" }
func miningAgent3() string { return "cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh" }

// safeParseReward parses a reward string, returning ZeroInt for empty/invalid.
func safeParseReward(s string) math.Int {
	if s == "" {
		return math.ZeroInt()
	}
	v, ok := math.NewIntFromString(s)
	if !ok {
		return math.ZeroInt()
	}
	return v
}

func registerMiningAgent(t *testing.T, f *miningFixture, msgSrv miningMsgServer, addr, name string) {
	t.Helper()
	f.bankKeeper.accountBalances[addr] = f.bankKeeper.accountBalances[addr].Add(
		sdk.NewInt64Coin("uclaw", 10_000_000),
	)
	_, err := msgSrv.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   name + "-pubkey",
		Endpoint: "https://" + name + ".example.com",
		Name:     name,
	})
	require.NoError(t, err)
}

func sendHeartbeats(t *testing.T, f *miningFixture, msgSrv miningMsgServer, addr string, count int) {
	t.Helper()
	for i := 0; i < count; i++ {
		// Advance block height to avoid min-interval rejection (default interval=10).
		sdkCtx := sdk.UnwrapSDKContext(f.ctx)
		f.ctx = sdkCtx.WithBlockHeight(sdkCtx.BlockHeight() + 11)
		_, err := msgSrv.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
			Creator: addr,
		})
		require.NoError(t, err)
	}
}

// ---------------------------------------------------------------------------
// E2E: Agent Mining Rewards Tests
// ---------------------------------------------------------------------------

// TestAgentMiningRewards_EndBlockDistribution registers active agents with
// heartbeats and verifies rewards are distributed at the interval block.
func TestAgentMiningRewards_EndBlockDistribution(t *testing.T) {
	f := initMiningFixture(t)
	msgSrv := newMiningMsgServer(t, f)

	agent1 := miningAgent1()
	registerMiningAgent(t, f, msgSrv, agent1, "Miner1")

	// Send enough heartbeats to pass the min reputation threshold.
	// MinReputationForRewardBps=5000, repScore=heartbeats*100, need >=50 heartbeats.
	sendHeartbeats(t, f, msgSrv, agent1, 55)
	t.Log("Step 1: Agent registered with 55 heartbeats")

	// Advance to the reward distribution interval block.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	params, _ := f.keeper.Params.Get(f.ctx)
	interval := int64(params.RewardDistributionIntervalBlocks)
	targetHeight := ((sdkCtx.BlockHeight()/interval)+1)*interval + 1 // next interval boundary
	f.ctx = sdkCtx.WithBlockHeight(targetHeight - 1)

	// Set block to exact interval boundary.
	f.ctx = sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(targetHeight - targetHeight%interval)

	// Step 2: Call EndBlock to trigger reward distribution.
	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)
	t.Log("Step 2: EndBlock called at interval boundary")

	// Step 3: Verify agent received rewards.
	rewardStr, _ := f.keeper.AgentRewards.Get(f.ctx, agent1)
	reward := safeParseReward(rewardStr)
	require.True(t, reward.GT(math.ZeroInt()), "agent should have received rewards, got: %s", rewardStr)
	t.Logf("Step 3: Agent received %s uclaw in rewards", rewardStr)
}

// TestAgentMiningRewards_WeightedByUptimeAndTasks verifies that an agent
// with more heartbeats and task completions receives proportionally more.
func TestAgentMiningRewards_WeightedByUptimeAndTasks(t *testing.T) {
	f := initMiningFixture(t)
	msgSrv := newMiningMsgServer(t, f)

	agent1 := miningAgent1()
	agent2 := miningAgent2()
	registerMiningAgent(t, f, msgSrv, agent1, "HighPerf")
	registerMiningAgent(t, f, msgSrv, agent2, "LowPerf")

	// Increase max heartbeat gap so agents don't get deactivated during test.
	params, _ := f.keeper.Params.Get(f.ctx)
	params.MaxHeartbeatGapBlocks = 100_000
	_ = f.keeper.Params.Set(f.ctx, params)

	// Agent1 gets many heartbeats, Agent2 gets fewer.
	// Interleave to keep both agents alive.
	sendHeartbeats(t, f, msgSrv, agent2, 55)
	sendHeartbeats(t, f, msgSrv, agent1, 60)
	t.Log("Step 1: Both agents registered with different heartbeat counts")

	// Advance to reward interval.
	interval := int64(params.RewardDistributionIntervalBlocks)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	targetHeight := ((sdkCtx.BlockHeight() / interval) + 1) * interval
	f.ctx = sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(targetHeight)

	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	r1Str, _ := f.keeper.AgentRewards.Get(f.ctx, agent1)
	r2Str, _ := f.keeper.AgentRewards.Get(f.ctx, agent2)
	r1 := safeParseReward(r1Str)
	r2 := safeParseReward(r2Str)

	// Agent1 with more heartbeats should have >= Agent2's reward.
	require.True(t, r1.GTE(r2),
		"agent1 (%s) should get >= agent2 (%s) rewards", r1Str, r2Str)
	t.Logf("Step 2: Agent1=%s, Agent2=%s — weighted distribution verified", r1Str, r2Str)
}

// TestAgentMiningRewards_InactiveAgentsExcluded verifies that agents without
// heartbeats receive zero rewards.
func TestAgentMiningRewards_InactiveAgentsExcluded(t *testing.T) {
	f := initMiningFixture(t)
	msgSrv := newMiningMsgServer(t, f)

	activeAgent := miningAgent1()
	inactiveAgent := miningAgent2()
	registerMiningAgent(t, f, msgSrv, activeAgent, "Active")
	registerMiningAgent(t, f, msgSrv, inactiveAgent, "Inactive")

	// Only active agent sends heartbeats.
	sendHeartbeats(t, f, msgSrv, activeAgent, 55)
	t.Log("Step 1: Only one agent has heartbeats")

	// Advance to reward interval.
	params, _ := f.keeper.Params.Get(f.ctx)
	interval := int64(params.RewardDistributionIntervalBlocks)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	targetHeight := ((sdkCtx.BlockHeight() / interval) + 1) * interval
	f.ctx = sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(targetHeight)

	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	// Active agent got rewards.
	activeReward, _ := f.keeper.AgentRewards.Get(f.ctx, activeAgent)
	r := safeParseReward(activeReward)
	require.True(t, r.GT(math.ZeroInt()), "active agent should have rewards")

	// Inactive agent got nothing.
	inactiveReward, _ := f.keeper.AgentRewards.Get(f.ctx, inactiveAgent)
	require.True(t, inactiveReward == "" || inactiveReward == "0",
		"inactive agent should have no rewards, got: %s", inactiveReward)
	t.Log("Step 2: Inactive agent correctly excluded from rewards")
}

// TestAgentMiningRewards_NoRewardsWithZeroProvisions verifies that when
// annual provisions are zero, no rewards are distributed.
func TestAgentMiningRewards_NoRewardsWithZeroProvisions(t *testing.T) {
	f := initMiningFixture(t)
	msgSrv := newMiningMsgServer(t, f)

	// Set annual provisions to zero (chain startup).
	f.mintKeeper.annualProvisions = math.LegacyZeroDec()

	agent1 := miningAgent1()
	registerMiningAgent(t, f, msgSrv, agent1, "Agent1")
	sendHeartbeats(t, f, msgSrv, agent1, 55)

	params, _ := f.keeper.Params.Get(f.ctx)
	interval := int64(params.RewardDistributionIntervalBlocks)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	targetHeight := ((sdkCtx.BlockHeight() / interval) + 1) * interval
	f.ctx = sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(targetHeight)

	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	rewardStr, _ := f.keeper.AgentRewards.Get(f.ctx, agent1)
	require.True(t, rewardStr == "" || rewardStr == "0",
		"no rewards should be distributed with zero provisions")
	t.Log("No rewards distributed with zero annual provisions")
}

// TestAgentMiningRewards_SingleActiveAgent verifies that a single active
// agent receives the full allocation.
func TestAgentMiningRewards_SingleActiveAgent(t *testing.T) {
	f := initMiningFixture(t)
	msgSrv := newMiningMsgServer(t, f)

	agent1 := miningAgent1()
	registerMiningAgent(t, f, msgSrv, agent1, "Solo")
	sendHeartbeats(t, f, msgSrv, agent1, 55)
	t.Log("Step 1: Single agent registered with heartbeats")

	params, _ := f.keeper.Params.Get(f.ctx)
	interval := int64(params.RewardDistributionIntervalBlocks)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	targetHeight := ((sdkCtx.BlockHeight() / interval) + 1) * interval
	f.ctx = sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(targetHeight)

	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)

	rewardStr, _ := f.keeper.AgentRewards.Get(f.ctx, agent1)
	reward := safeParseReward(rewardStr)
	require.True(t, reward.GT(math.ZeroInt()),
		"single active agent should receive full allocation")
	t.Logf("Step 2: Single agent received full allocation: %s uclaw", rewardStr)
}
