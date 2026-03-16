package keeper_test

import (
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/governance/types"
)

func TestCastVetoVote(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_veto_______"))
	voter := sdk.AccAddress([]byte("voter_veto__________"))
	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter, math.NewInt(5000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voterStr, _ := f.addressCodec.BytesToString(voter)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Veto Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// Cast a no_with_veto vote.
	err = f.keeper.CastVote(f.ctx, id, voterStr, types.VoteOptionNoWithVeto)
	require.NoError(t, err)

	// Verify VetoVotes was incremented.
	proposal, err := f.keeper.GetProposal(f.ctx, id)
	require.NoError(t, err)
	require.True(t, proposal.VetoVotes.Equal(math.NewInt(5000)),
		"veto votes should be 5000, got %s", proposal.VetoVotes)

	// Verify other tally fields are zero.
	require.True(t, proposal.YesVotes.IsZero(), "yes votes should be 0")
	require.True(t, proposal.NoVotes.IsZero(), "no votes should be 0")
	require.True(t, proposal.AbstainVotes.IsZero(), "abstain votes should be 0")
}

func TestTallyWithVetoBlocks(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_vetotally__"))
	voter1 := sdk.AccAddress([]byte("voter_vetotally_1___"))
	voter2 := sdk.AccAddress([]byte("voter_vetotally_2___"))
	voter3 := sdk.AccAddress([]byte("voter_vetotally_3___"))
	voter4 := sdk.AccAddress([]byte("voter_vetotally_4___"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter1, math.NewInt(10_000))
	f.stakingKeeper.setBonded(voter2, math.NewInt(10_000))
	f.stakingKeeper.setBonded(voter3, math.NewInt(10_000))
	f.stakingKeeper.setBonded(voter4, math.NewInt(10_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)
	voter3Str, _ := f.addressCodec.BytesToString(voter3)
	voter4Str, _ := f.addressCodec.BytesToString(voter4)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Veto Tally Test", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// 2 yes votes + 2 no_with_veto votes.
	// Total = 40000, Veto = 20000 (50% > 33.4%) => vetoed.
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter1Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter2Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter3Str, types.VoteOptionNoWithVeto))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter4Str, types.VoteOptionNoWithVeto))

	// Tally: even though yes votes (20k) would pass the 50% threshold of yes+no,
	// the veto votes (20k out of 40k total = 50%) exceed the 33.4% veto threshold.
	passed, err := f.keeper.TallyProposal(f.ctx, id)
	require.NoError(t, err)
	require.False(t, passed, "proposal should be vetoed when veto votes exceed 33.4%% of total")
}

func TestTallyWithVetoBelowThreshold(t *testing.T) {
	f := initFixture(t)

	proposer := sdk.AccAddress([]byte("proposer_vetolo_____"))
	voter1 := sdk.AccAddress([]byte("voter_vetolo_1______"))
	voter2 := sdk.AccAddress([]byte("voter_vetolo_2______"))
	voter3 := sdk.AccAddress([]byte("voter_vetolo_3______"))
	voter4 := sdk.AccAddress([]byte("voter_vetolo_4______"))

	f.bankKeeper.fundAccount(proposer, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	f.stakingKeeper.setBonded(voter1, math.NewInt(30_000))
	f.stakingKeeper.setBonded(voter2, math.NewInt(30_000))
	f.stakingKeeper.setBonded(voter3, math.NewInt(30_000))
	f.stakingKeeper.setBonded(voter4, math.NewInt(10_000))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposerStr, _ := f.addressCodec.BytesToString(proposer)
	voter1Str, _ := f.addressCodec.BytesToString(voter1)
	voter2Str, _ := f.addressCodec.BytesToString(voter2)
	voter3Str, _ := f.addressCodec.BytesToString(voter3)
	voter4Str, _ := f.addressCodec.BytesToString(voter4)

	id, err := f.keeper.SubmitProposal(f.ctx,
		"Veto Below Threshold", "desc", "agent", "max_heartbeat_gap_blocks", "100",
		proposerStr, deposit,
	)
	require.NoError(t, err)

	// 3 yes + 1 veto: total = 100k, veto = 10k (10% < 33.4%) => not vetoed, should pass.
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter1Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter2Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter3Str, types.VoteOptionYes))
	require.NoError(t, f.keeper.CastVote(f.ctx, id, voter4Str, types.VoteOptionNoWithVeto))

	passed, err := f.keeper.TallyProposal(f.ctx, id)
	require.NoError(t, err)
	require.True(t, passed, "proposal should pass when veto is below threshold")
}

func TestValidateVoteOptionNoWithVeto(t *testing.T) {
	err := types.ValidateVoteOption("no_with_veto")
	require.NoError(t, err, "no_with_veto should be a valid vote option")

	err = types.ValidateVoteOption("veto")
	require.Error(t, err, "veto (without no_with_) should be invalid")
}
