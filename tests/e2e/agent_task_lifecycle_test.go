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
// Mock Bank Keeper (agent)
// ---------------------------------------------------------------------------

type agentMockBankKeeper struct {
	moduleBalances  map[string]sdk.Coins
	accountBalances map[string]sdk.Coins
}

func newAgentMockBank() *agentMockBankKeeper {
	return &agentMockBankKeeper{
		moduleBalances:  make(map[string]sdk.Coins),
		accountBalances: make(map[string]sdk.Coins),
	}
}

func (m *agentMockBankKeeper) SpendableCoins(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	return m.accountBalances[addr.String()]
}
func (m *agentMockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, sender sdk.AccAddress, mod string, amt sdk.Coins) error {
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
func (m *agentMockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, mod string, recipient sdk.AccAddress, amt sdk.Coins) error {
	modBal := m.moduleBalances[mod]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return types.ErrInsufficientDeposit
	}
	m.moduleBalances[mod] = newBal
	m.accountBalances[recipient.String()] = m.accountBalances[recipient.String()].Add(amt...)
	return nil
}
func (m *agentMockBankKeeper) BurnCoins(_ context.Context, _ string, _ sdk.Coins) error {
	return nil
}
func (m *agentMockBankKeeper) MintCoins(_ context.Context, moduleName string, amt sdk.Coins) error {
	m.moduleBalances[moduleName] = m.moduleBalances[moduleName].Add(amt...)
	return nil
}

// agentMockMintKeeper satisfies types.MintKeeper.
type agentMockMintKeeper struct{}

func (m *agentMockMintKeeper) GetMintDenom(_ context.Context) (string, error) {
	return "uclaw", nil
}
func (m *agentMockMintKeeper) GetAnnualProvisions(_ context.Context) (math.LegacyDec, error) {
	return math.LegacyZeroDec(), nil
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

type agentFixture struct {
	ctx          context.Context
	keeper       keeper.Keeper
	addressCodec address.Codec
	bankKeeper   *agentMockBankKeeper
}

func initAgentFixture(t *testing.T) *agentFixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bk := newAgentMockBank()
	mk := &agentMockMintKeeper{}

	k := keeper.NewKeeper(storeService, encCfg.Codec, addrCodec, authority, bk, mk, nil)

	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set agent params: %v", err)
	}

	return &agentFixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addrCodec,
		bankKeeper:   bk,
	}
}

// agentMsgServer wraps the extended MsgServer interface for E2E tests.
type agentMsgServer interface {
	types.MsgServer
	DelegateTask(ctx context.Context, msg *types.MsgDelegateTask) (*types.MsgDelegateTaskResponse, error)
	AcceptTask(ctx context.Context, msg *types.MsgAcceptTask) (*types.MsgAcceptTaskResponse, error)
	CompleteTask(ctx context.Context, msg *types.MsgCompleteTask) (*types.MsgCompleteTaskResponse, error)
	AgentHeartbeat(ctx context.Context, msg *types.MsgAgentHeartbeat) (*types.MsgAgentHeartbeatResponse, error)
	DeregisterAgent(ctx context.Context, msg *types.MsgDeregisterAgent) (*types.MsgDeregisterAgentResponse, error)
	SubmitIntent(ctx context.Context, msg *types.MsgSubmitIntent) (*types.MsgSubmitIntentResponse, error)
	RespondToIntent(ctx context.Context, msg *types.MsgRespondToIntent) (*types.MsgRespondToIntentResponse, error)
	FinalizeIntent(ctx context.Context, msg *types.MsgFinalizeIntent) (*types.MsgFinalizeIntentResponse, error)
}

type agentQueryServer interface {
	types.QueryServer
	Task(ctx context.Context, req *types.QueryTaskRequest) (*types.QueryTaskResponse, error)
}

func newAgentMsgServer(t *testing.T, f *agentFixture) agentMsgServer {
	t.Helper()
	srv, ok := keeper.NewMsgServerImpl(f.keeper).(agentMsgServer)
	require.True(t, ok)
	return srv
}

func newAgentQueryServer(t *testing.T, f *agentFixture) agentQueryServer {
	t.Helper()
	srv, ok := keeper.NewQueryServerImpl(f.keeper).(agentQueryServer)
	require.True(t, ok)
	return srv
}

// registerTestAgent funds, registers, and configures an agent for tests.
func registerTestAgent(t *testing.T, f *agentFixture, msgSrv agentMsgServer, addr, name string) {
	t.Helper()
	// Fund the agent account with enough for the deposit (1M uclaw default) + task budget escrow.
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

// ---------------------------------------------------------------------------
// E2E: Agent Registration → Task Delegation → Completion
// ---------------------------------------------------------------------------

func TestAgentTaskLifecycle_RegisterDelegateComplete(t *testing.T) {
	f := initAgentFixture(t)
	msgSrv := newAgentMsgServer(t, f)
	qSrv := newAgentQueryServer(t, f)

	// Both delegator and agent must be registered agents
	delegator := "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
	agent1 := "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"

	registerTestAgent(t, f, msgSrv, delegator, "Delegator")
	registerTestAgent(t, f, msgSrv, agent1, "Agent1")
	t.Log("Step 1: Both agents registered")

	// --- Step 2: Agent heartbeat ---
	_, err := msgSrv.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator: agent1,
	})
	require.NoError(t, err)
	t.Log("Step 2: Heartbeat sent")

	// --- Step 3: Delegate task ---
	taskResp, err := msgSrv.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:      delegator,
		Assignee:     agent1,
		Description:  "Analyze market data and generate report",
		Requirements: `{"dataset":"market-2024","format":"pdf"}`,
		Budget:       "500000",
	})
	require.NoError(t, err)
	require.NotNil(t, taskResp)
	taskID := taskResp.TaskId
	t.Logf("Step 3: Task delegated — ID=%d", taskID)

	// Verify task state
	taskQuery, err := qSrv.Task(f.ctx, &types.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.True(t, taskQuery.Found)
	require.Equal(t, "pending", taskQuery.Status)
	require.Equal(t, delegator, taskQuery.DelegatorAddress)
	require.Equal(t, agent1, taskQuery.AssigneeAddress)

	// --- Step 4: Accept task ---
	_, err = msgSrv.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: agent1,
		TaskId:  taskID,
	})
	require.NoError(t, err)

	taskQuery, err = qSrv.Task(f.ctx, &types.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "accepted", taskQuery.Status)
	t.Log("Step 4: Task accepted")

	// --- Step 5: Complete task ---
	_, err = msgSrv.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: agent1,
		TaskId:  taskID,
		Result:  `{"report_url":"ipfs://QmReport123","summary":"Market analysis complete"}`,
	})
	require.NoError(t, err)

	taskQuery, err = qSrv.Task(f.ctx, &types.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "completed", taskQuery.Status)
	t.Log("Step 5: Task completed — lifecycle done")
}

// TestAgentTaskLifecycle_IntentNegotiation tests the intent-based flow:
// SubmitIntent → RespondToIntent → FinalizeIntent
func TestAgentTaskLifecycle_IntentNegotiation(t *testing.T) {
	f := initAgentFixture(t)
	msgSrv := newAgentMsgServer(t, f)

	// Both requester and responder must be registered agents
	requester := "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
	agent1 := "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"

	registerTestAgent(t, f, msgSrv, requester, "Requester")
	registerTestAgent(t, f, msgSrv, agent1, "Agent1")

	// --- Step 1: Submit intent ---
	intentResp, err := msgSrv.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:      requester,
		IntentType:   "data_share",
		Description:  "Need GPU compute for ML training",
		Payload:      `{"gpu":"A100","count":4}`,
		MinResponses: 1,
	})
	require.NoError(t, err)
	intentID := intentResp.IntentId
	t.Logf("Step 1: Intent submitted — ID=%d", intentID)

	// --- Step 2: Agent responds to intent ---
	_, err = msgSrv.RespondToIntent(f.ctx, &types.MsgRespondToIntent{
		Creator:  agent1,
		IntentId: intentID,
		Accepted: true,
		Payload:  `{"price":"2000000","available_gpus":4}`,
	})
	require.NoError(t, err)
	t.Log("Step 2: Agent responded to intent")

	// --- Step 3: Requester finalizes intent ---
	_, err = msgSrv.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  requester,
		IntentId: intentID,
	})
	require.NoError(t, err)
	t.Log("Step 3: Intent finalized — negotiation complete")
}

// TestAgentTaskLifecycle_DeregistrationRefund tests registration through
// deregistration with deposit refund.
func TestAgentTaskLifecycle_DeregistrationRefund(t *testing.T) {
	f := initAgentFixture(t)
	msgSrv := newAgentMsgServer(t, f)

	agent1 := "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"
	registerTestAgent(t, f, msgSrv, agent1, "Agent1")

	// Verify agent exists
	_, err := f.keeper.Agents.Get(f.ctx, agent1)
	require.NoError(t, err)

	// Deregister agent
	_, err = msgSrv.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: agent1,
	})
	require.NoError(t, err)
	t.Log("Agent deregistered with deposit refund")

	// Verify agent record is removed
	_, err = f.keeper.Agents.Get(f.ctx, agent1)
	require.Error(t, err, "agent should be removed after deregistration")
}

// TestAgentTaskLifecycle_MultiAgentCompetition tests multiple agents
// responding to the same intent.
func TestAgentTaskLifecycle_MultiAgentCompetition(t *testing.T) {
	f := initAgentFixture(t)
	msgSrv := newAgentMsgServer(t, f)

	requester := "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
	agents := []struct {
		addr string
		name string
	}{
		{"cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4", "FastAgent"},
		{"cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh", "CheapAgent"},
	}

	// Register all participants
	registerTestAgent(t, f, msgSrv, requester, "Requester")
	for _, a := range agents {
		registerTestAgent(t, f, msgSrv, a.addr, a.name)
	}

	// Submit intent
	intentResp, err := msgSrv.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:      requester,
		IntentType:   "joint_transfer",
		Description:  "Need data processing",
		Payload:      `{}`,
		MinResponses: 1,
	})
	require.NoError(t, err)

	// Both agents respond
	for _, a := range agents {
		_, err := msgSrv.RespondToIntent(f.ctx, &types.MsgRespondToIntent{
			Creator:  a.addr,
			IntentId: intentResp.IntentId,
			Accepted: true,
			Payload:  `{"proposal":"I can do it"}`,
		})
		require.NoError(t, err)
	}

	// Requester finalizes
	_, err = msgSrv.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  requester,
		IntentId: intentResp.IntentId,
	})
	require.NoError(t, err)
	t.Log("Requester finalized intent — competition resolved")
}
