//go:build integration
// +build integration

package keeper_test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	sdkmath "cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/agent/keeper"
	"clawchain/x/agent/types"
)

type extendedMsgServer interface {
	types.MsgServer
	SubmitIntent(ctx context.Context, msg *types.MsgSubmitIntent) (*types.MsgSubmitIntentResponse, error)
	RespondToIntent(ctx context.Context, msg *types.MsgRespondToIntent) (*types.MsgRespondToIntentResponse, error)
	FinalizeIntent(ctx context.Context, msg *types.MsgFinalizeIntent) (*types.MsgFinalizeIntentResponse, error)
	DelegateTask(ctx context.Context, msg *types.MsgDelegateTask) (*types.MsgDelegateTaskResponse, error)
	AcceptTask(ctx context.Context, msg *types.MsgAcceptTask) (*types.MsgAcceptTaskResponse, error)
	CompleteTask(ctx context.Context, msg *types.MsgCompleteTask) (*types.MsgCompleteTaskResponse, error)
	AgentHeartbeat(ctx context.Context, msg *types.MsgAgentHeartbeat) (*types.MsgAgentHeartbeatResponse, error)
	DeregisterAgent(ctx context.Context, msg *types.MsgDeregisterAgent) (*types.MsgDeregisterAgentResponse, error)
}

type extendedQueryServer interface {
	types.QueryServer
	Task(ctx context.Context, req *types.QueryTaskRequest) (*types.QueryTaskResponse, error)
	TasksByDelegator(ctx context.Context, req *types.QueryTasksByDelegatorRequest) (*types.QueryTasksByDelegatorResponse, error)
	TasksByAssignee(ctx context.Context, req *types.QueryTasksByAssigneeRequest) (*types.QueryTasksByAssigneeResponse, error)
}

func newMsgServer(t *testing.T, f *fixture) extendedMsgServer {
	t.Helper()
	srv, ok := keeper.NewMsgServerImpl(f.keeper).(extendedMsgServer)
	require.True(t, ok, "msg server does not implement extended intent methods")
	return srv
}

func newQueryServer(t *testing.T, f *fixture) extendedQueryServer {
	t.Helper()
	srv, ok := keeper.NewQueryServerImpl(f.keeper).(extendedQueryServer)
	require.True(t, ok, "query server does not implement extended task query methods")
	return srv
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func validAddress() string {
	return "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
}

func validAddress2() string {
	return "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"
}

func validAddress3() string {
	return "cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh"
}

func registerAgent(t *testing.T, f *fixture, addr, name, pubkey string) {
	t.Helper()
	msgServer := newMsgServer(t, f)
	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   pubkey,
		Endpoint: "https://agent.example.com",
		Name:     name,
	})
	require.NoError(t, err)

	// Set a mock deposit amount so high-impact action checks pass in tests
	// where MinAgentDepositUclaw is 0 (most test fixtures).
	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	agent.DepositAmount = "1000000"
	require.NoError(t, f.keeper.Agents.Set(f.ctx, addr, agent))
	// Fund the account so task budget escrow works in DelegateTask tests.
	addrBytes, _ := sdk.AccAddressFromBech32(addr)
	f.bankKeeper.fundAccount(addrBytes, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	// Also fund the module account so deregistration refunds succeed.
	f.bankKeeper.moduleBalances[types.ModuleName] = f.bankKeeper.moduleBalances[types.ModuleName].Add(
		sdk.NewInt64Coin("uclaw", 1_000_000),
	)
}

// ---------------------------------------------------------------------------
// RegisterAgent tests
// ---------------------------------------------------------------------------

func TestRegisterAgentSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	resp, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pubkey123",
		Endpoint: "https://agent.example.com",
		Name:     "TestAgent",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify stored AgentInfo fields.
	agentInfo, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, addr, agentInfo.Address)
	require.Equal(t, "pubkey123", agentInfo.Pubkey)
	require.Equal(t, "https://agent.example.com", agentInfo.Endpoint)
	require.Equal(t, "TestAgent", agentInfo.Name)
	require.True(t, agentInfo.Active)
}

func TestRegisterAgentDuplicate(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	msg := &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pubkey123",
		Endpoint: "https://agent.example.com",
		Name:     "TestAgent",
	}

	// First registration succeeds.
	_, err := msgServer.RegisterAgent(f.ctx, msg)
	require.NoError(t, err)

	// Second registration fails with ErrAgentAlreadyExists.
	_, err = msgServer.RegisterAgent(f.ctx, msg)
	require.Error(t, err)
	require.ErrorContains(t, err, "agent already registered")
}

func TestRegisterAgentEmptyName(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  validAddress(),
		Pubkey:   "pubkey123",
		Endpoint: "https://agent.example.com",
		Name:     "",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid agent name")
}

func TestRegisterAgentEmptyPubkey(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  validAddress(),
		Pubkey:   "",
		Endpoint: "https://agent.example.com",
		Name:     "TestAgent",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid pubkey")
}

func TestRegisterAgentInvalidAddress(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  "not-a-valid-address",
		Pubkey:   "pubkey123",
		Endpoint: "https://agent.example.com",
		Name:     "TestAgent",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid address")
}

// ---------------------------------------------------------------------------
// AgentAction tests
// ---------------------------------------------------------------------------

func TestAgentActionSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "TestAgent", "pubkey123")

	resp, err := msgServer.AgentAction(f.ctx, &types.MsgAgentAction{
		Creator:    addr,
		ActionType: "transfer",
		Payload:    `{"to":"cosmos1abc","amount":"100"}`,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify the action record was stored.
	record, err := f.keeper.AgentActions.Get(f.ctx, 0)
	require.NoError(t, err)
	require.Equal(t, addr, record.AgentAddress)
	require.Equal(t, "transfer", record.ActionType)
	require.Equal(t, `{"to":"cosmos1abc","amount":"100"}`, record.Payload)
}

func TestAgentActionNotRegistered(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.AgentAction(f.ctx, &types.MsgAgentAction{
		Creator:    validAddress(),
		ActionType: "transfer",
		Payload:    "{}",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "agent not found")
}

func TestAgentActionUnsupportedType(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "TestAgent", "pubkey123")

	_, err := msgServer.AgentAction(f.ctx, &types.MsgAgentAction{
		Creator:    addr,
		ActionType: "invalid_action",
		Payload:    "{}",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "unsupported action type")
}

func TestAgentActionAllTypes(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "TestAgent", "pubkey123")

	for _, actionType := range []string{"transfer", "coordinate", "query"} {
		t.Run(actionType, func(t *testing.T) {
			resp, err := msgServer.AgentAction(f.ctx, &types.MsgAgentAction{
				Creator:    addr,
				ActionType: actionType,
				Payload:    fmt.Sprintf(`{"type":"%s"}`, actionType),
			})
			require.NoError(t, err)
			require.NotNil(t, resp)
		})
	}
}

// ---------------------------------------------------------------------------
// QueryAgent tests
// ---------------------------------------------------------------------------

func TestQueryAgentFound(t *testing.T) {
	f := initFixture(t)
	queryServer := newQueryServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "TestAgent", "pubkey123")

	resp, err := queryServer.Agent(f.ctx, &types.QueryAgentRequest{
		Address: addr,
	})
	require.NoError(t, err)
	require.True(t, resp.Registered)
	require.Equal(t, "TestAgent", resp.Name)
	require.Equal(t, "pubkey123", resp.Pubkey)
	require.Equal(t, "https://agent.example.com", resp.Endpoint)
}

func TestQueryAgentNotFound(t *testing.T) {
	f := initFixture(t)
	queryServer := newQueryServer(t, f)

	resp, err := queryServer.Agent(f.ctx, &types.QueryAgentRequest{
		Address: validAddress(),
	})
	require.NoError(t, err)
	require.False(t, resp.Registered)
}

func TestQueryAgentEmptyAddress(t *testing.T) {
	f := initFixture(t)
	queryServer := newQueryServer(t, f)

	_, err := queryServer.Agent(f.ctx, &types.QueryAgentRequest{
		Address: "",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "address cannot be empty")
}

func TestQueryAgentNilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := newQueryServer(t, f)

	_, err := queryServer.Agent(f.ctx, nil)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid request")
}

// ---------------------------------------------------------------------------
// Integration test: multiple agents + multiple actions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SubmitIntent tests
// ---------------------------------------------------------------------------

func TestSubmitIntentSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "Agent1", "pk1")

	resp, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:      addr,
		IntentType:   "joint_transfer",
		Description:  "Transfer 100 tokens jointly",
		Payload:      `{"amount":100}`,
		MinResponses: 1,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint64(0), resp.IntentId)

	// Verify intent is stored.
	intent, err := f.keeper.Intents.Get(f.ctx, 0)
	require.NoError(t, err)
	require.Equal(t, addr, intent.CreatorAddress)
	require.Equal(t, "joint_transfer", intent.IntentType)
	require.Equal(t, "pending", intent.Status)
	require.Equal(t, "Transfer 100 tokens jointly", intent.Description)
}

func TestSubmitIntentNotRegistered(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     validAddress(),
		IntentType:  "joint_transfer",
		Description: "test",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "agent not found")
}

func TestSubmitIntentUnsupportedType(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "Agent1", "pk1")

	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr,
		IntentType:  "unsupported_type",
		Description: "test",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "unsupported intent type")
}

// ---------------------------------------------------------------------------
// RespondToIntent tests
// ---------------------------------------------------------------------------

func TestRespondToIntentSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	// Submit intent from agent1.
	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:      addr1,
		IntentType:   "data_share",
		Description:  "Share dataset",
		Payload:      `{"dataset":"x"}`,
		MinResponses: 1,
	})
	require.NoError(t, err)

	// Respond from agent2.
	resp, err := msgServer.RespondToIntent(f.ctx, &types.MsgRespondToIntent{
		Creator:  addr2,
		IntentId: 0,
		Accepted: true,
		Payload:  `{"ack":true}`,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

func TestRespondToIntentSelfResponse(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "Agent1", "pk1")

	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr,
		IntentType:  "joint_transfer",
		Description: "test",
	})
	require.NoError(t, err)

	// Self-response should fail.
	_, err = msgServer.RespondToIntent(f.ctx, &types.MsgRespondToIntent{
		Creator:  addr,
		IntentId: 0,
		Accepted: true,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "creator cannot respond")
}

func TestRespondToIntentDuplicate(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr1,
		IntentType:  "joint_transfer",
		Description: "test",
	})
	require.NoError(t, err)

	// First response succeeds.
	_, err = msgServer.RespondToIntent(f.ctx, &types.MsgRespondToIntent{
		Creator:  addr2,
		IntentId: 0,
		Accepted: true,
	})
	require.NoError(t, err)

	// Duplicate response fails.
	_, err = msgServer.RespondToIntent(f.ctx, &types.MsgRespondToIntent{
		Creator:  addr2,
		IntentId: 0,
		Accepted: false,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "already responded")
}

func TestRespondToIntentNotPending(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr1,
		IntentType:  "joint_transfer",
		Description: "test",
	})
	require.NoError(t, err)

	// Finalize the intent.
	_, err = msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  addr1,
		IntentId: 0,
		Cancel:   false,
	})
	require.NoError(t, err)

	// Response to finalized intent fails.
	_, err = msgServer.RespondToIntent(f.ctx, &types.MsgRespondToIntent{
		Creator:  addr2,
		IntentId: 0,
		Accepted: true,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not in pending status")
}

// ---------------------------------------------------------------------------
// FinalizeIntent tests
// ---------------------------------------------------------------------------

func TestFinalizeIntentSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "Agent1", "pk1")

	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr,
		IntentType:  "consensus_vote",
		Description: "Vote on proposal",
	})
	require.NoError(t, err)

	resp, err := msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  addr,
		IntentId: 0,
		Cancel:   false,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify status changed.
	intent, err := f.keeper.Intents.Get(f.ctx, 0)
	require.NoError(t, err)
	require.Equal(t, "finalized", intent.Status)
}

func TestFinalizeIntentCancel(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "Agent1", "pk1")

	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr,
		IntentType:  "data_share",
		Description: "Share data",
	})
	require.NoError(t, err)

	_, err = msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  addr,
		IntentId: 0,
		Cancel:   true,
	})
	require.NoError(t, err)

	intent, err := f.keeper.Intents.Get(f.ctx, 0)
	require.NoError(t, err)
	require.Equal(t, "cancelled", intent.Status)
}

func TestFinalizeIntentNotCreator(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr1,
		IntentType:  "joint_transfer",
		Description: "test",
	})
	require.NoError(t, err)

	// Agent2 tries to finalize agent1's intent.
	_, err = msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  addr2,
		IntentId: 0,
		Cancel:   false,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "only")
}

// ---------------------------------------------------------------------------
// QueryIntent tests
// ---------------------------------------------------------------------------

func TestQueryIntentFound(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	queryServer := newQueryServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "Agent1", "pk1")

	_, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:      addr,
		IntentType:   "joint_transfer",
		Description:  "Transfer tokens",
		Payload:      `{"amount":50}`,
		MinResponses: 2,
	})
	require.NoError(t, err)

	resp, err := queryServer.Intent(f.ctx, &types.QueryIntentRequest{IntentId: 0})
	require.NoError(t, err)
	require.True(t, resp.Found)
	require.Equal(t, "joint_transfer", resp.IntentType)
	require.Equal(t, "Transfer tokens", resp.Description)
	require.Equal(t, "pending", resp.Status)
	require.Equal(t, addr, resp.CreatorAddress)
	require.Equal(t, uint64(2), resp.MinResponses)
}

func TestQueryIntentNotFound(t *testing.T) {
	f := initFixture(t)
	queryServer := newQueryServer(t, f)

	resp, err := queryServer.Intent(f.ctx, &types.QueryIntentRequest{IntentId: 999})
	require.NoError(t, err)
	require.False(t, resp.Found)
}

// ---------------------------------------------------------------------------
// Full coordination workflow
// ---------------------------------------------------------------------------

func TestFullCoordinationWorkflow(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	queryServer := newQueryServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()
	addr3 := validAddress3()

	// Register 3 agents.
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")
	registerAgent(t, f, addr3, "Agent3", "pk3")

	// Agent1 submits a coordination intent.
	submitResp, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:      addr1,
		IntentType:   "consensus_vote",
		Description:  "Vote on governance proposal #42",
		Payload:      `{"proposal_id":42}`,
		MinResponses: 2,
	})
	require.NoError(t, err)
	intentID := submitResp.IntentId

	// Query intent — should be pending.
	qResp, err := queryServer.Intent(f.ctx, &types.QueryIntentRequest{IntentId: intentID})
	require.NoError(t, err)
	require.True(t, qResp.Found)
	require.Equal(t, "pending", qResp.Status)

	// Agent2 responds — accept.
	_, err = msgServer.RespondToIntent(f.ctx, &types.MsgRespondToIntent{
		Creator:  addr2,
		IntentId: intentID,
		Accepted: true,
		Payload:  `{"vote":"yes"}`,
	})
	require.NoError(t, err)

	// Agent3 responds — accept.
	_, err = msgServer.RespondToIntent(f.ctx, &types.MsgRespondToIntent{
		Creator:  addr3,
		IntentId: intentID,
		Accepted: true,
		Payload:  `{"vote":"yes"}`,
	})
	require.NoError(t, err)

	// Agent1 finalizes the intent.
	_, err = msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  addr1,
		IntentId: intentID,
		Cancel:   false,
	})
	require.NoError(t, err)

	// Query again — should be finalized.
	qResp, err = queryServer.Intent(f.ctx, &types.QueryIntentRequest{IntentId: intentID})
	require.NoError(t, err)
	require.True(t, qResp.Found)
	require.Equal(t, "finalized", qResp.Status)
}

// ---------------------------------------------------------------------------
// Integration test: multiple agents + multiple actions
// ---------------------------------------------------------------------------

func TestRegisterAndSubmitActions(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	queryServer := newQueryServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()

	// Register 2 agents.
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	// Verify both are registered via query.
	for _, addr := range []string{addr1, addr2} {
		resp, err := queryServer.Agent(f.ctx, &types.QueryAgentRequest{Address: addr})
		require.NoError(t, err)
		require.True(t, resp.Registered)
	}

	// Submit 3 actions from agent1.
	for i := 0; i < 3; i++ {
		_, err := msgServer.AgentAction(f.ctx, &types.MsgAgentAction{
			Creator:    addr1,
			ActionType: "transfer",
			Payload:    fmt.Sprintf(`{"seq":%d}`, i),
		})
		require.NoError(t, err)
	}

	// Submit 2 actions from agent2.
	for i := 0; i < 2; i++ {
		_, err := msgServer.AgentAction(f.ctx, &types.MsgAgentAction{
			Creator:    addr2,
			ActionType: "query",
			Payload:    fmt.Sprintf(`{"seq":%d}`, i),
		})
		require.NoError(t, err)
	}

	// Verify all 5 actions are stored.
	for i := uint64(0); i < 5; i++ {
		record, err := f.keeper.AgentActions.Get(f.ctx, i)
		require.NoError(t, err)
		require.NotEmpty(t, record.AgentAddress)
	}

	// Verify action count sequence advanced to 5.
	count, err := f.keeper.AgentActionCount.Peek(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(5), count)
}

func TestAgentStatsAndActivityQueries(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	queryServer := newQueryServer(t, f)

	creator := validAddress()
	responder := validAddress2()
	registerAgent(t, f, creator, "Creator", "pk1")
	registerAgent(t, f, responder, "Responder", "pk2")

	submitResp, err := msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:      creator,
		IntentType:   "joint_transfer",
		Description:  "coordination",
		Payload:      "{}",
		MinResponses: 1,
	})
	require.NoError(t, err)

	_, err = msgServer.RespondToIntent(f.ctx, &types.MsgRespondToIntent{
		Creator:  responder,
		IntentId: submitResp.IntentId,
		Accepted: true,
		Payload:  `{"ok":true}`,
	})
	require.NoError(t, err)

	_, err = msgServer.FinalizeIntent(f.ctx, &types.MsgFinalizeIntent{
		Creator:  creator,
		IntentId: submitResp.IntentId,
		Cancel:   false,
	})
	require.NoError(t, err)

	creatorStats, err := queryServer.AgentStats(f.ctx, &types.QueryAgentStatsRequest{Address: creator})
	require.NoError(t, err)
	require.Equal(t, uint64(1), creatorStats.Stats.IntentsSubmitted)
	require.Equal(t, uint64(1), creatorStats.Stats.IntentsFinalized)
	require.Equal(t, uint64(0), creatorStats.Stats.IntentsCancelled)

	responderStats, err := queryServer.AgentStats(f.ctx, &types.QueryAgentStatsRequest{Address: responder})
	require.NoError(t, err)
	require.Equal(t, uint64(1), responderStats.Stats.IntentsResponded)

	creatorActivity, err := queryServer.AgentActivity(f.ctx, &types.QueryAgentActivityRequest{Address: creator, Limit: 10})
	require.NoError(t, err)
	require.Len(t, creatorActivity.Activities, 2)
	require.Equal(t, "submit_intent", creatorActivity.Activities[0].ActionType)
	require.Equal(t, "finalize_intent", creatorActivity.Activities[1].ActionType)

	recent, err := queryServer.RecentActivity(f.ctx, &types.QueryRecentActivityRequest{Limit: 2})
	require.NoError(t, err)
	require.Len(t, recent.Activities, 2)
}

// ---------------------------------------------------------------------------
// DelegateTask tests
// ---------------------------------------------------------------------------

func TestDelegateTaskSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Assignee", "pk2")

	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Build a widget",
		Requirements:   "Must be fast",
		SkillId:        0,
		Budget:         "1000",
		DeadlineBlocks: 100,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify task stored.
	task, err := f.keeper.Tasks.Get(f.ctx, resp.TaskId)
	require.NoError(t, err)
	require.Equal(t, delegator, task.DelegatorAddress)
	require.Equal(t, assignee, task.AssigneeAddress)
	require.Equal(t, "Build a widget", task.Description)
	require.Equal(t, "pending", task.Status)
}

func TestDelegateTaskSelfDelegation(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "SelfAgent", "pk1")

	_, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        addr,
		Assignee:       addr,
		Description:    "self task",
		DeadlineBlocks: 10,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "cannot delegate task to yourself")
}

func TestDelegateTaskUnregisteredAssignee(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	registerAgent(t, f, delegator, "Delegator", "pk1")

	_, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       validAddress2(),
		Description:    "task for unregistered",
		DeadlineBlocks: 10,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "agent not found")
}

// ---------------------------------------------------------------------------
// AcceptTask tests
// ---------------------------------------------------------------------------

func TestAcceptTaskSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Assignee", "pk2")

	delegateResp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Accept me",
		Budget:         "1000",
		DeadlineBlocks: 50,
	})
	require.NoError(t, err)

	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  delegateResp.TaskId,
	})
	require.NoError(t, err)

	// Verify status changed.
	task, err := f.keeper.Tasks.Get(f.ctx, delegateResp.TaskId)
	require.NoError(t, err)
	require.Equal(t, "accepted", task.Status)
}

func TestAcceptTaskNotAssignee(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	other := validAddress3()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Assignee", "pk2")
	registerAgent(t, f, other, "Other", "pk3")

	delegateResp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Not for other",
		Budget:         "1000",
		DeadlineBlocks: 50,
	})
	require.NoError(t, err)

	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: other,
		TaskId:  delegateResp.TaskId,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "only")
}

// ---------------------------------------------------------------------------
// CompleteTask tests
// ---------------------------------------------------------------------------

func TestCompleteTaskSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Assignee", "pk2")

	delegateResp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Complete me",
		Budget:         "1000",
		DeadlineBlocks: 50,
	})
	require.NoError(t, err)

	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  delegateResp.TaskId,
	})
	require.NoError(t, err)

	_, err = msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: assignee,
		TaskId:  delegateResp.TaskId,
		Result:  "Widget built successfully",
	})
	require.NoError(t, err)

	task, err := f.keeper.Tasks.Get(f.ctx, delegateResp.TaskId)
	require.NoError(t, err)
	require.Equal(t, "completed", task.Status)
	require.Equal(t, "Widget built successfully", task.Result)
}

func TestCompleteTaskNotAccepted(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Assignee", "pk2")

	delegateResp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Not accepted yet",
		Budget:         "1000",
		DeadlineBlocks: 50,
	})
	require.NoError(t, err)

	// Try to complete without accepting first.
	_, err = msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: assignee,
		TaskId:  delegateResp.TaskId,
		Result:  "done",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not in accepted status")
}

// ---------------------------------------------------------------------------
// Task query tests
// ---------------------------------------------------------------------------

func TestQueryTaskFound(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	queryServer := newQueryServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Assignee", "pk2")

	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Queryable task",
		Requirements:   "Testing",
		Budget:         "500",
		DeadlineBlocks: 100,
	})
	require.NoError(t, err)

	qResp, err := queryServer.Task(f.ctx, &types.QueryTaskRequest{TaskId: resp.TaskId})
	require.NoError(t, err)
	require.True(t, qResp.Found)
	require.Equal(t, delegator, qResp.DelegatorAddress)
	require.Equal(t, assignee, qResp.AssigneeAddress)
	require.Equal(t, "Queryable task", qResp.Description)
	require.Equal(t, "pending", qResp.Status)
}

func TestQueryTaskNotFound(t *testing.T) {
	f := initFixture(t)
	queryServer := newQueryServer(t, f)

	qResp, err := queryServer.Task(f.ctx, &types.QueryTaskRequest{TaskId: 999})
	require.NoError(t, err)
	require.False(t, qResp.Found)
}

func TestQueryTasksByDelegator(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	queryServer := newQueryServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Assignee", "pk2")

	for i := 0; i < 3; i++ {
		_, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
			Creator:        delegator,
			Assignee:       assignee,
			Description:    fmt.Sprintf("Task %d", i),
			Budget:         "1000",
			DeadlineBlocks: 100,
		})
		require.NoError(t, err)
	}

	qResp, err := queryServer.TasksByDelegator(f.ctx, &types.QueryTasksByDelegatorRequest{Address: delegator})
	require.NoError(t, err)
	require.Len(t, qResp.Tasks, 3)
}

func TestQueryTasksByAssignee(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	queryServer := newQueryServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Assignee", "pk2")

	for i := 0; i < 2; i++ {
		_, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
			Creator:        delegator,
			Assignee:       assignee,
			Description:    fmt.Sprintf("Assignee task %d", i),
			Budget:         "1000",
			DeadlineBlocks: 100,
		})
		require.NoError(t, err)
	}

	qResp, err := queryServer.TasksByAssignee(f.ctx, &types.QueryTasksByAssigneeRequest{Address: assignee})
	require.NoError(t, err)
	require.Len(t, qResp.Tasks, 2)
}

// ---------------------------------------------------------------------------
// Full task delegation workflow
// ---------------------------------------------------------------------------

func TestFullTaskDelegationWorkflow(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	queryServer := newQueryServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Worker", "pk2")

	// Step 1: Delegate task.
	delegateResp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Build the smart contract",
		Requirements:   "Solidity experience required",
		SkillId:        42,
		Budget:         "10000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)
	taskID := delegateResp.TaskId

	// Verify pending.
	qResp, err := queryServer.Task(f.ctx, &types.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.True(t, qResp.Found)
	require.Equal(t, "pending", qResp.Status)

	// Step 2: Accept task.
	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  taskID,
	})
	require.NoError(t, err)

	qResp, err = queryServer.Task(f.ctx, &types.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "accepted", qResp.Status)

	// Step 3: Complete task.
	_, err = msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: assignee,
		TaskId:  taskID,
		Result:  "Contract deployed at 0xabc123",
	})
	require.NoError(t, err)

	qResp, err = queryServer.Task(f.ctx, &types.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "completed", qResp.Status)
	require.Equal(t, "Contract deployed at 0xabc123", qResp.Result)

	// Verify queries by delegator and assignee.
	delegatorTasks, err := queryServer.TasksByDelegator(f.ctx, &types.QueryTasksByDelegatorRequest{Address: delegator})
	require.NoError(t, err)
	require.Len(t, delegatorTasks.Tasks, 1)

	assigneeTasks, err := queryServer.TasksByAssignee(f.ctx, &types.QueryTasksByAssigneeRequest{Address: assignee})
	require.NoError(t, err)
	require.Len(t, assigneeTasks.Tasks, 1)
}

// ===========================================================================
// Track E: Security + Economic Policy — Integration Tests
// ===========================================================================

// ---------------------------------------------------------------------------
// Rate limit enforcement
// ---------------------------------------------------------------------------

func TestActionRateLimitExceeded(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	// Set low limit for testing.
	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	params.MaxActionsPerBlock = 2
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	addr := validAddress()
	registerAgent(t, f, addr, "RateLimitAgent", "pk1")

	// First 2 actions should succeed.
	for i := 0; i < 2; i++ {
		_, err := msgServer.AgentAction(f.ctx, &types.MsgAgentAction{
			Creator:    addr,
			ActionType: "query",
			Payload:    fmt.Sprintf(`{"seq":%d}`, i),
		})
		require.NoError(t, err, "action %d should succeed", i)
	}

	// 3rd action should fail with rate limit exceeded.
	_, err = msgServer.AgentAction(f.ctx, &types.MsgAgentAction{
		Creator:    addr,
		ActionType: "query",
		Payload:    `{"seq":2}`,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "rate limit")
}

func TestIntentRateLimitExceeded(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	params.MaxIntentsPerBlock = 1
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	addr := validAddress()
	registerAgent(t, f, addr, "IntentSpammer", "pk1")

	// First intent succeeds.
	_, err = msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr,
		IntentType:  "joint_transfer",
		Description: "test",
	})
	require.NoError(t, err)

	// Second intent hits the limit.
	_, err = msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr,
		IntentType:  "joint_transfer",
		Description: "test2",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "rate limit")
}

func TestTaskRateLimitExceeded(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	params.MaxTasksPerBlock = 1
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Assignee", "pk2")

	// First task succeeds.
	_, err = msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Task 1",
		Budget:         "1000",
		DeadlineBlocks: 200,
	})
	require.NoError(t, err)

	// Second task hits the limit.
	_, err = msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Task 2",
		Budget:         "1000",
		DeadlineBlocks: 200,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "rate limit")
}

// ---------------------------------------------------------------------------
// Heartbeat interval enforcement
// ---------------------------------------------------------------------------

func TestHeartbeatIntervalEnforced(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	params.MinHeartbeatIntervalBlocks = 5
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	addr := validAddress()
	registerAgent(t, f, addr, "HeartbeatAgent", "pk1")

	// First heartbeat always succeeds (no prior liveness record).
	_, err = msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:  addr,
		Endpoint: "https://agent.example.com",
	})
	require.NoError(t, err)

	// Immediate second heartbeat (same block) should fail.
	_, err = msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:  addr,
		Endpoint: "https://agent.example.com",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "heartbeat sent too frequently")
}

// ---------------------------------------------------------------------------
// Payload size enforcement
// ---------------------------------------------------------------------------

func TestPayloadTooLarge(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	// Set a small payload limit for testing.
	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	params.MaxPayloadBytes = 64
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	addr := validAddress()
	registerAgent(t, f, addr, "PayloadAgent", "pk1")

	// Action with oversized payload.
	bigPayload := strings.Repeat("x", 128)
	_, err = msgServer.AgentAction(f.ctx, &types.MsgAgentAction{
		Creator:    addr,
		ActionType: "query",
		Payload:    bigPayload,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "payload exceeds max_payload_bytes")

	// Action with normal payload should succeed.
	_, err = msgServer.AgentAction(f.ctx, &types.MsgAgentAction{
		Creator:    addr,
		ActionType: "query",
		Payload:    `{"ok":true}`,
	})
	require.NoError(t, err)
}

func TestPayloadSizeOnHeartbeat(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	params.MaxPayloadBytes = 32
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	addr := validAddress()
	registerAgent(t, f, addr, "HBPayload", "pk1")

	bigMeta := strings.Repeat("m", 64)
	_, err = msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:  addr,
		Metadata: bigMeta,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "payload exceeds max_payload_bytes")
}

func TestPayloadSizeOnIntent(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	params.MaxPayloadBytes = 32
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	addr := validAddress()
	registerAgent(t, f, addr, "IntentPayload", "pk1")

	bigDesc := strings.Repeat("d", 64)
	_, err = msgServer.SubmitIntent(f.ctx, &types.MsgSubmitIntent{
		Creator:     addr,
		IntentType:  "joint_transfer",
		Description: bigDesc,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "payload exceeds max_payload_bytes")
}

func TestPayloadSizeOnDelegateTask(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	params.MaxPayloadBytes = 32
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Assignee", "pk2")

	bigReqs := strings.Repeat("r", 64)
	_, err = msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "ok",
		Requirements:   bigReqs,
		Budget:         "1000",
		DeadlineBlocks: 200,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "payload exceeds max_payload_bytes")
}

// ---------------------------------------------------------------------------
// Deposit on registration
// ---------------------------------------------------------------------------

func TestRegisterAgentWithDeposit(t *testing.T) {
	depositAmount := uint64(500_000)
	f := initFixtureWithDeposit(t, depositAmount)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	addrBytes, _ := f.addressCodec.StringToBytes(addr)

	// Fund the account so deposit can be locked.
	f.bankKeeper.fundAccount(addrBytes, sdk.NewCoins(sdk.NewInt64Coin("uclaw", int64(depositAmount))))

	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pk1",
		Endpoint: "https://agent.example.com",
		Name:     "DepositAgent",
	})
	require.NoError(t, err)

	// Verify deposit was locked into module account.
	modBal := f.bankKeeper.moduleBalances[types.ModuleName]
	require.True(t, modBal.AmountOf("uclaw").Equal(sdkmath.NewInt(int64(depositAmount))))

	// Verify agent has deposit recorded.
	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, fmt.Sprintf("%d", depositAmount), agent.DepositAmount)
}

func TestRegisterAgentInsufficientDeposit(t *testing.T) {
	depositAmount := uint64(500_000)
	f := initFixtureWithDeposit(t, depositAmount)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	addrBytes, _ := f.addressCodec.StringToBytes(addr)

	// Fund less than required.
	f.bankKeeper.fundAccount(addrBytes, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100)))

	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pk1",
		Endpoint: "https://agent.example.com",
		Name:     "PoorAgent",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "deposit")
}

// ---------------------------------------------------------------------------
// Deregistration + deposit refund
// ---------------------------------------------------------------------------

func TestDeregisterAgentRefundsDeposit(t *testing.T) {
	depositAmount := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositAmount)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	addrBytes, _ := f.addressCodec.StringToBytes(addr)

	// Fund and register.
	f.bankKeeper.fundAccount(addrBytes, sdk.NewCoins(sdk.NewInt64Coin("uclaw", int64(depositAmount))))
	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pk1",
		Endpoint: "https://agent.example.com",
		Name:     "RefundAgent",
	})
	require.NoError(t, err)

	// Account should have 0 balance after deposit.
	acctBal := f.bankKeeper.accountBalances[sdk.AccAddress(addrBytes).String()]
	require.True(t, acctBal.AmountOf("uclaw").IsZero())

	// Deregister.
	_, err = msgServer.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: addr,
	})
	require.NoError(t, err)

	// Account should have deposit back.
	acctBal = f.bankKeeper.accountBalances[sdk.AccAddress(addrBytes).String()]
	require.True(t, acctBal.AmountOf("uclaw").Equal(sdkmath.NewInt(int64(depositAmount))))

	// Module balance should be zero.
	modBal := f.bankKeeper.moduleBalances[types.ModuleName]
	require.True(t, modBal.AmountOf("uclaw").IsZero())

	// Agent should no longer exist.
	_, err = f.keeper.Agents.Get(f.ctx, addr)
	require.Error(t, err)
}

func TestDeregisterAgentNotRegistered(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	_, err := msgServer.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: validAddress(),
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "agent not found")
}

// ---------------------------------------------------------------------------
// Deregistration blocked with active tasks
// ---------------------------------------------------------------------------

func TestDeregisterAgentBlockedByActiveTasks(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Worker", "pk2")

	// Create a pending task.
	_, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Blocking task",
		Budget:         "1000",
		DeadlineBlocks: 100,
	})
	require.NoError(t, err)

	// Assignee cannot deregister with pending task.
	_, err = msgServer.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: assignee,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "active tasks")

	// Delegator also cannot deregister.
	_, err = msgServer.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: delegator,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "active tasks")
}

func TestDeregisterAgentAllowedAfterTaskCompletion(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	delegator := validAddress()
	assignee := validAddress2()
	registerAgent(t, f, delegator, "Delegator", "pk1")
	registerAgent(t, f, assignee, "Worker", "pk2")

	// Create, accept, and complete a task.
	resp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        delegator,
		Assignee:       assignee,
		Description:    "Task to complete",
		Budget:         "1000",
		DeadlineBlocks: 100,
	})
	require.NoError(t, err)

	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: assignee,
		TaskId:  resp.TaskId,
	})
	require.NoError(t, err)

	_, err = msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: assignee,
		TaskId:  resp.TaskId,
		Result:  "done",
	})
	require.NoError(t, err)

	// Now deregistration should succeed.
	_, err = msgServer.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: assignee,
	})
	require.NoError(t, err)

	// Verify agent is gone.
	_, err = f.keeper.Agents.Get(f.ctx, assignee)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// Deposit slashing
// ---------------------------------------------------------------------------

func TestSlashAgentDeposit(t *testing.T) {
	depositAmount := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositAmount)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	addrBytes, _ := f.addressCodec.StringToBytes(addr)

	// Fund and register.
	f.bankKeeper.fundAccount(addrBytes, sdk.NewCoins(sdk.NewInt64Coin("uclaw", int64(depositAmount))))
	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pk1",
		Endpoint: "https://agent.example.com",
		Name:     "SlashableAgent",
	})
	require.NoError(t, err)

	// Slash 100 bps (1%) of the deposit via the keeper adapter.
	err = f.keeper.SlashAgentDeposit(f.ctx, addr, 100)
	require.NoError(t, err)

	// Verify: 1% of 1_000_000 = 10_000 slashed, 990_000 remaining.
	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, "990000", agent.DepositAmount)

	// Verify burned coins.
	require.True(t, f.bankKeeper.BurnedCoins.AmountOf("uclaw").Equal(sdkmath.NewInt(10_000)))

	// Slash again — 100 bps of 990_000 = 9900 slashed, 980100 remaining.
	err = f.keeper.SlashAgentDeposit(f.ctx, addr, 100)
	require.NoError(t, err)

	agent, err = f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, "980100", agent.DepositAmount)
}

func TestSlashAgentDepositZeroDeposit(t *testing.T) {
	f := initFixture(t)

	addr := validAddress()
	registerAgent(t, f, addr, "NoDepositAgent", "pk1")

	// Slashing an agent with zero deposit should not panic.
	err := f.keeper.SlashAgentDeposit(f.ctx, addr, 100)
	// May return nil or an error; either is acceptable — just no panic.
	_ = err
}

// ---------------------------------------------------------------------------
// End-to-end: deposit lifecycle (register -> slash -> deregister)
// ---------------------------------------------------------------------------

// TestFullAgentLifecycleE2E exercises the complete agent flow that
// the PRD Slice 1 mandates: register -> heartbeat -> delegate task ->
// accept task -> complete task -> verify all queries return consistent state.
func TestFullAgentLifecycleE2E(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	queryServer := newQueryServer(t, f)

	operator := validAddress()
	worker := validAddress2()

	// --- Step 1: Register both agents ---
	registerAgent(t, f, operator, "Operator", "pk_operator")
	registerAgent(t, f, worker, "Worker", "pk_worker")

	// Verify agent query.
	agentResp, err := queryServer.Agent(f.ctx, &types.QueryAgentRequest{Address: operator})
	require.NoError(t, err)
	require.True(t, agentResp.Registered)
	require.Equal(t, "Operator", agentResp.Name)

	// --- Step 2: Send heartbeats ---
	_, err = msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:    operator,
		NodeHeight: 10,
		Endpoint:   "https://operator.example.com",
		Metadata:   "alive",
	})
	require.NoError(t, err)

	_, err = msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:    worker,
		NodeHeight: 10,
		Endpoint:   "https://worker.example.com",
		Metadata:   "alive",
	})
	require.NoError(t, err)

	// Verify liveness query.
	livenessResp, err := queryServer.AgentLiveness(f.ctx, &types.QueryAgentLivenessRequest{Address: operator})
	require.NoError(t, err)
	require.True(t, livenessResp.Found)
	require.Equal(t, "https://operator.example.com", livenessResp.Liveness.Endpoint)

	// --- Step 3: Delegate task ---
	delegateResp, err := msgServer.DelegateTask(f.ctx, &types.MsgDelegateTask{
		Creator:        operator,
		Assignee:       worker,
		Description:    "Index blockchain events",
		Requirements:   "Go + Cosmos SDK",
		Budget:         "5000",
		DeadlineBlocks: 100,
	})
	require.NoError(t, err)
	taskID := delegateResp.TaskId

	// Verify task is pending.
	taskResp, err := queryServer.Task(f.ctx, &types.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.True(t, taskResp.Found)
	require.Equal(t, "pending", taskResp.Status)
	require.Equal(t, operator, taskResp.DelegatorAddress)
	require.Equal(t, worker, taskResp.AssigneeAddress)

	// --- Step 4: Accept task ---
	_, err = msgServer.AcceptTask(f.ctx, &types.MsgAcceptTask{
		Creator: worker,
		TaskId:  taskID,
	})
	require.NoError(t, err)

	taskResp, err = queryServer.Task(f.ctx, &types.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "accepted", taskResp.Status)

	// --- Step 5: Complete task ---
	_, err = msgServer.CompleteTask(f.ctx, &types.MsgCompleteTask{
		Creator: worker,
		TaskId:  taskID,
		Result:  "Indexer deployed, 100k events processed",
	})
	require.NoError(t, err)

	taskResp, err = queryServer.Task(f.ctx, &types.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "completed", taskResp.Status)
	require.Equal(t, "Indexer deployed, 100k events processed", taskResp.Result)

	// --- Step 6: Verify cross-query consistency ---
	// Tasks by delegator.
	byDelegator, err := queryServer.TasksByDelegator(f.ctx, &types.QueryTasksByDelegatorRequest{Address: operator})
	require.NoError(t, err)
	require.Len(t, byDelegator.Tasks, 1)
	require.Equal(t, taskID, byDelegator.Tasks[0].TaskId)

	// Tasks by assignee.
	byAssignee, err := queryServer.TasksByAssignee(f.ctx, &types.QueryTasksByAssigneeRequest{Address: worker})
	require.NoError(t, err)
	require.Len(t, byAssignee.Tasks, 1)
	require.Equal(t, taskID, byAssignee.Tasks[0].TaskId)

	// Agent stats reflect the actions.
	statsResp, err := queryServer.AgentStats(f.ctx, &types.QueryAgentStatsRequest{Address: operator})
	require.NoError(t, err)
	require.NotNil(t, statsResp)
}

func TestDepositLifecycleE2E(t *testing.T) {
	depositAmount := uint64(1_000_000)
	f := initFixtureWithDeposit(t, depositAmount)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	addrBytes, _ := f.addressCodec.StringToBytes(addr)

	// Step 1: Fund and register.
	f.bankKeeper.fundAccount(addrBytes, sdk.NewCoins(sdk.NewInt64Coin("uclaw", int64(depositAmount))))
	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   "pk1",
		Endpoint: "https://agent.example.com",
		Name:     "LifecycleAgent",
	})
	require.NoError(t, err)

	// Step 2: Slash 500 bps (5%).
	err = f.keeper.SlashAgentDeposit(f.ctx, addr, 500)
	require.NoError(t, err)

	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, "950000", agent.DepositAmount) // 1M - 50K

	// Step 3: Deregister — should refund remaining 950000.
	_, err = msgServer.DeregisterAgent(f.ctx, &types.MsgDeregisterAgent{
		Creator: addr,
	})
	require.NoError(t, err)

	acctBal := f.bankKeeper.accountBalances[sdk.AccAddress(addrBytes).String()]
	require.True(t, acctBal.AmountOf("uclaw").Equal(sdkmath.NewInt(950_000)))

	// 50K was burned.
	require.True(t, f.bankKeeper.BurnedCoins.AmountOf("uclaw").Equal(sdkmath.NewInt(50_000)))
}
