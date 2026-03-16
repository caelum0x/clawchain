package keeper_test

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

// mockBankKeeper for governance tests.
type mockBankKeeper struct {
	moduleBalances  map[string]sdk.Coins
	accountBalances map[string]sdk.Coins
	BurnedCoins     sdk.Coins
}

func newMockBankKeeper() *mockBankKeeper {
	return &mockBankKeeper{
		moduleBalances:  make(map[string]sdk.Coins),
		accountBalances: make(map[string]sdk.Coins),
	}
}

func (m *mockBankKeeper) fundAccount(addr sdk.AccAddress, coins sdk.Coins) {
	key := addr.String()
	m.accountBalances[key] = m.accountBalances[key].Add(coins...)
}

func (m *mockBankKeeper) SendCoins(_ context.Context, fromAddr, toAddr sdk.AccAddress, amt sdk.Coins) error {
	key := fromAddr.String()
	bal := m.accountBalances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.accountBalances[key] = newBal
	m.accountBalances[toAddr.String()] = m.accountBalances[toAddr.String()].Add(amt...)
	return nil
}

func (m *mockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error {
	key := senderAddr.String()
	bal := m.accountBalances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.accountBalances[key] = newBal
	m.moduleBalances[recipientModule] = m.moduleBalances[recipientModule].Add(amt...)
	return nil
}

func (m *mockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error {
	modBal := m.moduleBalances[senderModule]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds in module %s", senderModule)
	}
	m.moduleBalances[senderModule] = newBal
	m.accountBalances[recipientAddr.String()] = m.accountBalances[recipientAddr.String()].Add(amt...)
	return nil
}

func (m *mockBankKeeper) BurnCoins(_ context.Context, moduleName string, amt sdk.Coins) error {
	modBal := m.moduleBalances[moduleName]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.moduleBalances[moduleName] = newBal
	m.BurnedCoins = m.BurnedCoins.Add(amt...)
	return nil
}

// mockStakingKeeper for stake-weighted voting tests.
type mockStakingKeeper struct {
	bonded map[string]math.Int
}

func newMockStakingKeeper() *mockStakingKeeper {
	return &mockStakingKeeper{bonded: make(map[string]math.Int)}
}

func (m *mockStakingKeeper) setBonded(addr sdk.AccAddress, amount math.Int) {
	m.bonded[addr.String()] = amount
}

func (m *mockStakingKeeper) GetDelegatorBonded(_ context.Context, delegator sdk.AccAddress) (math.Int, error) {
	if amt, ok := m.bonded[delegator.String()]; ok {
		return amt, nil
	}
	return math.ZeroInt(), nil
}

type fixture struct {
	ctx           context.Context
	keeper        keeper.Keeper
	addressCodec  address.Codec
	bankKeeper    *mockBankKeeper
	stakingKeeper *mockStakingKeeper
}

func initFixture(t *testing.T) *fixture {
	t.Helper()

	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bk := newMockBankKeeper()
	sk := newMockStakingKeeper()

	k := keeper.NewKeeper(storeService, nil, addressCodec, authority, bk)
	k.SetStakingKeeper(sk)

	return &fixture{
		ctx:           ctx,
		keeper:        k,
		addressCodec:  addressCodec,
		bankKeeper:    bk,
		stakingKeeper: sk,
	}
}

func TestSubmitProposal(t *testing.T) {
	f := initFixture(t)
	proposer := sdk.AccAddress([]byte("proposer1___________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))

	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	proposalID, err := f.keeper.SubmitProposal(f.ctx,
		"Test Proposal",
		"Change max_heartbeat_gap_blocks to 200",
		"agent",
		"max_heartbeat_gap_blocks",
		"200",
		proposerStr,
		deposit,
	)
	require.NoError(t, err)
	require.Equal(t, uint64(0), proposalID)

	// Verify the proposal exists.
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, "Test Proposal", proposal.Title)
	require.Equal(t, types.ProposalStatusVoting, proposal.Status)
	require.Equal(t, "agent", proposal.Module)
	require.Equal(t, "max_heartbeat_gap_blocks", proposal.ParamKey)
}

func TestCastVote(t *testing.T) {
	f := initFixture(t)
	proposer := sdk.AccAddress([]byte("proposer2___________"))
	voter := sdk.AccAddress([]byte("voter1______________"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	proposalID, err := f.keeper.SubmitProposal(f.ctx,
		"Vote Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Cast a vote.
	err = f.keeper.CastVote(f.ctx, proposalID, voterStr, "yes")
	require.NoError(t, err)

	// Verify vote was recorded.
	votes, err := f.keeper.GetVotes(f.ctx, proposalID)
	require.NoError(t, err)
	require.Len(t, votes, 1)
	require.Equal(t, "yes", votes[0].Option)

	// Verify double vote is rejected.
	err = f.keeper.CastVote(f.ctx, proposalID, voterStr, "no")
	require.Error(t, err)
}

func TestInvalidVoteOption(t *testing.T) {
	f := initFixture(t)
	proposer := sdk.AccAddress([]byte("proposer3___________"))
	voter := sdk.AccAddress([]byte("voter2______________"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	proposalID, _ := f.keeper.SubmitProposal(f.ctx,
		"Invalid Vote Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)

	err := f.keeper.CastVote(f.ctx, proposalID, voterStr, "invalid")
	require.Error(t, err)
}

func TestInvalidModule(t *testing.T) {
	f := initFixture(t)
	proposer := sdk.AccAddress([]byte("proposer4___________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	_, err := f.keeper.SubmitProposal(f.ctx,
		"Bad Module", "desc", "nonexistent_module", "some_param", "100",
		proposerStr, deposit,
	)
	require.Error(t, err)
}

func TestStakeWeightedVoting(t *testing.T) {
	f := initFixture(t)
	proposer := sdk.AccAddress([]byte("proposer5___________"))
	voter1 := sdk.AccAddress([]byte("voter3______________"))
	voter2 := sdk.AccAddress([]byte("voter4______________"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	// Set stake amounts
	f.stakingKeeper.setBonded(voter1, math.NewInt(1000))
	f.stakingKeeper.setBonded(voter2, math.NewInt(5000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)

	proposalID, err := f.keeper.SubmitProposal(f.ctx,
		"Stake Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Vote with different stake weights
	err = f.keeper.CastVote(f.ctx, proposalID, voter1Str, "yes")
	require.NoError(t, err)

	err = f.keeper.CastVote(f.ctx, proposalID, voter2Str, "no")
	require.NoError(t, err)

	// Check tally reflects stake weights
	proposal, err := f.keeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)

	// voter1 has 1000 stake -> yes gets 1000
	// voter2 has 5000 stake -> no gets 5000
	require.True(t, proposal.YesVotes.GT(math.ZeroInt()), "yes votes should be > 0")
	require.True(t, proposal.NoVotes.GT(proposal.YesVotes), "no votes should be > yes votes (5000 > 1000)")
}
