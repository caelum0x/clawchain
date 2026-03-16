package keeper_test

import (
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/governance/types"
)

func TestQueryTallyResult(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_qtally_____"))
	voter1 := sdk.AccAddress([]byte("voter_qtally_1______"))
	voter2 := sdk.AccAddress([]byte("voter_qtally_2______"))
	voter3 := sdk.AccAddress([]byte("voter_qtally_3______"))
	voter4 := sdk.AccAddress([]byte("voter_qtally_4______"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter1, math.NewInt(30_000))
	f.stakingKeeper.setBonded(voter2, math.NewInt(20_000))
	f.stakingKeeper.setBonded(voter3, math.NewInt(10_000))
	f.stakingKeeper.setBonded(voter4, math.NewInt(40_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)
	voter3Str, _ := f.addressCodec.BytesToString(voter3)
	voter4Str, _ := f.addressCodec.BytesToString(voter4)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Tally Query Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter1Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter2Str, types.VoteOptionNo))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter3Str, types.VoteOptionAbstain))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter4Str, types.VoteOptionNoWithVeto))

	result, err := f.keeper.QueryTallyResult(f.ctx, id)
	require.NoError(t, err)

	require.True(t, result.YesVotes.Equal(math.NewInt(30_000)))
	require.True(t, result.NoVotes.Equal(math.NewInt(20_000)))
	require.True(t, result.AbstainVotes.Equal(math.NewInt(10_000)))
	require.True(t, result.VetoVotes.Equal(math.NewInt(40_000)))
	require.True(t, result.TotalVotes.Equal(math.NewInt(100_000)))

	// Yes: 30k/100k = 3000 bps
	require.Equal(t, int64(3000), result.YesPercentBps)
	// No: 20k/100k = 2000 bps
	require.Equal(t, int64(2000), result.NoPercentBps)
	// Abstain: 10k/100k = 1000 bps
	require.Equal(t, int64(1000), result.AbstainPercentBps)
	// Veto: 40k/100k = 4000 bps
	require.Equal(t, int64(4000), result.VetoPercentBps)

	// 40k veto out of 100k total = 40% > 33.4% => vetoed
	require.True(t, result.Vetoed, "proposal should be vetoed")
	require.False(t, result.Passed, "vetoed proposal should not pass")
}

func TestQueryTallyResult_NoVotes(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_qtnov______"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	id, err := f.keeper.SubmitProposal(f.ctx,
		"No Votes Tally Query", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	result, err := f.keeper.QueryTallyResult(f.ctx, id)
	require.NoError(t, err)

	require.True(t, result.TotalVotes.IsZero())
	require.False(t, result.Passed)
	require.False(t, result.Vetoed)
	require.Equal(t, int64(0), result.YesPercentBps)
}

func TestQueryVoterVotes(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_qvoter_____"))
	voter := sdk.AccAddress([]byte("voter_qvoter________"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter, math.NewInt(10_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	// Submit two proposals and vote on both.
	id1, err := f.keeper.SubmitProposal(f.ctx,
		"Voter Query Test 1", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	id2, err := f.keeper.SubmitProposal(f.ctx,
		"Voter Query Test 2", "desc", "agent", "max_heartbeat_gap_blocks", "200",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	require.NoError(t, f.keeper.CastVote(f.ctx, id1, voterStr, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, id2, voterStr, types.VoteOptionNo))

	// Query voter's votes.
	votes, err := f.keeper.QueryVoterVotes(f.ctx, voterStr)
	require.NoError(t, err)
	require.Len(t, votes, 2, "voter should have 2 votes across 2 proposals")

	// Verify votes are for the correct proposals.
	voteMap := make(map[uint64]string)
	for _, v := range votes {
		voteMap[v.ProposalId] = v.Option
	}
	require.Equal(t, types.VoteOptionYes, voteMap[id1])
	require.Equal(t, types.VoteOptionNo, voteMap[id2])
}

func TestQueryVoterVotes_NoVotes(t *testing.T) {
	f := initFixture(t)

	voter := sdk.AccAddress([]byte("voter_qv_novote_____"))
	voterStr, _ := f.addressCodec.BytesToString(voter)

	votes, err := f.keeper.QueryVoterVotes(f.ctx, voterStr)
	require.NoError(t, err)
	require.Len(t, votes, 0, "voter with no votes should return empty")
}
