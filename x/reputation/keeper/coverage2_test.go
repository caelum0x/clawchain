package keeper_test

import (
	"testing"

	"clawchain/x/reputation/keeper"
	"clawchain/x/reputation/types"

	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// UpdateParam — cover decay_rate_bps and decay_interval_blocks
// ---------------------------------------------------------------------------

func TestUpdateParam_DecayRateBps(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "decay_rate_bps", "50")
	require.NoError(t, err)
	params, _ := f.keeper.Params.Get(f.ctx)
	require.EqualValues(t, 50, params.DecayRateBps)
}

func TestUpdateParam_DecayRateBps_Invalid(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "decay_rate_bps", "not-a-number")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

func TestUpdateParam_DecayIntervalBlocks(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "decay_interval_blocks", "1000")
	require.NoError(t, err)
	params, _ := f.keeper.Params.Get(f.ctx)
	require.EqualValues(t, 1000, params.DecayIntervalBlocks)
}

func TestUpdateParam_DecayIntervalBlocks_Invalid(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.UpdateParam(f.ctx, "decay_interval_blocks", "abc")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

// ---------------------------------------------------------------------------
// UpdateParams — invalid params body
// ---------------------------------------------------------------------------

func TestUpdateParams_InvalidAddress(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	_, err := ms.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: "bad-address",
		Params:    types.DefaultParams(),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid authority")
}

// ---------------------------------------------------------------------------
// Query: Reputation
// ---------------------------------------------------------------------------

func TestQueryReputation_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.Reputation(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryReputation_EmptyAddress(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.Reputation(f.ctx, &types.QueryReputationRequest{AgentAddress: ""})
	require.Error(t, err)
}

func TestQueryReputation_NotFound(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.Reputation(f.ctx, &types.QueryReputationRequest{AgentAddress: validAddress()})
	require.NoError(t, err)
	require.False(t, resp.Found)
}

func TestQueryReputation_Found(t *testing.T) {
	f := initFixture(t)
	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress(), types.ReputationRecord{
		AgentAddress:   validAddress(),
		UptimeScoreBps: 9500,
		TotalRatings:   3,
		RatingSum:      12,
		AvgRatingBps:   400,
	}))
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.Reputation(f.ctx, &types.QueryReputationRequest{AgentAddress: validAddress()})
	require.NoError(t, err)
	require.True(t, resp.Found)
	require.Equal(t, uint64(9500), resp.Reputation.UptimeScoreBps)
}

// ---------------------------------------------------------------------------
// Query: TopAgents
// ---------------------------------------------------------------------------

func TestQueryTopAgents_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.TopAgents(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryTopAgents_Empty(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.TopAgents(f.ctx, &types.QueryTopAgentsRequest{Limit: 10})
	require.NoError(t, err)
	require.Empty(t, resp.Agents)
}

func TestQueryTopAgents_SortedByRating(t *testing.T) {
	f := initFixture(t)
	// Agent1 has higher avg rating
	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress(), types.ReputationRecord{
		AgentAddress: validAddress(),
		AvgRatingBps: 450,
		TotalRatings: 2,
	}))
	// Agent2 has lower avg rating
	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress2(), types.ReputationRecord{
		AgentAddress: validAddress2(),
		AvgRatingBps: 300,
		TotalRatings: 5,
	}))
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.TopAgents(f.ctx, &types.QueryTopAgentsRequest{Limit: 10})
	require.NoError(t, err)
	require.Len(t, resp.Agents, 2)
	require.Equal(t, uint64(450), resp.Agents[0].AvgRatingBps)
}

func TestQueryTopAgents_LimitApplied(t *testing.T) {
	f := initFixture(t)
	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress(), types.ReputationRecord{AgentAddress: validAddress(), AvgRatingBps: 400}))
	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress2(), types.ReputationRecord{AgentAddress: validAddress2(), AvgRatingBps: 300}))
	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress3(), types.ReputationRecord{AgentAddress: validAddress3(), AvgRatingBps: 200}))
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.TopAgents(f.ctx, &types.QueryTopAgentsRequest{Limit: 2})
	require.NoError(t, err)
	require.Len(t, resp.Agents, 2)
}

func TestQueryTopAgents_ZeroLimit(t *testing.T) {
	f := initFixture(t)
	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress(), types.ReputationRecord{AgentAddress: validAddress()}))
	qs := keeper.NewQueryServerImpl(f.keeper)
	// Zero limit should return all
	resp, err := qs.TopAgents(f.ctx, &types.QueryTopAgentsRequest{Limit: 0})
	require.NoError(t, err)
	require.Len(t, resp.Agents, 1)
}

// ---------------------------------------------------------------------------
// Query: Ratings
// ---------------------------------------------------------------------------

func TestQueryRatings_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.Ratings(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryRatings_EmptyAddress(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.Ratings(f.ctx, &types.QueryRatingsRequest{AgentAddress: ""})
	require.Error(t, err)
}

func TestQueryRatings_NoResults(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.Ratings(f.ctx, &types.QueryRatingsRequest{AgentAddress: validAddress()})
	require.NoError(t, err)
	require.Empty(t, resp.Ratings)
}

func TestQueryRatings_FiltersByAgent(t *testing.T) {
	f := initFixture(t)
	// Rating for agent1
	require.NoError(t, f.keeper.Ratings.Set(f.ctx, uint64(0), types.Rating{Id: 0, RatedAgent: validAddress(), Score: 5}))
	// Rating for agent2
	require.NoError(t, f.keeper.Ratings.Set(f.ctx, uint64(1), types.Rating{Id: 1, RatedAgent: validAddress2(), Score: 3}))
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.Ratings(f.ctx, &types.QueryRatingsRequest{AgentAddress: validAddress()})
	require.NoError(t, err)
	require.Len(t, resp.Ratings, 1)
	require.Equal(t, uint32(5), resp.Ratings[0].Score)
}

// ---------------------------------------------------------------------------
// Query: Endorsements
// ---------------------------------------------------------------------------

func TestQueryEndorsements_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.Endorsements(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryEndorsements_EmptyAddress(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.Endorsements(f.ctx, &types.QueryEndorsementsRequest{AgentAddress: ""})
	require.Error(t, err)
}

func TestQueryEndorsements_NoResults(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.Endorsements(f.ctx, &types.QueryEndorsementsRequest{AgentAddress: validAddress()})
	require.NoError(t, err)
	require.Empty(t, resp.Endorsements)
}

func TestQueryEndorsements_FiltersByAgent(t *testing.T) {
	f := initFixture(t)
	require.NoError(t, f.keeper.Endorsements.Set(f.ctx, uint64(0), types.Endorsement{Id: 0, Endorsed: validAddress(), Reason: "good"}))
	require.NoError(t, f.keeper.Endorsements.Set(f.ctx, uint64(1), types.Endorsement{Id: 1, Endorsed: validAddress2(), Reason: "okay"}))
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.Endorsements(f.ctx, &types.QueryEndorsementsRequest{AgentAddress: validAddress()})
	require.NoError(t, err)
	require.Len(t, resp.Endorsements, 1)
	require.Equal(t, "good", resp.Endorsements[0].Reason)
}

// ---------------------------------------------------------------------------
// RateAgent — additional error paths
// ---------------------------------------------------------------------------

func TestRateAgent_CommentTooLong(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	f.marketplaceKeeper.purchased[purchaseKey(validAddress(), validAddress2())] = true

	longComment := make([]byte, 1001)
	for i := range longComment {
		longComment[i] = 'a'
	}

	_, err := ms.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator:      validAddress(),
		AgentAddress: validAddress2(),
		Score:        5,
		Comment:      string(longComment),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "comment exceeds max length")
}

func TestRateAgent_InvalidScore(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	_, err := ms.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator:      validAddress(),
		AgentAddress: validAddress2(),
		Score:        0,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "score must be between 1 and 5")
}

func TestRateAgent_ScoreTooHigh(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	_, err := ms.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator:      validAddress(),
		AgentAddress: validAddress2(),
		Score:        6,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "score must be between 1 and 5")
}

// ---------------------------------------------------------------------------
// EndorseAgent — additional error paths
// ---------------------------------------------------------------------------

func TestEndorseAgent_NotRegistered(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	// Creator is NOT registered as agent
	_, err := ms.EndorseAgent(f.ctx, &types.MsgEndorseAgent{
		Creator:      validAddress(),
		AgentAddress: validAddress2(),
		Reason:       "test",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "endorser must be a registered agent")
}

func TestEndorseAgent_SelfEndorsement(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	_, err := ms.EndorseAgent(f.ctx, &types.MsgEndorseAgent{
		Creator:      validAddress(),
		AgentAddress: validAddress(),
		Reason:       "test",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "self-endorsement")
}

// ---------------------------------------------------------------------------
// Genesis export
// ---------------------------------------------------------------------------

func TestGenesisExportWithData(t *testing.T) {
	f := initFixture(t)
	// Store some data
	require.NoError(t, f.keeper.Reputations.Set(f.ctx, validAddress(), types.ReputationRecord{
		AgentAddress:   validAddress(),
		UptimeScoreBps: 8000,
	}))
	require.NoError(t, f.keeper.Ratings.Set(f.ctx, uint64(0), types.Rating{
		Id:         0,
		RatedAgent: validAddress(),
		Score:      4,
	}))
	require.NoError(t, f.keeper.Endorsements.Set(f.ctx, uint64(0), types.Endorsement{
		Id:       0,
		Endorsed: validAddress(),
		Reason:   "test",
	}))

	genesis, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, genesis)
}
