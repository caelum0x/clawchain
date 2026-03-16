package keeper_test

import (
	"testing"

	"clawchain/x/reputation/keeper"
	"clawchain/x/reputation/types"
	"github.com/stretchr/testify/require"
)

func validAddress() string {
	return "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
}

func validAddress2() string {
	return "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"
}

func validAddress3() string {
	return "cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh"
}

func TestRateAgentSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	buyer := validAddress()
	seller := validAddress2()
	f.marketplaceKeeper.purchased[purchaseKey(buyer, seller)] = true

	resp, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator:      buyer,
		AgentAddress: seller,
		SkillId:      1,
		Score:        5,
		Comment:      "excellent",
	})
	require.NoError(t, err)
	require.Equal(t, uint64(0), resp.RatingId)

	rating, err := f.keeper.Ratings.Get(f.ctx, resp.RatingId)
	require.NoError(t, err)
	require.Equal(t, buyer, rating.Rater)
	require.Equal(t, seller, rating.RatedAgent)
	require.Equal(t, uint32(5), rating.Score)

	rep, err := f.keeper.Reputations.Get(f.ctx, seller)
	require.NoError(t, err)
	require.Equal(t, uint64(1), rep.TotalRatings)
	require.Equal(t, uint64(5), rep.RatingSum)
	require.Equal(t, uint64(500), rep.AvgRatingBps)
}

func TestRateAgentSelfRatingRejected(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	addr := validAddress()
	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator:      addr,
		AgentAddress: addr,
		SkillId:      1,
		Score:        5,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "self-rating")
}

func TestRateAgentInvalidScoreRejected(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	buyer := validAddress()
	seller := validAddress2()
	f.marketplaceKeeper.purchased[purchaseKey(buyer, seller)] = true

	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator:      buyer,
		AgentAddress: seller,
		SkillId:      1,
		Score:        0,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "score")
}

func TestRateAgentRequiresPurchase(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator:      validAddress(),
		AgentAddress: validAddress2(),
		SkillId:      1,
		Score:        4,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "prior purchase")
}

func TestRateAgentCommentTooLong(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	buyer := validAddress()
	seller := validAddress2()
	f.marketplaceKeeper.purchased[purchaseKey(buyer, seller)] = true

	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator:      buyer,
		AgentAddress: seller,
		SkillId:      1,
		Score:        4,
		Comment:      string(make([]byte, 281)),
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "comment")
}

func TestRateAgentAveragesAcrossMultipleRatings(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress2()
	buyers := []string{validAddress(), validAddress3()}
	for _, b := range buyers {
		f.marketplaceKeeper.purchased[purchaseKey(b, seller)] = true
	}

	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{Creator: buyers[0], AgentAddress: seller, SkillId: 1, Score: 5})
	require.NoError(t, err)
	_, err = msgServer.RateAgent(f.ctx, &types.MsgRateAgent{Creator: buyers[1], AgentAddress: seller, SkillId: 1, Score: 3})
	require.NoError(t, err)

	rep, err := f.keeper.Reputations.Get(f.ctx, seller)
	require.NoError(t, err)
	require.Equal(t, uint64(2), rep.TotalRatings)
	require.Equal(t, uint64(8), rep.RatingSum)
	require.Equal(t, uint64(400), rep.AvgRatingBps)
}

func TestEndorseAgentSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	endorser := validAddress()
	endorsed := validAddress2()
	f.agentKeeper.registered[endorser] = true

	resp, err := msgServer.EndorseAgent(f.ctx, &types.MsgEndorseAgent{
		Creator:      endorser,
		AgentAddress: endorsed,
		Reason:       "reliable operator",
	})
	require.NoError(t, err)
	require.Equal(t, uint64(0), resp.EndorsementId)

	e, err := f.keeper.Endorsements.Get(f.ctx, resp.EndorsementId)
	require.NoError(t, err)
	require.Equal(t, endorser, e.Endorser)
	require.Equal(t, endorsed, e.Endorsed)

	rep, err := f.keeper.Reputations.Get(f.ctx, endorsed)
	require.NoError(t, err)
	require.Equal(t, uint64(1), rep.Endorsements)
}

func TestEndorseAgentSelfRejected(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	addr := validAddress()
	f.agentKeeper.registered[addr] = true
	_, err := msgServer.EndorseAgent(f.ctx, &types.MsgEndorseAgent{Creator: addr, AgentAddress: addr})
	require.Error(t, err)
	require.ErrorContains(t, err, "self-endorsement")
}

func TestEndorseAgentRequiresRegisteredEndorser(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.EndorseAgent(f.ctx, &types.MsgEndorseAgent{
		Creator:      validAddress(),
		AgentAddress: validAddress2(),
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "registered agent")
}

func TestQueryReputationFoundAndNotFound(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	buyer := validAddress()
	seller := validAddress2()
	f.marketplaceKeeper.purchased[purchaseKey(buyer, seller)] = true
	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{Creator: buyer, AgentAddress: seller, Score: 5})
	require.NoError(t, err)

	found, err := queryServer.Reputation(f.ctx, &types.QueryReputationRequest{AgentAddress: seller})
	require.NoError(t, err)
	require.True(t, found.Found)
	require.Equal(t, seller, found.Reputation.AgentAddress)

	notFound, err := queryServer.Reputation(f.ctx, &types.QueryReputationRequest{AgentAddress: validAddress3()})
	require.NoError(t, err)
	require.False(t, notFound.Found)
}

func TestQueryRatingsFiltersByAgent(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	a1 := validAddress2()
	a2 := validAddress3()
	b1 := validAddress()
	b2 := "cosmos1s4f8xj2w2jq6wuh4u3h8kqztrdr8n5q89jz2xv"
	f.marketplaceKeeper.purchased[purchaseKey(b1, a1)] = true
	f.marketplaceKeeper.purchased[purchaseKey(b2, a2)] = true

	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{Creator: b1, AgentAddress: a1, Score: 5})
	require.NoError(t, err)
	_, err = msgServer.RateAgent(f.ctx, &types.MsgRateAgent{Creator: b2, AgentAddress: a2, Score: 4})
	require.NoError(t, err)

	resp, err := queryServer.Ratings(f.ctx, &types.QueryRatingsRequest{AgentAddress: a1})
	require.NoError(t, err)
	require.Len(t, resp.Ratings, 1)
	require.Equal(t, a1, resp.Ratings[0].RatedAgent)
}

func TestQueryEndorsementsFiltersByAgent(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	endorser1 := validAddress()
	endorser2 := validAddress3()
	target := validAddress2()
	other := "cosmos17xpfvakm2amg962yls6f84z3kell8c5lserqta"
	f.agentKeeper.registered[endorser1] = true
	f.agentKeeper.registered[endorser2] = true

	_, err := msgServer.EndorseAgent(f.ctx, &types.MsgEndorseAgent{Creator: endorser1, AgentAddress: target, Reason: "good"})
	require.NoError(t, err)
	_, err = msgServer.EndorseAgent(f.ctx, &types.MsgEndorseAgent{Creator: endorser2, AgentAddress: other, Reason: "ok"})
	require.NoError(t, err)

	resp, err := queryServer.Endorsements(f.ctx, &types.QueryEndorsementsRequest{AgentAddress: target})
	require.NoError(t, err)
	require.Len(t, resp.Endorsements, 1)
	require.Equal(t, target, resp.Endorsements[0].Endorsed)
}

func TestQueryTopAgentsSorted(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	buyer1 := validAddress()
	buyer2 := validAddress3()
	a1 := validAddress2()
	a2 := "cosmos1q4w7s3r9h2lyj67f5zkj3e9d7f4g2z8qk6m8qy"
	f.marketplaceKeeper.purchased[purchaseKey(buyer1, a1)] = true
	f.marketplaceKeeper.purchased[purchaseKey(buyer2, a2)] = true

	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{Creator: buyer1, AgentAddress: a1, Score: 5})
	require.NoError(t, err)
	_, err = msgServer.RateAgent(f.ctx, &types.MsgRateAgent{Creator: buyer2, AgentAddress: a2, Score: 3})
	require.NoError(t, err)

	resp, err := queryServer.TopAgents(f.ctx, &types.QueryTopAgentsRequest{Limit: 1})
	require.NoError(t, err)
	require.Len(t, resp.Agents, 1)
	require.Equal(t, a1, resp.Agents[0].AgentAddress)

	_, err = queryServer.TopAgents(f.ctx, nil)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// GetReputation, EndBlock, Genesis
// ---------------------------------------------------------------------------

func TestGetReputationPublicMethod(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	agent := validAddress2()
	buyer := validAddress()
	f.marketplaceKeeper.purchased[purchaseKey(buyer, agent)] = true

	// Before any rating, GetReputation returns not found.
	_, found, err := f.keeper.GetReputation(f.ctx, agent)
	require.NoError(t, err)
	require.False(t, found)

	// Rate the agent.
	_, err = msgServer.RateAgent(f.ctx, &types.MsgRateAgent{Creator: buyer, AgentAddress: agent, Score: 4})
	require.NoError(t, err)

	// Now GetReputation should return the score.
	score, found, err := f.keeper.GetReputation(f.ctx, agent)
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, uint64(10000), score) // UptimeScoreBps defaults to 10000 (100%)
}

func TestEndBlockNoOp(t *testing.T) {
	f := initFixture(t)

	// EndBlock with no active agents should not error.
	err := f.keeper.EndBlock(f.ctx)
	require.NoError(t, err)
}

func TestGenesisExportImport(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	agent := validAddress2()
	buyer := validAddress()
	f.marketplaceKeeper.purchased[purchaseKey(buyer, agent)] = true

	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{Creator: buyer, AgentAddress: agent, Score: 5})
	require.NoError(t, err)

	// Export genesis.
	genState, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, genState)

	// Init a fresh fixture and import.
	f2 := initFixture(t)
	err = f2.keeper.InitGenesis(f2.ctx, *genState)
	require.NoError(t, err)

	// Verify params round-trip.
	params, err := f2.keeper.Params.Get(f2.ctx)
	require.NoError(t, err)
	require.Equal(t, types.DefaultParams(), params)
}

func TestGetAuthority(t *testing.T) {
	f := initFixture(t)
	auth := f.keeper.GetAuthority()
	require.NotEmpty(t, auth)
}
