//go:build e2e
// +build e2e

package e2e

import (
	"context"
	"encoding/json"
	"fmt"
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

	agentkeeper "clawchain/x/agent/keeper"
	agentmodule "clawchain/x/agent/module"
	agenttypes "clawchain/x/agent/types"

	marketkeeper "clawchain/x/marketplace/keeper"
	marketmodule "clawchain/x/marketplace/module"
	markettypes "clawchain/x/marketplace/types"

	repkeeper "clawchain/x/reputation/keeper"
	repmodule "clawchain/x/reputation/module"
	reptypes "clawchain/x/reputation/types"
)

// ---------------------------------------------------------------------------
// Agent Economy E2E Fixture
// ---------------------------------------------------------------------------

type agentEconomyFixture struct {
	ctx          context.Context
	addressCodec address.Codec
	bankKeeper   *a2aMockBankKeeper

	agentKeeper  agentkeeper.Keeper
	marketKeeper marketkeeper.Keeper
	repKeeper    repkeeper.Keeper
}

// a2aMockBankKeeper satisfies all module bank keeper interfaces for the
// agent-to-agent economy tests. It tracks account and module balances
// separately and enforces balance constraints.
type a2aMockBankKeeper struct {
	balances       map[string]sdk.Coins
	moduleBalances map[string]sdk.Coins
}

func newA2AMockBank() *a2aMockBankKeeper {
	return &a2aMockBankKeeper{
		balances:       make(map[string]sdk.Coins),
		moduleBalances: make(map[string]sdk.Coins),
	}
}

func (m *a2aMockBankKeeper) SpendableCoins(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	return m.balances[addr.String()]
}

func (m *a2aMockBankKeeper) SendCoins(_ context.Context, from, to sdk.AccAddress, amt sdk.Coins) error {
	key := from.String()
	bal := m.balances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.balances[key] = newBal
	m.balances[to.String()] = m.balances[to.String()].Add(amt...)
	return nil
}

func (m *a2aMockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, sender sdk.AccAddress, mod string, amt sdk.Coins) error {
	key := sender.String()
	bal := m.balances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.balances[key] = newBal
	m.moduleBalances[mod] = m.moduleBalances[mod].Add(amt...)
	return nil
}

func (m *a2aMockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, mod string, recipient sdk.AccAddress, amt sdk.Coins) error {
	modBal := m.moduleBalances[mod]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds in module %s", mod)
	}
	m.moduleBalances[mod] = newBal
	m.balances[recipient.String()] = m.balances[recipient.String()].Add(amt...)
	return nil
}

func (m *a2aMockBankKeeper) BurnCoins(_ context.Context, moduleName string, amt sdk.Coins) error {
	modBal := m.moduleBalances[moduleName]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds to burn")
	}
	m.moduleBalances[moduleName] = newBal
	return nil
}

func (m *a2aMockBankKeeper) MintCoins(_ context.Context, moduleName string, amt sdk.Coins) error {
	m.moduleBalances[moduleName] = m.moduleBalances[moduleName].Add(amt...)
	return nil
}

func (m *a2aMockBankKeeper) fundAccount(addr string, coins sdk.Coins) {
	m.balances[addr] = m.balances[addr].Add(coins...)
}

// a2aMockMintKeeper satisfies agenttypes.MintKeeper.
type a2aMockMintKeeper struct{}

func (m *a2aMockMintKeeper) GetMintDenom(_ context.Context) (string, error) {
	return "uclaw", nil
}
func (m *a2aMockMintKeeper) GetAnnualProvisions(_ context.Context) (math.LegacyDec, error) {
	return math.LegacyZeroDec(), nil
}

// ---------------------------------------------------------------------------
// Fixture Init
// ---------------------------------------------------------------------------

func initAgentEconomyFixture(t *testing.T) *agentEconomyFixture {
	t.Helper()

	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	bk := newA2AMockBank()
	mk := &a2aMockMintKeeper{}

	agentStoreKey := storetypes.NewKVStoreKey(agenttypes.StoreKey)
	agentStoreService := runtime.NewKVStoreService(agentStoreKey)

	marketStoreKey := storetypes.NewKVStoreKey(markettypes.StoreKey)
	marketStoreService := runtime.NewKVStoreService(marketStoreKey)

	repStoreKey := storetypes.NewKVStoreKey(reptypes.StoreKey)
	repStoreService := runtime.NewKVStoreService(repStoreKey)

	ctx := testutil.DefaultContextWithKeys(
		map[string]*storetypes.KVStoreKey{
			agenttypes.StoreKey:  agentStoreKey,
			markettypes.StoreKey: marketStoreKey,
			reptypes.StoreKey:    repStoreKey,
		},
		map[string]*storetypes.TransientStoreKey{
			"transient_test": storetypes.NewTransientStoreKey("transient_test"),
		},
		nil,
	)

	agentAuthority := authtypes.NewModuleAddress(agenttypes.GovModuleName)
	marketAuthority := authtypes.NewModuleAddress(markettypes.GovModuleName)
	repAuthority := authtypes.NewModuleAddress(reptypes.GovModuleName)

	agentEncCfg := moduletestutil.MakeTestEncodingConfig(agentmodule.AppModule{})
	ak := agentkeeper.NewKeeper(agentStoreService, agentEncCfg.Codec, addrCodec, agentAuthority, bk, mk, nil)
	if err := ak.Params.Set(ctx, agenttypes.DefaultParams()); err != nil {
		t.Fatalf("failed to set agent params: %v", err)
	}

	marketEncCfg := moduletestutil.MakeTestEncodingConfig(marketmodule.AppModule{})
	mktK := marketkeeper.NewKeeper(marketStoreService, marketEncCfg.Codec, addrCodec, marketAuthority, bk, &ak)
	if err := mktK.Params.Set(ctx, markettypes.DefaultParams()); err != nil {
		t.Fatalf("failed to set marketplace params: %v", err)
	}

	repEncCfg := moduletestutil.MakeTestEncodingConfig(repmodule.AppModule{})
	rk := repkeeper.NewKeeper(repStoreService, repEncCfg.Codec, addrCodec, repAuthority, &ak, &mktK)
	if err := rk.Params.Set(ctx, reptypes.DefaultParams()); err != nil {
		t.Fatalf("failed to set reputation params: %v", err)
	}

	ak.SetReputationKeeper(&rk)

	return &agentEconomyFixture{
		ctx:          ctx,
		addressCodec: addrCodec,
		bankKeeper:   bk,
		agentKeeper:  ak,
		marketKeeper: mktK,
		repKeeper:    rk,
	}
}

// ---------------------------------------------------------------------------
// MsgServer / QueryServer Interfaces
// ---------------------------------------------------------------------------

type a2aAgentMsgServer interface {
	agenttypes.MsgServer
	DelegateTask(ctx context.Context, msg *agenttypes.MsgDelegateTask) (*agenttypes.MsgDelegateTaskResponse, error)
	AcceptTask(ctx context.Context, msg *agenttypes.MsgAcceptTask) (*agenttypes.MsgAcceptTaskResponse, error)
	CompleteTask(ctx context.Context, msg *agenttypes.MsgCompleteTask) (*agenttypes.MsgCompleteTaskResponse, error)
	AgentHeartbeat(ctx context.Context, msg *agenttypes.MsgAgentHeartbeat) (*agenttypes.MsgAgentHeartbeatResponse, error)
	DeregisterAgent(ctx context.Context, msg *agenttypes.MsgDeregisterAgent) (*agenttypes.MsgDeregisterAgentResponse, error)
}

type a2aAgentQueryServer interface {
	agenttypes.QueryServer
	Task(ctx context.Context, req *agenttypes.QueryTaskRequest) (*agenttypes.QueryTaskResponse, error)
}

func newA2AAgentMsgServer(t *testing.T, k agentkeeper.Keeper) a2aAgentMsgServer {
	t.Helper()
	srv, ok := agentkeeper.NewMsgServerImpl(k).(a2aAgentMsgServer)
	require.True(t, ok, "agent MsgServer does not satisfy extended interface")
	return srv
}

func newA2AAgentQueryServer(t *testing.T, k agentkeeper.Keeper) a2aAgentQueryServer {
	t.Helper()
	srv, ok := agentkeeper.NewQueryServerImpl(k).(a2aAgentQueryServer)
	require.True(t, ok, "agent QueryServer does not satisfy extended interface")
	return srv
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// a2aRegisterAgent funds and registers an agent with sufficient balance for
// deposit + task budget operations.
func a2aRegisterAgent(
	t *testing.T,
	bk *a2aMockBankKeeper,
	ctx context.Context,
	msgSrv a2aAgentMsgServer,
	addr, name string,
) {
	t.Helper()
	bk.fundAccount(addr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 50_000_000)))
	_, err := msgSrv.RegisterAgent(ctx, &agenttypes.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   name + "-pubkey",
		Endpoint: "https://" + name + ".example.com",
		Name:     name,
	})
	require.NoError(t, err)
}

// advanceBlockHeight returns a new context with the block height advanced by
// the given number of blocks. This simulates time passing on-chain.
func advanceBlockHeight(ctx context.Context, blocks int64) context.Context {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	return sdkCtx.WithBlockHeight(sdkCtx.BlockHeight() + blocks)
}

// ===========================================================================
// Test 1: TestAgentToAgentTaskDelegation
// Full lifecycle: register -> delegate -> accept -> complete -> verify budget
// ===========================================================================

func TestAgentToAgentTaskDelegation(t *testing.T) {
	f := initAgentEconomyFixture(t)
	msgSrv := newA2AAgentMsgServer(t, f.agentKeeper)
	qSrv := newA2AAgentQueryServer(t, f.agentKeeper)

	agentA := "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
	agentB := "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"
	budget := "500000"

	// Advance to a realistic block height so CompletedAt is non-zero.
	f.ctx = advanceBlockHeight(f.ctx, 10)

	// --- Step 1: Register Agent A and Agent B ---
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, msgSrv, agentA, "AgentA")
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, msgSrv, agentB, "AgentB")
	t.Log("Step 1: Both agents registered")

	// Record Agent A's balance before delegation (after deposit).
	agentABalBefore := f.bankKeeper.balances[agentA].AmountOf("uclaw")
	agentBBalBefore := f.bankKeeper.balances[agentB].AmountOf("uclaw")
	t.Logf("  Agent A balance before delegation: %s uclaw", agentABalBefore.String())
	t.Logf("  Agent B balance before delegation: %s uclaw", agentBBalBefore.String())

	// --- Step 2: Agent A delegates a task to Agent B with budget ---
	taskResp, err := msgSrv.DelegateTask(f.ctx, &agenttypes.MsgDelegateTask{
		Creator:        agentA,
		Assignee:       agentB,
		Description:    "Run autonomous ML inference pipeline on medical imaging dataset",
		Requirements:   `{"model":"medclip-v2","dataset":"chest-xray-14","batch_size":64}`,
		Budget:         budget,
		DeadlineBlocks: 500,
	})
	require.NoError(t, err)
	taskID := taskResp.TaskId
	t.Logf("Step 2: Task delegated — ID=%d, budget=%s uclaw", taskID, budget)

	// Verify budget was escrowed from Agent A.
	agentABalAfterDelegate := f.bankKeeper.balances[agentA].AmountOf("uclaw")
	budgetAmt, _ := math.NewIntFromString(budget)
	require.Equal(t, agentABalBefore.Sub(budgetAmt), agentABalAfterDelegate,
		"Agent A balance should decrease by budget amount after delegation")

	// Verify module account received the escrowed budget.
	moduleBalance := f.bankKeeper.moduleBalances[agenttypes.ModuleName].AmountOf("uclaw")
	require.True(t, moduleBalance.GTE(budgetAmt),
		"Agent module account should hold at least the escrowed budget")

	// Verify task state is pending.
	taskQuery, err := qSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.True(t, taskQuery.Found)
	require.Equal(t, "pending", taskQuery.Status)
	require.Equal(t, agentA, taskQuery.DelegatorAddress)
	require.Equal(t, agentB, taskQuery.AssigneeAddress)
	require.Equal(t, budget, taskQuery.Budget)

	// --- Step 3: Agent B accepts the task ---
	_, err = msgSrv.AcceptTask(f.ctx, &agenttypes.MsgAcceptTask{
		Creator: agentB,
		TaskId:  taskID,
	})
	require.NoError(t, err)

	taskQuery, err = qSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "accepted", taskQuery.Status)
	t.Log("Step 3: Task accepted by Agent B")

	// --- Step 4: Agent B completes the task with a result ---
	result := `{"output":"ipfs://QmMedical123","accuracy":0.96,"model_version":"medclip-v2.1"}`
	_, err = msgSrv.CompleteTask(f.ctx, &agenttypes.MsgCompleteTask{
		Creator: agentB,
		TaskId:  taskID,
		Result:  result,
	})
	require.NoError(t, err)

	taskQuery, err = qSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "completed", taskQuery.Status)
	require.Equal(t, result, taskQuery.Result)
	t.Log("Step 4: Task completed by Agent B")

	// --- Step 5: Verify budget was released to Agent B ---
	agentBBalAfterComplete := f.bankKeeper.balances[agentB].AmountOf("uclaw")
	require.Equal(t, agentBBalBefore.Add(budgetAmt), agentBBalAfterComplete,
		"Agent B balance should increase by the full budget amount after task completion")
	t.Logf("Step 5: Budget released to Agent B — balance: %s uclaw (was %s)",
		agentBBalAfterComplete.String(), agentBBalBefore.String())

	// --- Step 6: Verify task status is completed ---
	require.Equal(t, "completed", taskQuery.Status)
	require.True(t, taskQuery.CompletedAt > 0, "completed_at should be set")
	t.Log("Step 6: Task status verified as completed — agent economy lifecycle done")
}

// ===========================================================================
// Test 2: TestAgentToAgentWithReputationUpdate
// Task completion followed by reputation endorsement and rating
// ===========================================================================

func TestAgentToAgentWithReputationUpdate(t *testing.T) {
	f := initAgentEconomyFixture(t)
	agentMsgSrv := newA2AAgentMsgServer(t, f.agentKeeper)
	agentQSrv := newA2AAgentQueryServer(t, f.agentKeeper)
	repMsgSrv := repkeeper.NewMsgServerImpl(f.repKeeper)

	delegator := "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
	worker := "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"

	// --- Step 1: Register both agents ---
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, agentMsgSrv, delegator, "Delegator")
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, agentMsgSrv, worker, "Worker")
	t.Log("Step 1: Both agents registered")

	// --- Step 2: Verify no reputation record exists yet ---
	_, err := f.repKeeper.Reputations.Get(f.ctx, worker)
	require.Error(t, err, "worker should have no reputation record before any interaction")
	t.Log("Step 2: Worker has no reputation record yet (expected)")

	// --- Step 3: Delegate task ---
	taskResp, err := agentMsgSrv.DelegateTask(f.ctx, &agenttypes.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       worker,
		Description:    "Train sentiment analysis model on Twitter dataset",
		Requirements:   `{"model":"bert-sentiment","epochs":10}`,
		Budget:         "1000000",
		DeadlineBlocks: 300,
	})
	require.NoError(t, err)
	taskID := taskResp.TaskId
	t.Logf("Step 3: Task delegated — ID=%d", taskID)

	// --- Step 4: Worker accepts and completes task ---
	_, err = agentMsgSrv.AcceptTask(f.ctx, &agenttypes.MsgAcceptTask{
		Creator: worker,
		TaskId:  taskID,
	})
	require.NoError(t, err)

	_, err = agentMsgSrv.CompleteTask(f.ctx, &agenttypes.MsgCompleteTask{
		Creator: worker,
		TaskId:  taskID,
		Result:  `{"f1_score":0.92,"model_url":"ipfs://QmSentiment456"}`,
	})
	require.NoError(t, err)

	taskQuery, err := agentQSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "completed", taskQuery.Status)
	t.Log("Step 4: Task accepted and completed by worker")

	// --- Step 5: Delegator endorses the worker in the reputation module ---
	endorseResp, err := repMsgSrv.EndorseAgent(f.ctx, &reptypes.MsgEndorseAgent{
		Creator:      delegator,
		AgentAddress: worker,
		Reason:       "completed sentiment analysis task with excellent F1 score",
	})
	require.NoError(t, err)
	t.Logf("Step 5: Worker endorsed — EndorsementID=%d", endorseResp.EndorsementId)

	// --- Step 6: Verify reputation updated with endorsement ---
	rep, err := f.repKeeper.Reputations.Get(f.ctx, worker)
	require.NoError(t, err)
	require.Equal(t, uint64(1), rep.Endorsements)
	t.Logf("Step 6: Worker reputation updated — endorsements=%d", rep.Endorsements)

	// --- Step 7: Delegator rates the worker via marketplace purchase flow ---
	// Record a purchase so the reputation module allows rating.
	purchaseKey := delegator + "|" + worker
	err = f.marketKeeper.Purchases.Set(f.ctx, purchaseKey, true)
	require.NoError(t, err)

	rateResp, err := repMsgSrv.RateAgent(f.ctx, &reptypes.MsgRateAgent{
		Creator:      delegator,
		AgentAddress: worker,
		SkillId:      0,
		Score:        5,
		Comment:      "outstanding ML model training, exceeded accuracy targets",
	})
	require.NoError(t, err)
	t.Logf("Step 7: Worker rated 5 stars — RatingID=%d", rateResp.RatingId)

	// --- Step 8: Verify full reputation score ---
	rep, err = f.repKeeper.Reputations.Get(f.ctx, worker)
	require.NoError(t, err)
	require.Equal(t, uint64(1), rep.TotalRatings)
	require.Equal(t, uint64(5), rep.RatingSum)
	require.Equal(t, uint64(500), rep.AvgRatingBps, "5-star rating = 500 bps average")
	require.Equal(t, uint64(1), rep.Endorsements)
	t.Log("Step 8: Worker reputation fully updated — agent economy + reputation flow complete")
}

// ===========================================================================
// Test 3: TestAgentToAgentTaskExpiry
// Task with short deadline expires, budget refunded to delegator
// ===========================================================================

func TestAgentToAgentTaskExpiry(t *testing.T) {
	f := initAgentEconomyFixture(t)
	msgSrv := newA2AAgentMsgServer(t, f.agentKeeper)
	qSrv := newA2AAgentQueryServer(t, f.agentKeeper)

	delegator := "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
	assignee := "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"
	budget := "750000"

	// --- Step 1: Register both agents ---
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, msgSrv, delegator, "Delegator")
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, msgSrv, assignee, "Assignee")
	t.Log("Step 1: Both agents registered")

	// Record delegator balance before task creation.
	delegatorBalBefore := f.bankKeeper.balances[delegator].AmountOf("uclaw")

	// --- Step 2: Delegate task with short deadline ---
	shortDeadline := int64(5) // only 5 blocks
	taskResp, err := msgSrv.DelegateTask(f.ctx, &agenttypes.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Urgent: classify incoming network traffic anomalies",
		Requirements:   `{"model":"anomaly-detect-v3","threshold":0.95}`,
		Budget:         budget,
		DeadlineBlocks: shortDeadline,
	})
	require.NoError(t, err)
	taskID := taskResp.TaskId
	t.Logf("Step 2: Task delegated with %d-block deadline — ID=%d", shortDeadline, taskID)

	// Verify budget was escrowed.
	delegatorBalAfterDelegate := f.bankKeeper.balances[delegator].AmountOf("uclaw")
	budgetAmt, _ := math.NewIntFromString(budget)
	require.Equal(t, delegatorBalBefore.Sub(budgetAmt), delegatorBalAfterDelegate,
		"delegator balance should decrease by budget after delegation")

	// Verify task is pending.
	taskQuery, err := qSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "pending", taskQuery.Status)

	// --- Step 3: Do NOT accept the task — simulate time passing beyond deadline ---
	// Advance block height past the deadline.
	f.ctx = advanceBlockHeight(f.ctx, shortDeadline+1)
	t.Logf("Step 3: Advanced block height past deadline (task should expire)")

	// --- Step 4: Trigger EndBlock to expire overdue tasks ---
	err = f.agentKeeper.EndBlock(f.ctx)
	require.NoError(t, err)
	t.Log("Step 4: EndBlock executed — overdue tasks expired")

	// --- Step 5: Verify task is expired ---
	taskQuery, err = qSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "expired", taskQuery.Status)
	t.Log("Step 5: Task status is 'expired'")

	// --- Step 6: Verify budget was refunded to delegator ---
	delegatorBalAfterExpiry := f.bankKeeper.balances[delegator].AmountOf("uclaw")
	require.Equal(t, delegatorBalBefore, delegatorBalAfterExpiry,
		"delegator balance should be restored to pre-delegation level after task expiry refund")
	t.Logf("Step 6: Budget refunded — delegator balance restored to %s uclaw", delegatorBalAfterExpiry.String())
}

// ===========================================================================
// Test 4: TestMultiAgentTaskCompetition
// Three agents registered, first to accept wins, others rejected
// ===========================================================================

func TestMultiAgentTaskCompetition(t *testing.T) {
	f := initAgentEconomyFixture(t)
	msgSrv := newA2AAgentMsgServer(t, f.agentKeeper)
	qSrv := newA2AAgentQueryServer(t, f.agentKeeper)

	delegator := "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
	agentB := "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"
	agentC := "cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh"

	// --- Step 1: Register delegator and 2 competing agents ---
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, msgSrv, delegator, "Delegator")
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, msgSrv, agentB, "AgentB")
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, msgSrv, agentC, "AgentC")
	t.Log("Step 1: Delegator + 2 competing agents registered")

	// --- Step 2: Delegate task assigned to Agent B ---
	// Note: The DelegateTask protocol assigns to a specific agent. To test
	// competition, we create two tasks assigned to different agents, with
	// only the assigned agent able to accept each one.
	taskRespB, err := msgSrv.DelegateTask(f.ctx, &agenttypes.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       agentB,
		Description:    "Image classification on satellite imagery",
		Requirements:   `{"model":"resnet50","resolution":"1m"}`,
		Budget:         "200000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)
	taskIDB := taskRespB.TaskId
	t.Logf("Step 2: Task delegated to Agent B — ID=%d", taskIDB)

	// --- Step 3: Agent B accepts (should succeed) ---
	_, err = msgSrv.AcceptTask(f.ctx, &agenttypes.MsgAcceptTask{
		Creator: agentB,
		TaskId:  taskIDB,
	})
	require.NoError(t, err)

	taskQuery, err := qSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskIDB})
	require.NoError(t, err)
	require.Equal(t, "accepted", taskQuery.Status)
	t.Log("Step 3: Agent B accepted the task")

	// --- Step 4: Agent C tries to accept the same task (should fail — not assignee) ---
	_, err = msgSrv.AcceptTask(f.ctx, &agenttypes.MsgAcceptTask{
		Creator: agentC,
		TaskId:  taskIDB,
	})
	require.Error(t, err, "Agent C should not be able to accept a task assigned to Agent B")
	require.Contains(t, err.Error(), "only")
	t.Log("Step 4: Agent C correctly rejected — not the assignee")

	// --- Step 5: Verify task cannot be accepted again (already accepted) ---
	_, err = msgSrv.AcceptTask(f.ctx, &agenttypes.MsgAcceptTask{
		Creator: agentB,
		TaskId:  taskIDB,
	})
	require.Error(t, err, "Agent B should not be able to accept an already-accepted task")
	require.Contains(t, err.Error(), "not in pending status")
	t.Log("Step 5: Double-accept correctly rejected")

	// --- Step 6: Delegator cannot accept their own delegated task ---
	taskRespC, err := msgSrv.DelegateTask(f.ctx, &agenttypes.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       agentC,
		Description:    "Second task for competition test",
		Requirements:   `{}`,
		Budget:         "200000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)
	taskIDC := taskRespC.TaskId

	_, err = msgSrv.AcceptTask(f.ctx, &agenttypes.MsgAcceptTask{
		Creator: delegator,
		TaskId:  taskIDC,
	})
	require.Error(t, err, "Delegator should not be able to accept a task they delegated")
	t.Log("Step 6: Delegator correctly rejected from accepting their own task")

	// --- Step 7: Correct assignee (Agent C) accepts the second task ---
	_, err = msgSrv.AcceptTask(f.ctx, &agenttypes.MsgAcceptTask{
		Creator: agentC,
		TaskId:  taskIDC,
	})
	require.NoError(t, err)

	taskQuery, err = qSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskIDC})
	require.NoError(t, err)
	require.Equal(t, "accepted", taskQuery.Status)
	t.Log("Step 7: Agent C accepted their assigned task — competition rules enforced")
}

// ===========================================================================
// Test 5: TestAgentToAgentNegotiation
// Full negotiation protocol: propose -> counter -> accept -> auto-create task
// ===========================================================================

func TestAgentToAgentNegotiation(t *testing.T) {
	f := initAgentEconomyFixture(t)
	msgSrv := newA2AAgentMsgServer(t, f.agentKeeper)
	qSrv := newA2AAgentQueryServer(t, f.agentKeeper)

	initiator := "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
	counterparty := "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"

	// --- Step 1: Register both agents ---
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, msgSrv, initiator, "Initiator")
	a2aRegisterAgent(t, f.bankKeeper, f.ctx, msgSrv, counterparty, "Counterparty")
	t.Log("Step 1: Both agents registered")

	// --- Step 2: Initiator proposes negotiation with initial terms ---
	negID, err := f.agentKeeper.ProposeNegotiation(
		f.ctx,
		initiator,
		counterparty,
		"Train LLM fine-tune on proprietary corpus",
		`{"base_model":"llama-3-70b","corpus_size":"50GB","epochs":3}`,
		0,          // no marketplace skill reference
		"5000000",  // proposed budget: 5M uclaw
		200,        // proposed deadline: 200 blocks
		5,          // max negotiation rounds
	)
	require.NoError(t, err)
	t.Logf("Step 2: Negotiation proposed — ID=%d, budget=5000000, deadline=200", negID)

	// Verify negotiation is stored as open.
	negData, err := f.agentKeeper.Negotiations.Get(f.ctx, negID)
	require.NoError(t, err)
	var neg agenttypes.Negotiation
	require.NoError(t, json.Unmarshal([]byte(negData), &neg))
	require.Equal(t, agenttypes.NegotiationStatusOpen, neg.Status)
	require.Equal(t, initiator, neg.Initiator)
	require.Equal(t, counterparty, neg.Counterparty)
	require.Equal(t, "5000000", neg.ProposedBudget)
	require.Equal(t, int64(200), neg.ProposedDeadline)
	require.Equal(t, uint32(0), neg.Round)
	require.Len(t, neg.History, 1, "should have initial proposal in history")

	// --- Step 3: Counterparty counters with different terms ---
	err = f.agentKeeper.CounterNegotiation(
		f.ctx,
		negID,
		counterparty,
		"7000000",  // counter-proposed budget: 7M uclaw (higher)
		300,        // counter-proposed deadline: 300 blocks (more time)
		"Need more budget for A100 GPU cluster and longer timeline for quality",
	)
	require.NoError(t, err)
	t.Log("Step 3: Counterparty countered — budget=7000000, deadline=300")

	// Verify counter state.
	negData, err = f.agentKeeper.Negotiations.Get(f.ctx, negID)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal([]byte(negData), &neg))
	require.Equal(t, agenttypes.NegotiationStatusCountered, neg.Status)
	require.Equal(t, "7000000", neg.ProposedBudget)
	require.Equal(t, int64(300), neg.ProposedDeadline)
	require.Equal(t, uint32(1), neg.Round)
	require.Equal(t, counterparty, neg.LastProposer)
	require.Len(t, neg.History, 2, "should have 2 rounds in history")

	// --- Step 4: Initiator counters back with a compromise ---
	err = f.agentKeeper.CounterNegotiation(
		f.ctx,
		negID,
		initiator,
		"6000000",  // compromise budget: 6M uclaw
		250,        // compromise deadline: 250 blocks
		"Split the difference on budget; 250 blocks should be enough",
	)
	require.NoError(t, err)
	t.Log("Step 4: Initiator counter-proposed — budget=6000000, deadline=250")

	// Verify round advanced.
	negData, err = f.agentKeeper.Negotiations.Get(f.ctx, negID)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal([]byte(negData), &neg))
	require.Equal(t, uint32(2), neg.Round)
	require.Equal(t, initiator, neg.LastProposer)
	require.Len(t, neg.History, 3)

	// --- Step 5: Counterparty accepts the initiator's latest proposal ---
	taskID, err := f.agentKeeper.AcceptNegotiation(f.ctx, negID, counterparty)
	require.NoError(t, err)
	t.Logf("Step 5: Counterparty accepted negotiation — auto-created Task ID=%d", taskID)

	// Verify negotiation is accepted.
	negData, err = f.agentKeeper.Negotiations.Get(f.ctx, negID)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal([]byte(negData), &neg))
	require.Equal(t, agenttypes.NegotiationStatusAccepted, neg.Status)

	// --- Step 6: Verify the auto-created task has the negotiated terms ---
	taskQuery, err := qSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.True(t, taskQuery.Found)
	require.Equal(t, "pending", taskQuery.Status,
		"auto-created task should start in pending status")
	require.Equal(t, initiator, taskQuery.DelegatorAddress,
		"initiator should be the delegator")
	require.Equal(t, counterparty, taskQuery.AssigneeAddress,
		"counterparty should be the assignee")
	require.Equal(t, "6000000", taskQuery.Budget,
		"task should use the final negotiated budget")
	require.Equal(t, int64(250), taskQuery.DeadlineBlocks,
		"task should use the final negotiated deadline")
	require.Equal(t, "Train LLM fine-tune on proprietary corpus", taskQuery.Description)
	t.Log("Step 6: Auto-created task has correct negotiated terms")

	// --- Step 7: Verify the initiator cannot accept their own proposal ---
	// Create a fresh negotiation for this sub-test.
	negID2, err := f.agentKeeper.ProposeNegotiation(
		f.ctx, initiator, counterparty,
		"Second negotiation", "", 0, "1000000", 100, 3,
	)
	require.NoError(t, err)

	_, err = f.agentKeeper.AcceptNegotiation(f.ctx, negID2, initiator)
	require.Error(t, err, "initiator should not be able to accept their own proposal")
	require.Contains(t, err.Error(), "cannot accept your own proposal")
	t.Log("Step 7: Self-acceptance correctly rejected — negotiation protocol enforced")

	// --- Step 8: Verify rejection works ---
	err = f.agentKeeper.RejectNegotiation(f.ctx, negID2, counterparty)
	require.NoError(t, err)

	negData, err = f.agentKeeper.Negotiations.Get(f.ctx, negID2)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal([]byte(negData), &neg))
	require.Equal(t, agenttypes.NegotiationStatusRejected, neg.Status)
	t.Log("Step 8: Negotiation rejection works — full negotiation protocol verified")
}
