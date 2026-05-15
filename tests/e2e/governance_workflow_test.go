//go:build e2e
// +build e2e

package e2e

import (
	"context"
	"fmt"
	"testing"

	"cosmossdk.io/core/address"
	"cosmossdk.io/math"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/governance/keeper"
	"clawchain/x/governance/types"
)

// ---------------------------------------------------------------------------
// Mock Bank Keeper (governance)
// ---------------------------------------------------------------------------

type govMockBankKeeper struct {
	moduleBalances  map[string]sdk.Coins
	accountBalances map[string]sdk.Coins
	burnedCoins     sdk.Coins
}

func newGovMockBank() *govMockBankKeeper {
	return &govMockBankKeeper{
		moduleBalances:  make(map[string]sdk.Coins),
		accountBalances: make(map[string]sdk.Coins),
	}
}

func (m *govMockBankKeeper) fundAccount(addr sdk.AccAddress, coins sdk.Coins) {
	key := addr.String()
	m.accountBalances[key] = m.accountBalances[key].Add(coins...)
}

func (m *govMockBankKeeper) SendCoins(_ context.Context, from, to sdk.AccAddress, amt sdk.Coins) error {
	key := from.String()
	bal := m.accountBalances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.accountBalances[key] = newBal
	m.accountBalances[to.String()] = m.accountBalances[to.String()].Add(amt...)
	return nil
}

func (m *govMockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, sender sdk.AccAddress, mod string, amt sdk.Coins) error {
	key := sender.String()
	bal := m.accountBalances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.accountBalances[key] = newBal
	m.moduleBalances[mod] = m.moduleBalances[mod].Add(amt...)
	return nil
}

func (m *govMockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, mod string, recipient sdk.AccAddress, amt sdk.Coins) error {
	modBal := m.moduleBalances[mod]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds in module %s", mod)
	}
	m.moduleBalances[mod] = newBal
	m.accountBalances[recipient.String()] = m.accountBalances[recipient.String()].Add(amt...)
	return nil
}

func (m *govMockBankKeeper) BurnCoins(_ context.Context, moduleName string, amt sdk.Coins) error {
	modBal := m.moduleBalances[moduleName]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds to burn")
	}
	m.moduleBalances[moduleName] = newBal
	m.burnedCoins = m.burnedCoins.Add(amt...)
	return nil
}

// ---------------------------------------------------------------------------
// Mock Staking Keeper (governance)
// ---------------------------------------------------------------------------

type govMockStakingKeeper struct {
	bonded map[string]math.Int
}

func newGovMockStaking() *govMockStakingKeeper {
	return &govMockStakingKeeper{bonded: make(map[string]math.Int)}
}

func (m *govMockStakingKeeper) setBonded(addr sdk.AccAddress, amount math.Int) {
	m.bonded[addr.String()] = amount
}

func (m *govMockStakingKeeper) GetDelegatorBonded(_ context.Context, delegator sdk.AccAddress) (math.Int, error) {
	if amt, ok := m.bonded[delegator.String()]; ok {
		return amt, nil
	}
	return math.ZeroInt(), nil
}

// ---------------------------------------------------------------------------
// Mock Module Param Executor (governance)
// ---------------------------------------------------------------------------

// govMockParamExecutor records param updates for test verification.
type govMockParamExecutor struct {
	appliedParams map[string]string // paramKey -> newValue
}

func newGovMockParamExecutor() *govMockParamExecutor {
	return &govMockParamExecutor{appliedParams: make(map[string]string)}
}

func (m *govMockParamExecutor) UpdateParam(_ context.Context, paramKey string, newValue string) error {
	m.appliedParams[paramKey] = newValue
	return nil
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

type governanceFixture struct {
	ctx           context.Context
	keeper        keeper.Keeper
	addressCodec  address.Codec
	bankKeeper    *govMockBankKeeper
	stakingKeeper *govMockStakingKeeper
	paramExecutor *govMockParamExecutor
}

func initGovernanceFixture(t *testing.T) *governanceFixture {
	t.Helper()

	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bk := newGovMockBank()
	sk := newGovMockStaking()

	k := keeper.NewKeeper(storeService, nil, addrCodec, authority, bk)
	k.SetStakingKeeper(sk)

	// Register mock param executors for all allowed modules.
	pe := newGovMockParamExecutor()
	for moduleName := range types.AllowedModules {
		k.RegisterModuleParamExecutor(moduleName, pe)
	}

	return &governanceFixture{
		ctx:           ctx,
		keeper:        k,
		addressCodec:  addrCodec,
		bankKeeper:    bk,
		stakingKeeper: sk,
		paramExecutor: pe,
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func govProposer(t *testing.T, f *governanceFixture) (sdk.AccAddress, string) {
	t.Helper()
	addr := sdk.AccAddress([]byte("gov_proposer________"))
	f.bankKeeper.fundAccount(addr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	addrStr, _ := f.addressCodec.BytesToString(addr)
	return addr, addrStr
}

func govVoter(t *testing.T, f *governanceFixture, seed string, stake int64) (sdk.AccAddress, string) {
	t.Helper()
	padded := seed + "________________"
	addr := sdk.AccAddress([]byte(padded[:20]))
	f.stakingKeeper.setBonded(addr, math.NewInt(stake))
	addrStr, _ := f.addressCodec.BytesToString(addr)
	return addr, addrStr
}

func submitTestProposal(t *testing.T, f *governanceFixture, proposerStr string) uint64 {
	t.Helper()
	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"Test Proposal",
		"Change max_heartbeat_gap_blocks for better stability",
		"agent",
		"max_heartbeat_gap_blocks",
		"200",
		proposerStr,
		deposit,
	)
	require.NoError(t, err)
	return id
}

// ---------------------------------------------------------------------------
// E2E: Governance Workflow Tests
// ---------------------------------------------------------------------------

// TestGovernanceWorkflow_SubmitAndVoteProposal tests submitting a proposal,
// voting yes, and verifying it passes.
func TestGovernanceWorkflow_SubmitAndVoteProposal(t *testing.T) {
	f := initGovernanceFixture(t)

	_, proposerStr := govProposer(t, f)
	_, voter1Str := govVoter(t, f, "voter1", 20_000)
	_, voter2Str := govVoter(t, f, "voter2", 30_000)

	// Step 1: Submit proposal.
	proposalID := submitTestProposal(t, f, proposerStr)
	t.Logf("Step 1: Proposal submitted — ID=%d", proposalID)

	// Step 2: Vote yes.
	err := f.keeper.CastVote(f.ctx, proposalID, voter1Str, "yes")
	require.NoError(t, err)
	err = f.keeper.CastVote(f.ctx, proposalID, voter2Str, "yes")
	require.NoError(t, err)
	t.Log("Step 2: Both voters voted yes")

	// Step 3: Tally — should pass.
	passed, err := f.keeper.TallyProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.True(t, passed, "proposal with all-yes votes should pass")
	t.Log("Step 3: Proposal passed tally")

	// Step 4: Verify votes recorded.
	votes, err := f.keeper.GetVotes(f.ctx, proposalID)
	require.NoError(t, err)
	require.Len(t, votes, 2)
}

// TestGovernanceWorkflow_ProposalRejected tests that a proposal with
// majority no votes is rejected.
func TestGovernanceWorkflow_ProposalRejected(t *testing.T) {
	f := initGovernanceFixture(t)

	_, proposerStr := govProposer(t, f)
	_, voter1Str := govVoter(t, f, "voter_no1", 10_000)
	_, voter2Str := govVoter(t, f, "voter_no2", 50_000)

	proposalID := submitTestProposal(t, f, proposerStr)

	// Vote: 10k yes, 50k no.
	err := f.keeper.CastVote(f.ctx, proposalID, voter1Str, "yes")
	require.NoError(t, err)
	err = f.keeper.CastVote(f.ctx, proposalID, voter2Str, "no")
	require.NoError(t, err)

	// Tally — should fail.
	passed, err := f.keeper.TallyProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.False(t, passed, "proposal with majority-no votes should fail")
	t.Log("Proposal correctly rejected by majority no votes")
}

// TestGovernanceWorkflow_DepositHandling verifies that deposits are
// deducted on submission and refunded on execution.
func TestGovernanceWorkflow_DepositHandling(t *testing.T) {
	f := initGovernanceFixture(t)

	proposerAddr, proposerStr := govProposer(t, f)
	_, voterStr := govVoter(t, f, "dep_voter", 50_000)

	balBefore := f.bankKeeper.accountBalances[proposerAddr.String()].AmountOf("uclaw")
	proposalID := submitTestProposal(t, f, proposerStr)

	// Step 1: Verify deposit taken.
	balAfterSubmit := f.bankKeeper.accountBalances[proposerAddr.String()].AmountOf("uclaw")
	require.True(t, balAfterSubmit.LT(balBefore),
		"proposer balance should decrease after deposit")
	t.Log("Step 1: Deposit deducted from proposer")

	// Vote and pass.
	err := f.keeper.CastVote(f.ctx, proposalID, voterStr, "yes")
	require.NoError(t, err)

	// Step 2: Execute proposal — deposit should be refunded.
	err = f.keeper.ExecuteProposal(f.ctx, proposalID)
	require.NoError(t, err)

	balAfterExec := f.bankKeeper.accountBalances[proposerAddr.String()].AmountOf("uclaw")
	require.True(t, balAfterExec.GT(balAfterSubmit),
		"proposer balance should increase after execution (deposit refund)")
	t.Log("Step 2: Deposit refunded after proposal execution")

	// Verify proposal status.
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusExecuted, proposal.Status)

	// Step 3: Verify param change was actually applied.
	appliedValue, ok := f.paramExecutor.appliedParams["max_heartbeat_gap_blocks"]
	require.True(t, ok, "param change should have been applied")
	require.Equal(t, "200", appliedValue)
	t.Log("Step 3: Parameter change applied to target module")
}

// TestGovernanceWorkflow_DoubleVoteRejected verifies that a voter
// cannot vote twice on the same proposal.
func TestGovernanceWorkflow_DoubleVoteRejected(t *testing.T) {
	f := initGovernanceFixture(t)

	_, proposerStr := govProposer(t, f)
	_, voterStr := govVoter(t, f, "dbl_voter", 10_000)

	proposalID := submitTestProposal(t, f, proposerStr)

	// First vote succeeds.
	err := f.keeper.CastVote(f.ctx, proposalID, voterStr, "yes")
	require.NoError(t, err)

	// Second vote fails.
	err = f.keeper.CastVote(f.ctx, proposalID, voterStr, "no")
	require.Error(t, err)
	t.Log("Double vote correctly rejected")
}

// TestGovernanceWorkflow_InvalidModuleRejected verifies that proposals
// targeting an invalid module are rejected.
func TestGovernanceWorkflow_InvalidModuleRejected(t *testing.T) {
	f := initGovernanceFixture(t)

	_, proposerStr := govProposer(t, f)
	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))

	_, err := f.keeper.SubmitProposal(f.ctx,
		"Bad Module Proposal",
		"This targets a fake module",
		"nonexistent_module",
		"some_param",
		"100",
		proposerStr,
		deposit,
	)
	require.Error(t, err)
	t.Log("Invalid module correctly rejected")
}

// TestGovernanceWorkflow_ProposalExpiry tests that proposals are
// automatically rejected when the voting period expires without passing.
func TestGovernanceWorkflow_ProposalExpiry(t *testing.T) {
	f := initGovernanceFixture(t)

	_, proposerStr := govProposer(t, f)
	_, voterStr := govVoter(t, f, "exp_voter", 50_000)

	proposalID := submitTestProposal(t, f, proposerStr)

	// Vote no so it doesn't pass.
	err := f.keeper.CastVote(f.ctx, proposalID, voterStr, "no")
	require.NoError(t, err)

	// Advance block height past voting period.
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(proposal.VotingEndBlock + 1)

	// Run EndBlocker to auto-process expired proposals.
	err = f.keeper.EndBlocker(f.ctx)
	require.NoError(t, err)
	t.Log("Step 1: EndBlocker processed after voting period")

	// Verify proposal was rejected.
	proposal, err = f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, types.ProposalStatusRejected, proposal.Status)
	t.Log("Step 2: Proposal auto-rejected after voting period expired")
}
