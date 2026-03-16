package keeper_test

import (
	"testing"

	"cosmossdk.io/math"
	"github.com/stretchr/testify/require"

	"clawchain/x/governance/types"
)

func TestGenesisInitAndExport_WithProposalAndVote(t *testing.T) {
	f := initFixture(t)

	gen := types.GenesisState{
		Proposals: []types.Proposal{
			{
				ProposalId:     7,
				Title:          "Tune Messaging Limit",
				Description:    "Raise max message size",
				Module:         "messaging",
				ParamKey:       "max_message_size",
				ProposedValue:  "8192",
				Proposer:       "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu",
				Deposit:        "10000000uclaw",
				Status:         types.ProposalStatusVoting,
				VotingEndBlock: 100,
				YesVotes:       math.ZeroInt(),
				NoVotes:        math.ZeroInt(),
				AbstainVotes:   math.ZeroInt(),
				CreatedAt:      1,
			},
		},
		Votes: []types.Vote{
			{
				ProposalId: 7,
				Voter:      "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4",
				Option:     types.VoteOptionYes,
				Weight:     math.LegacyMustNewDecFromStr("1.0"),
			},
		},
		ProposalCount: 8,
	}

	require.NoError(t, f.keeper.InitGenesis(f.ctx, gen))

	exported, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, exported)
	require.Len(t, exported.Proposals, 1)
	require.Len(t, exported.Votes, 1)
	require.EqualValues(t, 7, exported.Proposals[0].ProposalId)
	require.Equal(t, types.VoteOptionYes, exported.Votes[0].Option)
}
