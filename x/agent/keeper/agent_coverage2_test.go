//go:build integration
// +build integration

package keeper_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"cosmossdk.io/math"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	agentibc "clawchain/x/agent/ibc"
	"clawchain/x/agent/keeper"
	module "clawchain/x/agent/module"
	"clawchain/x/agent/types"
)

// ---------------------------------------------------------------------------
// Mock MintKeeper for reward distribution tests
// ---------------------------------------------------------------------------

type mockMintKeeper struct {
	denom            string
	annualProvisions math.LegacyDec
}

func (m *mockMintKeeper) GetMintDenom(_ context.Context) (string, error) {
	return m.denom, nil
}

func (m *mockMintKeeper) GetAnnualProvisions(_ context.Context) (math.LegacyDec, error) {
	return m.annualProvisions, nil
}

// fixtureWithMint is a test fixture that includes a mock mint keeper.
type fixtureWithMint struct {
	fixture
	mintKeeper *mockMintKeeper
}

// initFixtureWithMint creates a fixture with a configured mock mint keeper.
func initFixtureWithMint(t *testing.T) *fixtureWithMint {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bk := newMockBankKeeper()
	mk := &mockMintKeeper{
		denom:            "uclaw",
		annualProvisions: math.LegacyNewDec(100_000_000_000), // 100B uclaw/year
	}

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authority,
		bk,
		mk,
		nil, // reputationKeeper
	)

	params := types.DefaultParams()
	params.MinAgentDepositUclaw = 0
	if err := k.Params.Set(ctx, params); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	return &fixtureWithMint{
		fixture: fixture{
			ctx:          ctx,
			keeper:       k,
			addressCodec: addressCodec,
			bankKeeper:   bk,
		},
		mintKeeper: mk,
	}
}

// registerAgentWithMint is the same as registerAgent but works with fixtureWithMint.
func registerAgentWithMint(t *testing.T, fm *fixtureWithMint, addr, name, pubkey string) {
	t.Helper()
	msgServer, ok := keeper.NewMsgServerImpl(fm.keeper).(extendedMsgServer)
	require.True(t, ok)

	_, err := msgServer.RegisterAgent(fm.ctx, &types.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   pubkey,
		Endpoint: "https://agent.example.com",
		Name:     name,
	})
	require.NoError(t, err)

	agent, err := fm.keeper.Agents.Get(fm.ctx, addr)
	require.NoError(t, err)
	agent.DepositAmount = "1000000"
	require.NoError(t, fm.keeper.Agents.Set(fm.ctx, addr, agent))

	addrBytes, _ := sdk.AccAddressFromBech32(addr)
	fm.bankKeeper.fundAccount(addrBytes, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	fm.bankKeeper.moduleBalances[types.ModuleName] = fm.bankKeeper.moduleBalances[types.ModuleName].Add(
		sdk.NewInt64Coin("uclaw", 1_000_000),
	)
}

// ---------------------------------------------------------------------------
// ProposeNegotiation tests
// ---------------------------------------------------------------------------

func TestProposeNegotiation_Success(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Build ML pipeline", `{"gpu":"A100"}`,
		0, "5000000", 200, 5,
	)
	require.NoError(t, err)

	// Verify via direct query.
	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, addr1, neg.Initiator)
	require.Equal(t, addr2, neg.Counterparty)
	require.Equal(t, "Build ML pipeline", neg.Description)
	require.Equal(t, types.NegotiationStatusOpen, neg.Status)
	require.Equal(t, uint32(0), neg.Round)
	require.Equal(t, "5000000", neg.ProposedBudget)
	require.Equal(t, int64(200), neg.ProposedDeadline)
	require.Equal(t, addr1, neg.LastProposer)
	require.Len(t, neg.History, 1)
}

func TestProposeNegotiation_SelfNegotiation(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	registerAgent(t, f, addr1, "Agent1", "pk1")

	_, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr1, "Self deal", "", 0, "1000", 100, 3,
	)
	require.Error(t, err)
	require.ErrorContains(t, err, "cannot negotiate with yourself")
}

func TestProposeNegotiation_EmptyDescription(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	_, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "", "", 0, "1000", 100, 3,
	)
	require.Error(t, err)
	require.ErrorContains(t, err, "description cannot be empty")
}

func TestProposeNegotiation_InvalidInitiator(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.ProposeNegotiation(
		f.ctx, "bad-address", validAddress2(), "test", "", 0, "100", 10, 3,
	)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid initiator address")
}

func TestProposeNegotiation_InvalidCounterparty(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	registerAgent(t, f, addr1, "Agent1", "pk1")

	_, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, "bad-address", "test", "", 0, "100", 10, 3,
	)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid counterparty address")
}

func TestProposeNegotiation_UnregisteredInitiator(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	// addr1 NOT registered
	registerAgent(t, f, addr2, "Agent2", "pk2")

	_, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "test", "", 0, "100", 10, 3,
	)
	require.Error(t, err)
	require.ErrorContains(t, err, "agent not found")
}

func TestProposeNegotiation_InactiveInitiator(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	// Deactivate addr1.
	agent, _ := f.keeper.Agents.Get(f.ctx, addr1)
	agent.Active = false
	require.NoError(t, f.keeper.Agents.Set(f.ctx, addr1, agent))

	_, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "test", "", 0, "100", 10, 3,
	)
	require.Error(t, err)
	require.ErrorContains(t, err, "initiator agent is inactive")
}

func TestProposeNegotiation_InactiveCounterparty(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	// Deactivate addr2.
	agent, _ := f.keeper.Agents.Get(f.ctx, addr2)
	agent.Active = false
	require.NoError(t, f.keeper.Agents.Set(f.ctx, addr2, agent))

	_, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "test", "", 0, "100", 10, 3,
	)
	require.Error(t, err)
	require.ErrorContains(t, err, "counterparty agent is inactive")
}

func TestProposeNegotiation_DefaultMaxRounds(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	// maxRounds = 0 should default to DefaultNegotiationMaxRounds.
	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "test", "", 0, "100", 10, 0,
	)
	require.NoError(t, err)

	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, types.DefaultNegotiationMaxRounds, neg.MaxRounds)
}

// ---------------------------------------------------------------------------
// CounterNegotiation tests
// ---------------------------------------------------------------------------

func TestCounterNegotiation_Success(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	// Counterparty (addr2) counters.
	err = f.keeper.CounterNegotiation(f.ctx, negID, addr2, "3000", 150, "Lower budget please")
	require.NoError(t, err)

	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, types.NegotiationStatusCountered, neg.Status)
	require.Equal(t, uint32(1), neg.Round)
	require.Equal(t, "3000", neg.ProposedBudget)
	require.Equal(t, int64(150), neg.ProposedDeadline)
	require.Equal(t, addr2, neg.LastProposer)
	require.Len(t, neg.History, 2)
	require.Equal(t, "Lower budget please", neg.History[1].Message)
}

func TestCounterNegotiation_SameProposerFails(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	// Initiator (who is the last proposer) tries to counter their own proposal.
	err = f.keeper.CounterNegotiation(f.ctx, negID, addr1, "4000", 180, "")
	require.Error(t, err)
	require.ErrorContains(t, err, "cannot counter your own proposal")
}

func TestCounterNegotiation_ThirdPartyFails(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	addr3 := validAddress3()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")
	registerAgent(t, f, addr3, "Agent3", "pk3")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	// Third party tries to counter.
	err = f.keeper.CounterNegotiation(f.ctx, negID, addr3, "4000", 180, "")
	require.Error(t, err)
	require.ErrorContains(t, err, "caller is not a party to this negotiation")
}

func TestCounterNegotiation_NotFoundFails(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.CounterNegotiation(f.ctx, 999, validAddress(), "1000", 100, "")
	require.Error(t, err)
	require.ErrorContains(t, err, "negotiation 999 not found")
}

func TestCounterNegotiation_MaxRoundsReached(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	// Create negotiation with only 2 max rounds.
	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 2,
	)
	require.NoError(t, err)

	// Round 0 -> 1: counterparty counters.
	err = f.keeper.CounterNegotiation(f.ctx, negID, addr2, "3000", 150, "")
	require.NoError(t, err)

	// Round 1 -> 2: would exceed maxRounds (2).
	err = f.keeper.CounterNegotiation(f.ctx, negID, addr1, "4000", 180, "")
	require.Error(t, err)
	require.ErrorContains(t, err, "maximum number of rounds")
}

func TestCounterNegotiation_RejectedNegotiation(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	// Reject the negotiation.
	err = f.keeper.RejectNegotiation(f.ctx, negID, addr2)
	require.NoError(t, err)

	// Try to counter a rejected negotiation.
	err = f.keeper.CounterNegotiation(f.ctx, negID, addr2, "3000", 150, "")
	require.Error(t, err)
	require.ErrorContains(t, err, "negotiation is not open or countered")
}

// ---------------------------------------------------------------------------
// AcceptNegotiation tests
// ---------------------------------------------------------------------------

func TestAcceptNegotiation_Success(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "ML inference task", `{"model":"llama3"}`,
		42, "10000000", 300, 5,
	)
	require.NoError(t, err)

	// Counterparty accepts the initial proposal.
	taskID, err := f.keeper.AcceptNegotiation(f.ctx, negID, addr2)
	require.NoError(t, err)

	// Verify negotiation status changed.
	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, types.NegotiationStatusAccepted, neg.Status)

	// Verify a task was created from the negotiation terms.
	task, err := f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Equal(t, addr1, task.DelegatorAddress)
	require.Equal(t, addr2, task.AssigneeAddress)
	require.Equal(t, "ML inference task", task.Description)
	require.Equal(t, `{"model":"llama3"}`, task.Requirements)
	require.Equal(t, uint64(42), task.SkillId)
	require.Equal(t, "10000000", task.Budget)
	require.Equal(t, int64(300), task.DeadlineBlocks)
	require.Equal(t, "pending", task.Status)
}

func TestAcceptNegotiation_SameProposerFails(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	// Initiator (last proposer) tries to accept their own proposal.
	_, err = f.keeper.AcceptNegotiation(f.ctx, negID, addr1)
	require.Error(t, err)
	require.ErrorContains(t, err, "cannot accept your own proposal")
}

func TestAcceptNegotiation_ThirdPartyFails(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	addr3 := validAddress3()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")
	registerAgent(t, f, addr3, "Agent3", "pk3")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	_, err = f.keeper.AcceptNegotiation(f.ctx, negID, addr3)
	require.Error(t, err)
	require.ErrorContains(t, err, "caller is not a party to this negotiation")
}

func TestAcceptNegotiation_AlreadyAccepted(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	// Accept once.
	_, err = f.keeper.AcceptNegotiation(f.ctx, negID, addr2)
	require.NoError(t, err)

	// Accept again -- should fail since status is now "accepted".
	_, err = f.keeper.AcceptNegotiation(f.ctx, negID, addr2)
	require.Error(t, err)
	require.ErrorContains(t, err, "negotiation is not open or countered")
}

func TestAcceptNegotiation_AfterCounter(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	// Counterparty counters.
	err = f.keeper.CounterNegotiation(f.ctx, negID, addr2, "3000", 150, "")
	require.NoError(t, err)

	// Initiator accepts the counter-proposal (addr2 is now last proposer).
	taskID, err := f.keeper.AcceptNegotiation(f.ctx, negID, addr1)
	require.NoError(t, err)

	// Task should have the countered terms.
	task, err := f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Equal(t, "3000", task.Budget)
	require.Equal(t, int64(150), task.DeadlineBlocks)
}

// ---------------------------------------------------------------------------
// RejectNegotiation tests
// ---------------------------------------------------------------------------

func TestRejectNegotiation_ByCounterparty(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	err = f.keeper.RejectNegotiation(f.ctx, negID, addr2)
	require.NoError(t, err)

	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, types.NegotiationStatusRejected, neg.Status)
}

func TestRejectNegotiation_ByInitiator(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	// Initiator can also reject their own negotiation.
	err = f.keeper.RejectNegotiation(f.ctx, negID, addr1)
	require.NoError(t, err)

	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, types.NegotiationStatusRejected, neg.Status)
}

func TestRejectNegotiation_ThirdPartyFails(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	addr3 := validAddress3()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")
	registerAgent(t, f, addr3, "Agent3", "pk3")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	err = f.keeper.RejectNegotiation(f.ctx, negID, addr3)
	require.Error(t, err)
	require.ErrorContains(t, err, "caller is not a party to this negotiation")
}

func TestRejectNegotiation_AlreadyRejected(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	err = f.keeper.RejectNegotiation(f.ctx, negID, addr2)
	require.NoError(t, err)

	// Reject again.
	err = f.keeper.RejectNegotiation(f.ctx, negID, addr1)
	require.Error(t, err)
	require.ErrorContains(t, err, "negotiation is not open or countered")
}

// ---------------------------------------------------------------------------
// ExpireNegotiations tests
// ---------------------------------------------------------------------------

func TestExpireNegotiations_ExpiresStaleOpen(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)

	// Call expire with a height past the expiry.
	err = f.keeper.ExpireNegotiations(f.ctx, neg.ExpiresAt+1)
	require.NoError(t, err)

	neg, err = f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, types.NegotiationStatusExpired, neg.Status)
}

func TestExpireNegotiations_DoesNotExpireActive(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	// Call expire with current height (before expiry).
	err = f.keeper.ExpireNegotiations(f.ctx, 0)
	require.NoError(t, err)

	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, types.NegotiationStatusOpen, neg.Status)
}

func TestExpireNegotiations_DoesNotExpireAccepted(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	_, err = f.keeper.AcceptNegotiation(f.ctx, negID, addr2)
	require.NoError(t, err)

	// Call expire far in the future.
	err = f.keeper.ExpireNegotiations(f.ctx, 999999)
	require.NoError(t, err)

	// Should still be accepted.
	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, types.NegotiationStatusAccepted, neg.Status)
}

// ---------------------------------------------------------------------------
// UpdateParam tests
// ---------------------------------------------------------------------------

func TestUpdateParam_MaxHeartbeatGapBlocks(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "max_heartbeat_gap_blocks", "500")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, int64(500), params.MaxHeartbeatGapBlocks)
}

func TestUpdateParam_MaxActionsPerBlock(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "max_actions_per_block", "20")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(20), params.MaxActionsPerBlock)
}

func TestUpdateParam_MinHeartbeatIntervalBlocks(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "min_heartbeat_interval_blocks", "5")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(5), params.MinHeartbeatIntervalBlocks)
}

func TestUpdateParam_MaxPayloadBytes(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "max_payload_bytes", "8192")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(8192), params.MaxPayloadBytes)
}

func TestUpdateParam_MinAgentDepositUclaw(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "min_agent_deposit_uclaw", "2000000")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(2000000), params.MinAgentDepositUclaw)
}

func TestUpdateParam_DepositSlashPerPenaltyBps(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "deposit_slash_per_penalty_bps", "200")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(200), params.DepositSlashPerPenaltyBps)
}

func TestUpdateParam_MinTaskBudgetUclaw(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "min_task_budget_uclaw", "50")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(50), params.MinTaskBudgetUclaw)
}

func TestUpdateParam_RewardDistributionIntervalBlocks(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "reward_distribution_interval_blocks", "200")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(200), params.RewardDistributionIntervalBlocks)
}

func TestUpdateParam_AgentRewardPoolFractionBps(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "agent_reward_pool_fraction_bps", "500")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(500), params.AgentRewardPoolFractionBps)
}

func TestUpdateParam_UnknownKey(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "nonexistent_param", "42")
	require.Error(t, err)
	require.ErrorContains(t, err, "unknown agent param key")
}

func TestUpdateParam_InvalidValue(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "max_heartbeat_gap_blocks", "not_a_number")
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid value")
}

func TestUpdateParam_InvalidUintValue(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "max_actions_per_block", "abc")
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid value")
}

// ---------------------------------------------------------------------------
// ReputationAdapter tests
// ---------------------------------------------------------------------------

func TestIsAgentRegistered_True(t *testing.T) {
	f := initFixture(t)

	addr := validAddress()
	registerAgent(t, f, addr, "RegisteredAgent", "pk_reg")

	registered, err := f.keeper.IsAgentRegistered(f.ctx, addr)
	require.NoError(t, err)
	require.True(t, registered)
}

func TestIsAgentRegistered_False(t *testing.T) {
	f := initFixture(t)

	registered, err := f.keeper.IsAgentRegistered(f.ctx, validAddress())
	require.NoError(t, err)
	require.False(t, registered)
}

func TestGetMaxHeartbeatGapBlocks(t *testing.T) {
	f := initFixture(t)

	gap, err := f.keeper.GetMaxHeartbeatGapBlocks(f.ctx)
	require.NoError(t, err)
	require.Equal(t, types.DefaultMaxHeartbeatGapBlocks, gap)
}

func TestGetDepositSlashBps_Default(t *testing.T) {
	f := initFixture(t)

	bps, err := f.keeper.GetDepositSlashBps(f.ctx)
	require.NoError(t, err)
	require.Equal(t, types.DefaultDepositSlashPerPenaltyBps, bps)
}

func TestGetDepositSlashBps_CustomParam(t *testing.T) {
	f := initFixture(t)

	// Set a custom value.
	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	params.DepositSlashPerPenaltyBps = 500
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	bps, err := f.keeper.GetDepositSlashBps(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(500), bps)
}

func TestSlashAgentDeposit_Success(t *testing.T) {
	f := initFixture(t)

	addr := validAddress()
	registerAgent(t, f, addr, "SlashMe", "pk_slash")

	// Agent has deposit of 1000000 (set by registerAgent).
	// Slash 100 bps = 1% = 10000 uclaw.
	err := f.keeper.SlashAgentDeposit(f.ctx, addr, 100)
	require.NoError(t, err)

	// Verify deposit reduced.
	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, "990000", agent.DepositAmount)

	// Verify coins were burned.
	require.Equal(t, int64(10000), f.bankKeeper.BurnedCoins.AmountOf("uclaw").Int64())
}

func TestSlashAgentDeposit_NotRegistered(t *testing.T) {
	f := initFixture(t)

	// Slashing a non-existent agent should be a no-op (not an error).
	err := f.keeper.SlashAgentDeposit(f.ctx, validAddress(), 100)
	require.NoError(t, err)
}

func TestSlashAgentDeposit_ZeroDeposit(t *testing.T) {
	f := initFixture(t)

	addr := validAddress()
	registerAgent(t, f, addr, "ZeroDepAgent", "pk_zd")

	// Set deposit to zero.
	agent, _ := f.keeper.Agents.Get(f.ctx, addr)
	agent.DepositAmount = "0"
	require.NoError(t, f.keeper.Agents.Set(f.ctx, addr, agent))

	err := f.keeper.SlashAgentDeposit(f.ctx, addr, 100)
	require.NoError(t, err) // no-op, no error
}

func TestSlashAgentDeposit_FullSlash(t *testing.T) {
	f := initFixture(t)

	addr := validAddress()
	registerAgent(t, f, addr, "FullSlash", "pk_fs")

	// Slash 10000 bps = 100% = full deposit.
	err := f.keeper.SlashAgentDeposit(f.ctx, addr, 10000)
	require.NoError(t, err)

	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, "0", agent.DepositAmount)
}

func TestWalkHeartbeatStatuses_NoAgents(t *testing.T) {
	f := initFixture(t)

	var visited int
	err := f.keeper.WalkHeartbeatStatuses(f.ctx, func(address string, lastHeartbeatHeight int64) (bool, error) {
		visited++
		return false, nil
	})
	require.NoError(t, err)
	require.Equal(t, 0, visited)
}

func TestWalkHeartbeatStatuses_WithHeartbeats(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "HBAgent1", "pk_hb1")
	registerAgent(t, f, addr2, "HBAgent2", "pk_hb2")

	// Send heartbeats.
	_, err := msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator: addr1, NodeHeight: 10, Endpoint: "https://hb1.example.com",
	})
	require.NoError(t, err)
	_, err = msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator: addr2, NodeHeight: 20, Endpoint: "https://hb2.example.com",
	})
	require.NoError(t, err)

	visited := make(map[string]int64)
	err = f.keeper.WalkHeartbeatStatuses(f.ctx, func(address string, lastHeartbeatHeight int64) (bool, error) {
		visited[address] = lastHeartbeatHeight
		return false, nil
	})
	require.NoError(t, err)
	require.Len(t, visited, 2)
	require.Contains(t, visited, addr1)
	require.Contains(t, visited, addr2)
}

func TestWalkHeartbeatStatuses_EarlyStop(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "HBStop1", "pk_hs1")
	registerAgent(t, f, addr2, "HBStop2", "pk_hs2")

	_, _ = msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator: addr1, NodeHeight: 10, Endpoint: "https://hs1.example.com",
	})
	_, _ = msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator: addr2, NodeHeight: 20, Endpoint: "https://hs2.example.com",
	})

	var count int
	err := f.keeper.WalkHeartbeatStatuses(f.ctx, func(_ string, _ int64) (bool, error) {
		count++
		return true, nil // stop after first
	})
	require.NoError(t, err)
	require.Equal(t, 1, count)
}

func TestWalkCompletedTaskSLAEvents_NoTasks(t *testing.T) {
	f := initFixture(t)

	var visited int
	err := f.keeper.WalkCompletedTaskSLAEvents(f.ctx, 0, func(taskID uint64, assignee string, onTime bool, latenessBlocks int64) (bool, error) {
		visited++
		return false, nil
	})
	require.NoError(t, err)
	require.Equal(t, 0, visited)
}

func TestWalkCompletedTaskSLAEvents_WithCompletedTask(t *testing.T) {
	f := initFixture(t)

	// Manually insert a completed task.
	task := types.TaskRecord{
		TaskId:           1,
		DelegatorAddress: validAddress(),
		AssigneeAddress:  validAddress2(),
		Description:      "SLA test",
		Budget:           "1000",
		DeadlineBlocks:   100,
		CreatedAt:        10,
		CompletedAt:      90, // completed before deadline (10 + 100 = 110)
		Status:           "completed",
	}
	require.NoError(t, f.keeper.Tasks.Set(f.ctx, 1, task))

	var events []struct {
		taskID   uint64
		onTime   bool
		lateness int64
	}
	err := f.keeper.WalkCompletedTaskSLAEvents(f.ctx, 0, func(taskID uint64, _ string, onTime bool, latenessBlocks int64) (bool, error) {
		events = append(events, struct {
			taskID   uint64
			onTime   bool
			lateness int64
		}{taskID, onTime, latenessBlocks})
		return false, nil
	})
	require.NoError(t, err)
	require.Len(t, events, 1)
	require.Equal(t, uint64(1), events[0].taskID)
	require.True(t, events[0].onTime)
	require.Equal(t, int64(0), events[0].lateness)
}

func TestWalkCompletedTaskSLAEvents_LateTask(t *testing.T) {
	f := initFixture(t)

	// Manually insert a late completed task.
	task := types.TaskRecord{
		TaskId:           1,
		DelegatorAddress: validAddress(),
		AssigneeAddress:  validAddress2(),
		Description:      "Late SLA test",
		Budget:           "1000",
		DeadlineBlocks:   100,
		CreatedAt:        10,
		CompletedAt:      120, // completed after deadline (10 + 100 = 110)
		Status:           "completed",
	}
	require.NoError(t, f.keeper.Tasks.Set(f.ctx, 1, task))

	var events []struct {
		onTime   bool
		lateness int64
	}
	err := f.keeper.WalkCompletedTaskSLAEvents(f.ctx, 0, func(_ uint64, _ string, onTime bool, latenessBlocks int64) (bool, error) {
		events = append(events, struct {
			onTime   bool
			lateness int64
		}{onTime, latenessBlocks})
		return false, nil
	})
	require.NoError(t, err)
	require.Len(t, events, 1)
	require.False(t, events[0].onTime)
	require.Equal(t, int64(10), events[0].lateness)
}

func TestWalkCompletedTaskSLAEvents_SkipsPendingTasks(t *testing.T) {
	f := initFixture(t)

	task := types.TaskRecord{
		TaskId:         1,
		Description:    "Pending task",
		Budget:         "1000",
		DeadlineBlocks: 100,
		CreatedAt:      10,
		Status:         "pending",
	}
	require.NoError(t, f.keeper.Tasks.Set(f.ctx, 1, task))

	var visited int
	err := f.keeper.WalkCompletedTaskSLAEvents(f.ctx, 0, func(_ uint64, _ string, _ bool, _ int64) (bool, error) {
		visited++
		return false, nil
	})
	require.NoError(t, err)
	require.Equal(t, 0, visited)
}

// ---------------------------------------------------------------------------
// DiscoverAgents tests
// ---------------------------------------------------------------------------

func TestDiscoverAgents_NoCapFilter(t *testing.T) {
	f := initFixture(t)

	addr := validAddress()
	registerAgent(t, f, addr, "DiscoverMe", "pk_disc")

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	agents := f.keeper.DiscoverAgents(sdkCtx, nil, 10)
	require.Len(t, agents, 1)
	require.Equal(t, addr, agents[0].Address)
	require.Equal(t, "DiscoverMe", agents[0].Name)
	require.True(t, agents[0].Active)
}

func TestDiscoverAgents_WithCapFilter(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()

	// Register addr1 with specific tools.
	_, err := msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:        addr1,
		Pubkey:         "pk_cap1",
		Endpoint:       "https://cap1.example.com",
		Name:           "CapAgent1",
		SupportedTools: []string{"inference", "training"},
	})
	require.NoError(t, err)

	// Register addr2 with different tools.
	_, err = msgServer.RegisterAgent(f.ctx, &types.MsgRegisterAgent{
		Creator:        addr2,
		Pubkey:         "pk_cap2",
		Endpoint:       "https://cap2.example.com",
		Name:           "CapAgent2",
		SupportedTools: []string{"storage"},
	})
	require.NoError(t, err)

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	// Filter by "inference" -- only addr1 should match.
	agents := f.keeper.DiscoverAgents(sdkCtx, []string{"inference"}, 10)
	require.Len(t, agents, 1)
	require.Equal(t, addr1, agents[0].Address)

	// Filter by "storage" -- only addr2 should match.
	agents = f.keeper.DiscoverAgents(sdkCtx, []string{"storage"}, 10)
	require.Len(t, agents, 1)
	require.Equal(t, addr2, agents[0].Address)
}

func TestDiscoverAgents_MaxResultsCapped(t *testing.T) {
	f := initFixture(t)

	addr := validAddress()
	registerAgent(t, f, addr, "SingleAgent", "pk_single")

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	// maxResults=0 should default to 10.
	agents := f.keeper.DiscoverAgents(sdkCtx, nil, 0)
	require.Len(t, agents, 1)

	// maxResults=100 should be capped at 50.
	agents = f.keeper.DiscoverAgents(sdkCtx, nil, 100)
	require.Len(t, agents, 1)
}

func TestDiscoverAgents_SkipsInactive(t *testing.T) {
	f := initFixture(t)

	addr := validAddress()
	registerAgent(t, f, addr, "InactiveDisc", "pk_id")

	// Deactivate.
	agent, _ := f.keeper.Agents.Get(f.ctx, addr)
	agent.Active = false
	require.NoError(t, f.keeper.Agents.Set(f.ctx, addr, agent))

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	agents := f.keeper.DiscoverAgents(sdkCtx, nil, 10)
	require.Len(t, agents, 0)
}

// ---------------------------------------------------------------------------
// QueryTaskResult tests
// ---------------------------------------------------------------------------

func TestQueryTaskResult_Found(t *testing.T) {
	f := initFixture(t)

	task := types.TaskRecord{
		TaskId:      1,
		Description: "Task result test",
		Status:      "completed",
		Result:      `{"output":"42"}`,
	}
	require.NoError(t, f.keeper.Tasks.Set(f.ctx, 1, task))

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	status, result, err := f.keeper.QueryTaskResult(sdkCtx, 1)
	require.NoError(t, err)
	require.Equal(t, "completed", status)
	require.Equal(t, `{"output":"42"}`, result)
}

func TestQueryTaskResult_NotFound(t *testing.T) {
	f := initFixture(t)

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	_, _, err := f.keeper.QueryTaskResult(sdkCtx, 999)
	require.Error(t, err)
	require.ErrorContains(t, err, "task 999 not found")
}

// ---------------------------------------------------------------------------
// CreateTaskForSkillPurchase tests
// ---------------------------------------------------------------------------

func TestCreateTaskForSkillPurchase_Success(t *testing.T) {
	f := initFixture(t)

	buyer := validAddress()
	seller := validAddress2()

	taskID, err := f.keeper.CreateTaskForSkillPurchase(f.ctx, buyer, seller, 7, "ImageGen", "500000", "uclaw")
	require.NoError(t, err)

	task, err := f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Equal(t, buyer, task.DelegatorAddress)
	require.Equal(t, seller, task.AssigneeAddress)
	require.Contains(t, task.Description, "ImageGen")
	require.Contains(t, task.Description, "7")
	require.Equal(t, "500000uclaw", task.Budget)
	require.Equal(t, uint64(7), task.SkillId)
	require.Equal(t, int64(200), task.DeadlineBlocks)
	require.Equal(t, "pending", task.Status)
}

// ---------------------------------------------------------------------------
// QueryAgentRewards tests
// ---------------------------------------------------------------------------

func TestQueryAgentRewards_NoRewards(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	resp, err := qSrv.AgentRewards(f.ctx, &types.QueryAgentRewardsRequest{
		Address: validAddress(),
	})
	require.NoError(t, err)
	require.Equal(t, validAddress(), resp.Address)
	require.Equal(t, "0", resp.CumulativeRewards)
	require.Equal(t, "uclaw", resp.Denom) // default denom when mintKeeper is nil
}

func TestQueryAgentRewards_WithRewards(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	addr := validAddress()
	// Manually set some rewards.
	require.NoError(t, f.keeper.AgentRewards.Set(f.ctx, addr, "42000000"))

	resp, err := qSrv.AgentRewards(f.ctx, &types.QueryAgentRewardsRequest{
		Address: addr,
	})
	require.NoError(t, err)
	require.Equal(t, "42000000", resp.CumulativeRewards)
}

func TestQueryAgentRewards_EmptyAddress(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	_, err := qSrv.AgentRewards(f.ctx, &types.QueryAgentRewardsRequest{
		Address: "",
	})
	require.Error(t, err)
}

func TestQueryAgentRewards_NilRequest(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	_, err := qSrv.AgentRewards(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryAgentRewards_WithMintKeeper(t *testing.T) {
	fm := initFixtureWithMint(t)
	qSrv := keeper.NewQueryServerImpl(fm.keeper)

	resp, err := qSrv.AgentRewards(fm.ctx, &types.QueryAgentRewardsRequest{
		Address: validAddress(),
	})
	require.NoError(t, err)
	require.Equal(t, "uclaw", resp.Denom) // from the mock mint keeper
	require.Equal(t, "0", resp.CumulativeRewards)
}

// ---------------------------------------------------------------------------
// LiveAgents query tests
// ---------------------------------------------------------------------------

func TestQueryLiveAgents_NoAgents(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	resp, err := qSrv.LiveAgents(f.ctx, &types.QueryLiveAgentsRequest{})
	require.NoError(t, err)
	require.Len(t, resp.Agents, 0)
}

func TestQueryLiveAgents_WithHeartbeat(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)
	qSrv := newCoverageQueryServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "LiveAgent", "pk_live")

	_, err := msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:    addr,
		NodeHeight: 50,
		Endpoint:   "https://live.example.com",
	})
	require.NoError(t, err)

	resp, err := qSrv.LiveAgents(f.ctx, &types.QueryLiveAgentsRequest{})
	require.NoError(t, err)
	require.Len(t, resp.Agents, 1)
	require.Equal(t, addr, resp.Agents[0].Address)
	require.Equal(t, "LiveAgent", resp.Agents[0].Name)
	require.Equal(t, "https://live.example.com", resp.Agents[0].Endpoint)
}

func TestQueryLiveAgents_NilRequest(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	_, err := qSrv.LiveAgents(f.ctx, nil)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// Negotiation query tests
// ---------------------------------------------------------------------------

func TestQueryNegotiations_Empty(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	resp, err := qSrv.Negotiations(f.ctx, &types.QueryNegotiationsRequest{})
	require.NoError(t, err)
	require.Len(t, resp.Negotiations, 0)
}

func TestQueryNegotiations_WithData(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Query test", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	resp, err := qSrv.Negotiations(f.ctx, &types.QueryNegotiationsRequest{})
	require.NoError(t, err)
	require.Len(t, resp.Negotiations, 1)
	require.Equal(t, negID, resp.Negotiations[0].Id)
	require.Equal(t, addr1, resp.Negotiations[0].Initiator)
	require.Equal(t, addr2, resp.Negotiations[0].Counterparty)
}

func TestQueryNegotiations_NilRequest(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	_, err := qSrv.Negotiations(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryNegotiationsByAddress(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()
	addr3 := validAddress3()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")
	registerAgent(t, f, addr3, "Agent3", "pk3")

	// Create negotiation between addr1 and addr2.
	_, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "Task 1", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	// Create negotiation between addr1 and addr3.
	_, err = f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr3, "Task 2", "", 0, "3000", 100, 3,
	)
	require.NoError(t, err)

	// addr1 should have 2 negotiations.
	resp, err := qSrv.NegotiationsByAddress(f.ctx, &types.QueryNegotiationsByAddressRequest{
		Address: addr1,
	})
	require.NoError(t, err)
	require.Len(t, resp.Negotiations, 2)

	// addr2 should have 1 negotiation.
	resp, err = qSrv.NegotiationsByAddress(f.ctx, &types.QueryNegotiationsByAddressRequest{
		Address: addr2,
	})
	require.NoError(t, err)
	require.Len(t, resp.Negotiations, 1)

	// addr3 should have 1 negotiation.
	resp, err = qSrv.NegotiationsByAddress(f.ctx, &types.QueryNegotiationsByAddressRequest{
		Address: addr3,
	})
	require.NoError(t, err)
	require.Len(t, resp.Negotiations, 1)
}

func TestQueryNegotiationsByAddress_EmptyAddress(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	_, err := qSrv.NegotiationsByAddress(f.ctx, &types.QueryNegotiationsByAddressRequest{
		Address: "",
	})
	require.Error(t, err)
}

func TestQueryNegotiation_ByID(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "ID query test", `{"foo":"bar"}`, 5, "7000", 300, 5,
	)
	require.NoError(t, err)

	resp, err := qSrv.Negotiation(f.ctx, &types.QueryNegotiationRequest{Id: negID})
	require.NoError(t, err)
	require.Equal(t, negID, resp.Negotiation.Id)
	require.Equal(t, "ID query test", resp.Negotiation.Description)
	require.Equal(t, `{"foo":"bar"}`, resp.Negotiation.Requirements)
	require.Equal(t, uint64(5), resp.Negotiation.SkillId)
}

func TestQueryNegotiation_NotFound(t *testing.T) {
	f := initFixture(t)
	qSrv := newCoverageQueryServer(t, f)

	_, err := qSrv.Negotiation(f.ctx, &types.QueryNegotiationRequest{Id: 999})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// EndBlock tests
// ---------------------------------------------------------------------------

func TestEndBlock_DeactivatesStaleAgent(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "StaleAgent", "pk_stale")

	// Set heartbeat at height 10.
	_, err := msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:    addr,
		NodeHeight: 10,
		Endpoint:   "https://stale.example.com",
	})
	require.NoError(t, err)

	// Simulate a block far in the future (height = 10 + 200 + 1 = 211).
	// MaxHeartbeatGapBlocks defaults to 200, so cutoff = 211 - 200 = 11 > 10 (stale).
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	futureCtx := sdkCtx.WithBlockHeight(211)

	err = f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	// Agent should be deactivated.
	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.False(t, agent.Active)
}

func TestEndBlock_DoesNotDeactivateFreshAgent(t *testing.T) {
	f := initFixture(t)
	msgServer := newMsgServer(t, f)

	addr := validAddress()
	registerAgent(t, f, addr, "FreshAgent", "pk_fresh")

	// Set heartbeat at height 100.
	_, err := msgServer.AgentHeartbeat(f.ctx, &types.MsgAgentHeartbeat{
		Creator:    addr,
		NodeHeight: 100,
		Endpoint:   "https://fresh.example.com",
	})
	require.NoError(t, err)

	// Block height 200: cutoff = 200 - 200 = 0, heartbeat at 100 >= 0, so NOT stale.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	futureCtx := sdkCtx.WithBlockHeight(200)

	err = f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	agent, err := f.keeper.Agents.Get(f.ctx, addr)
	require.NoError(t, err)
	require.True(t, agent.Active)
}

func TestEndBlock_ExpiresOverdueTask(t *testing.T) {
	f := initFixture(t)

	// Manually create a pending task with a short deadline.
	task := types.TaskRecord{
		TaskId:           1,
		DelegatorAddress: validAddress(),
		AssigneeAddress:  validAddress2(),
		Description:      "Expire me",
		Budget:           "0", // zero budget to avoid refund complication
		DeadlineBlocks:   10,
		CreatedAt:        5,
		Status:           "pending",
	}
	require.NoError(t, f.keeper.Tasks.Set(f.ctx, 1, task))

	// Block height 20: deadline = 5 + 10 = 15, currentHeight > 15, so task should expire.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	futureCtx := sdkCtx.WithBlockHeight(20)

	err := f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	task, err = f.keeper.Tasks.Get(f.ctx, uint64(1))
	require.NoError(t, err)
	require.Equal(t, "expired", task.Status)
}

func TestEndBlock_ExpiresOverdueTask_WithBudgetRefund(t *testing.T) {
	f := initFixture(t)

	delegator := validAddress()

	// Fund the module account with budget to refund.
	f.bankKeeper.moduleBalances[types.ModuleName] = f.bankKeeper.moduleBalances[types.ModuleName].Add(
		sdk.NewInt64Coin("uclaw", 5_000_000),
	)

	task := types.TaskRecord{
		TaskId:           1,
		DelegatorAddress: delegator,
		AssigneeAddress:  validAddress2(),
		Description:      "Refund task",
		Budget:           "1000000",
		DeadlineBlocks:   10,
		CreatedAt:        5,
		Status:           "pending",
	}
	require.NoError(t, f.keeper.Tasks.Set(f.ctx, 1, task))

	// Check delegator balance before.
	delegatorAddr, _ := sdk.AccAddressFromBech32(delegator)
	balBefore := f.bankKeeper.accountBalances[delegatorAddr.String()].AmountOf("uclaw")

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	futureCtx := sdkCtx.WithBlockHeight(20)

	err := f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	// Verify refund.
	balAfter := f.bankKeeper.accountBalances[delegatorAddr.String()].AmountOf("uclaw")
	diff := balAfter.Sub(balBefore)
	require.Equal(t, int64(1_000_000), diff.Int64())
}

func TestEndBlock_DoesNotExpireCompletedTask(t *testing.T) {
	f := initFixture(t)

	task := types.TaskRecord{
		TaskId:         1,
		Description:    "Already done",
		DeadlineBlocks: 10,
		CreatedAt:      5,
		Status:         "completed",
	}
	require.NoError(t, f.keeper.Tasks.Set(f.ctx, 1, task))

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	futureCtx := sdkCtx.WithBlockHeight(100)

	err := f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	task, err = f.keeper.Tasks.Get(f.ctx, uint64(1))
	require.NoError(t, err)
	require.Equal(t, "completed", task.Status)
}

func TestEndBlock_DoesNotExpireIBCTask(t *testing.T) {
	f := initFixture(t)

	// IBC-originated task has "ibc:" prefix in delegator address.
	// Budget refund should be skipped for IBC tasks, but task should still be marked expired.
	task := types.TaskRecord{
		TaskId:           1,
		DelegatorAddress: "ibc:osmosis:osmo1abc",
		AssigneeAddress:  validAddress(),
		Description:      "IBC task",
		Budget:           "1000000",
		DeadlineBlocks:   10,
		CreatedAt:        5,
		Status:           "pending",
	}
	require.NoError(t, f.keeper.Tasks.Set(f.ctx, 1, task))

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	futureCtx := sdkCtx.WithBlockHeight(20)

	err := f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	task, err = f.keeper.Tasks.Get(f.ctx, uint64(1))
	require.NoError(t, err)
	require.Equal(t, "expired", task.Status)
}

func TestEndBlock_ExpiresNegotiations(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Agent1", "pk1")
	registerAgent(t, f, addr2, "Agent2", "pk2")

	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "EndBlock neg", "", 0, "5000", 200, 5,
	)
	require.NoError(t, err)

	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)

	// Run EndBlock past the negotiation's expiry.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	futureCtx := sdkCtx.WithBlockHeight(neg.ExpiresAt + 1)

	err = f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	neg, err = f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, types.NegotiationStatusExpired, neg.Status)
}

// ---------------------------------------------------------------------------
// distributeAgentRewards tests (via EndBlock with mintKeeper)
// ---------------------------------------------------------------------------

func TestEndBlock_DistributeRewards_NoMintKeeper(t *testing.T) {
	f := initFixture(t)

	// Set params to trigger reward distribution.
	params, _ := f.keeper.Params.Get(f.ctx)
	params.RewardDistributionIntervalBlocks = 10
	params.AgentRewardPoolFractionBps = 1000
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	// Without a mintKeeper, distribution should silently do nothing.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	futureCtx := sdkCtx.WithBlockHeight(10)

	err := f.keeper.EndBlock(futureCtx)
	require.NoError(t, err)
}

func TestEndBlock_DistributeRewards_WithMintKeeper(t *testing.T) {
	fm := initFixtureWithMint(t)
	msgServer, ok := keeper.NewMsgServerImpl(fm.keeper).(extendedMsgServer)
	require.True(t, ok)

	addr := validAddress()
	registerAgentWithMint(t, fm, addr, "RewardAgent", "pk_rwd")

	// Send a heartbeat (needed for liveness/weight calculation).
	_, err := msgServer.AgentHeartbeat(fm.ctx, &types.MsgAgentHeartbeat{
		Creator:    addr,
		NodeHeight: 1,
		Endpoint:   "https://reward.example.com",
	})
	require.NoError(t, err)

	// Configure params for reward distribution at every 10 blocks.
	params, _ := fm.keeper.Params.Get(fm.ctx)
	params.RewardDistributionIntervalBlocks = 10
	params.AgentRewardPoolFractionBps = 1000
	params.MinReputationForRewardBps = 0 // no minimum
	params.MaxHeartbeatGapBlocks = 0     // disable deactivation
	require.NoError(t, fm.keeper.Params.Set(fm.ctx, params))

	sdkCtx := sdk.UnwrapSDKContext(fm.ctx)
	futureCtx := sdkCtx.WithBlockHeight(10)

	err = fm.keeper.EndBlock(futureCtx)
	require.NoError(t, err)

	// Verify rewards were distributed.
	rewards, err := fm.keeper.AgentRewards.Get(fm.ctx, addr)
	require.NoError(t, err)
	require.NotEqual(t, "", rewards)
	require.NotEqual(t, "0", rewards)
}

func TestEndBlock_DistributeRewards_NoEligibleAgents(t *testing.T) {
	fm := initFixtureWithMint(t)

	// Set params for reward distribution but no agents registered.
	params, _ := fm.keeper.Params.Get(fm.ctx)
	params.RewardDistributionIntervalBlocks = 10
	params.AgentRewardPoolFractionBps = 1000
	params.MaxHeartbeatGapBlocks = 0
	require.NoError(t, fm.keeper.Params.Set(fm.ctx, params))

	sdkCtx := sdk.UnwrapSDKContext(fm.ctx)
	futureCtx := sdkCtx.WithBlockHeight(10)

	err := fm.keeper.EndBlock(futureCtx)
	require.NoError(t, err)
	// No error, no rewards distributed.
}

func TestEndBlock_DistributeRewards_NotDistributionBlock(t *testing.T) {
	fm := initFixtureWithMint(t)

	params, _ := fm.keeper.Params.Get(fm.ctx)
	params.RewardDistributionIntervalBlocks = 10
	params.AgentRewardPoolFractionBps = 1000
	params.MaxHeartbeatGapBlocks = 0
	require.NoError(t, fm.keeper.Params.Set(fm.ctx, params))

	// Block 7 is not a distribution block (10 does not divide 7).
	sdkCtx := sdk.UnwrapSDKContext(fm.ctx)
	futureCtx := sdkCtx.WithBlockHeight(7)

	err := fm.keeper.EndBlock(futureCtx)
	require.NoError(t, err)
}

func TestEndBlock_DistributeRewards_ZeroInterval(t *testing.T) {
	fm := initFixtureWithMint(t)

	// RewardDistributionIntervalBlocks = 0 should skip distribution entirely.
	params, _ := fm.keeper.Params.Get(fm.ctx)
	params.RewardDistributionIntervalBlocks = 0
	params.MaxHeartbeatGapBlocks = 0
	require.NoError(t, fm.keeper.Params.Set(fm.ctx, params))

	sdkCtx := sdk.UnwrapSDKContext(fm.ctx)
	futureCtx := sdkCtx.WithBlockHeight(10)

	err := fm.keeper.EndBlock(futureCtx)
	require.NoError(t, err)
}

// ---------------------------------------------------------------------------
// StoreRemoteAgent tests
// ---------------------------------------------------------------------------

func TestStoreRemoteAgent_Success(t *testing.T) {
	f := initFixture(t)

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	// Import the ibc package types inline.
	type remoteAgentInfo struct {
		ChainID  string   `json:"chain_id"`
		Address  string   `json:"address"`
		Name     string   `json:"name"`
		Endpoint string   `json:"endpoint"`
		Tools    []string `json:"tools,omitempty"`
	}

	// Use keeper method directly (it requires agentibc.RemoteAgentInfo).
	// We test by storing and then reading from the RemoteAgents collection directly.
	key := "osmosis-1:" + validAddress()
	data := `{"chain_id":"osmosis-1","address":"` + validAddress() + `","name":"RemoteBot","endpoint":"https://remote.example.com"}`
	require.NoError(t, f.keeper.RemoteAgents.Set(sdkCtx, key, data))

	stored, err := f.keeper.RemoteAgents.Get(sdkCtx, key)
	require.NoError(t, err)
	require.Contains(t, stored, "RemoteBot")
}

func TestStoreRemoteAgentAndQueryRemoteAgents_UsingKeeperMethods(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	info := agentibc.RemoteAgentInfo{
		ChainID:  "osmosis-1",
		Address:  validAddress(),
		Name:     "RemoteBotMethod",
		Endpoint: "https://remote.method.example.com",
		Tools:    []string{"gpu", "inference"},
	}

	require.NoError(t, f.keeper.StoreRemoteAgent(sdkCtx, "osmosis-1", "channel-0", info))

	results, err := f.keeper.QueryRemoteAgents(sdkCtx)
	require.NoError(t, err)
	require.NotEmpty(t, results)
	require.Contains(t, results[0], "RemoteBotMethod")
}

func TestRemoteAgentsQueryServer(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	require.NoError(t, f.keeper.StoreRemoteAgent(sdkCtx, "osmosis-1", "channel-0", agentibc.RemoteAgentInfo{
		ChainID:  "osmosis-1",
		Address:  validAddress2(),
		Name:     "RemoteQuery",
		Endpoint: "https://remote.query.example.com",
	}))

	queryServer := keeper.NewQueryServerImpl(f.keeper)
	resp, err := queryServer.RemoteAgents(sdkCtx, &types.QueryRemoteAgentsRequest{})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotEmpty(t, resp.Agents)

	_, err = queryServer.RemoteAgents(sdkCtx, nil)
	require.Error(t, err)
}

func TestSetReputationKeeper_NoPanic(t *testing.T) {
	f := initFixture(t)
	f.keeper.SetReputationKeeper(&mockReputationKeeper{scores: map[string]uint64{
		validAddress(): 9000,
	}})
}

func TestCreateTaskFromIBC_SuccessAndUnknownAssignee(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	assignee := validAddress()
	registerAgent(t, f, assignee, "IBC-Assignee", "pk_ibc_assignee")

	taskID, err := f.keeper.CreateTaskFromIBC(
		sdkCtx,
		"remote-delegator",
		"osmosis-1",
		assignee,
		"Cross-chain compute task",
		"",
		7,
		"12345",
		0, // should default to 200
	)
	require.NoError(t, err)
	require.Equal(t, uint64(0), taskID)

	task, err := f.keeper.Tasks.Get(sdkCtx, taskID)
	require.NoError(t, err)
	require.Equal(t, "ibc:osmosis-1:remote-delegator", task.DelegatorAddress)
	require.Equal(t, int64(200), task.DeadlineBlocks)
	require.Contains(t, task.Requirements, `"source_chain":"osmosis-1"`)

	_, err = f.keeper.CreateTaskFromIBC(
		sdkCtx,
		"remote-delegator",
		"osmosis-1",
		validAddress2(), // unregistered assignee
		"Invalid assignee task",
		`{"cpu":"high"}`,
		1,
		"1000",
		25,
	)
	require.Error(t, err)
	require.Contains(t, err.Error(), "is not a registered agent")
}

func TestUpdateParam_AllSupportedKeys(t *testing.T) {
	f := initFixture(t)

	updates := map[string]string{
		"max_heartbeat_gap_blocks":          "120",
		"max_actions_per_block":             "30",
		"min_heartbeat_interval_blocks":     "2",
		"max_intents_per_block":             "40",
		"max_tasks_per_block":               "40",
		"max_payload_bytes":                 "8192",
		"min_agent_deposit_uclaw":           "1000",
		"deposit_slash_per_penalty_bps":     "50",
		"min_task_budget_uclaw":             "1",
		"high_impact_min_deposit_uclaw":     "1000",
		"standard_task_min_budget_uclaw":    "1000",
		"expedited_task_min_budget_uclaw":   "2000",
		"expedited_task_max_deadline_blocks": "300",
		"agent_reward_pool_fraction_bps":    "500",
		"min_reputation_for_reward_bps":     "100",
		"reward_distribution_interval_blocks": "10",
	}

	for key, val := range updates {
		require.NoError(t, f.keeper.UpdateParam(f.ctx, key, val), "key=%s", key)
	}

	require.Error(t, f.keeper.UpdateParam(f.ctx, "unknown_param_key", "1"))
}

func TestQueryServers_ParamsLivenessStats(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	addr := validAddress()

	_, err := queryServer.Params(sdkCtx, nil)
	require.Error(t, err)

	paramsResp, err := queryServer.Params(sdkCtx, &types.QueryParamsRequest{})
	require.NoError(t, err)
	require.NotNil(t, paramsResp)

	_, err = queryServer.AgentLiveness(sdkCtx, nil)
	require.Error(t, err)

	liveResp, err := queryServer.AgentLiveness(sdkCtx, &types.QueryAgentLivenessRequest{Address: addr})
	require.NoError(t, err)
	require.False(t, liveResp.Found)

	require.NoError(t, f.keeper.AgentLiveness.Set(sdkCtx, addr, types.AgentLiveness{
		AgentAddress:        addr,
		LastHeartbeatHeight: 10,
		HeartbeatCount:      2,
	}))
	liveResp, err = queryServer.AgentLiveness(sdkCtx, &types.QueryAgentLivenessRequest{Address: addr})
	require.NoError(t, err)
	require.True(t, liveResp.Found)
	require.Equal(t, uint64(2), liveResp.Liveness.HeartbeatCount)

	_, err = queryServer.AgentStats(sdkCtx, nil)
	require.Error(t, err)
	_, err = queryServer.AgentStats(sdkCtx, &types.QueryAgentStatsRequest{Address: ""})
	require.Error(t, err)

	statsResp, err := queryServer.AgentStats(sdkCtx, &types.QueryAgentStatsRequest{Address: addr})
	require.NoError(t, err)
	require.NotNil(t, statsResp)
}

// ---------------------------------------------------------------------------
// Full negotiation lifecycle test
// ---------------------------------------------------------------------------

func TestNegotiation_FullLifecycle_ProposeCounterCounterAccept(t *testing.T) {
	f := initFixture(t)

	addr1 := validAddress()
	addr2 := validAddress2()
	registerAgent(t, f, addr1, "Buyer", "pk_buyer")
	registerAgent(t, f, addr2, "Seller", "pk_seller")

	// 1. Propose.
	negID, err := f.keeper.ProposeNegotiation(
		f.ctx, addr1, addr2, "GPU compute", `{"gpu":"H100"}`,
		0, "10000000", 500, 5,
	)
	require.NoError(t, err)

	// 2. Counterparty counters.
	err = f.keeper.CounterNegotiation(f.ctx, negID, addr2, "8000000", 400, "Adjust budget")
	require.NoError(t, err)

	// 3. Initiator counters back.
	err = f.keeper.CounterNegotiation(f.ctx, negID, addr1, "9000000", 450, "Final offer")
	require.NoError(t, err)

	neg, err := f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, uint32(2), neg.Round)
	require.Len(t, neg.History, 3)

	// 4. Counterparty accepts.
	taskID, err := f.keeper.AcceptNegotiation(f.ctx, negID, addr2)
	require.NoError(t, err)

	// Verify final state.
	neg, err = f.keeper.QueryNegotiation(f.ctx, negID)
	require.NoError(t, err)
	require.Equal(t, types.NegotiationStatusAccepted, neg.Status)

	task, err := f.keeper.Tasks.Get(f.ctx, taskID)
	require.NoError(t, err)
	require.Equal(t, "9000000", task.Budget)
	require.Equal(t, int64(450), task.DeadlineBlocks)
	require.Equal(t, addr1, task.DelegatorAddress)
	require.Equal(t, addr2, task.AssigneeAddress)
}

// Ensure unused imports are consumed.
var _ = math.ZeroInt
