//go:build e2e
// +build e2e

package e2e

import (
	"context"
	"testing"

	"cosmossdk.io/core/address"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/reputation/keeper"
	module "clawchain/x/reputation/module"
	"clawchain/x/reputation/types"
)

// ---------------------------------------------------------------------------
// Mock Keepers (reputation)
// ---------------------------------------------------------------------------

type repMockAgentKeeper struct {
	registered map[string]bool
}

func (m *repMockAgentKeeper) IsAgentRegistered(_ context.Context, addr string) (bool, error) {
	return m.registered[addr], nil
}

func (m *repMockAgentKeeper) GetMaxHeartbeatGapBlocks(_ context.Context) (int64, error) {
	return 100, nil
}

func (m *repMockAgentKeeper) WalkHeartbeatStatuses(_ context.Context, _ func(string, int64) (bool, error)) error {
	return nil
}

func (m *repMockAgentKeeper) WalkCompletedTaskSLAEvents(_ context.Context, _ uint64, _ func(uint64, string, bool, int64) (bool, error)) error {
	return nil
}

func (m *repMockAgentKeeper) GetDepositSlashBps(_ context.Context) (uint64, error) {
	return 100, nil
}

func (m *repMockAgentKeeper) SlashAgentDeposit(_ context.Context, _ string, _ uint64) error {
	return nil
}

type repMockMarketplaceKeeper struct {
	purchased map[string]bool
}

func repPurchaseKey(buyer, seller string) string {
	return buyer + "|" + seller
}

func (m *repMockMarketplaceKeeper) HasPurchased(_ context.Context, buyer, seller string) (bool, error) {
	return m.purchased[repPurchaseKey(buyer, seller)], nil
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

type reputationFixture struct {
	ctx               context.Context
	keeper            keeper.Keeper
	addressCodec      address.Codec
	agentKeeper       *repMockAgentKeeper
	marketplaceKeeper *repMockMarketplaceKeeper
}

func initReputationFixture(t *testing.T) *reputationFixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	ak := &repMockAgentKeeper{registered: make(map[string]bool)}
	mk := &repMockMarketplaceKeeper{purchased: make(map[string]bool)}

	k := keeper.NewKeeper(storeService, encCfg.Codec, addrCodec, authority, ak, mk)

	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set reputation params: %v", err)
	}

	return &reputationFixture{
		ctx:               ctx,
		keeper:            k,
		addressCodec:      addrCodec,
		agentKeeper:       ak,
		marketplaceKeeper: mk,
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func repBuyer1() string { return "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu" }
func repBuyer2() string { return "cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh" }
func repAgent1() string { return "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4" }
func repAgent2() string { return "cosmos1q4w7s3r9h2lyj67f5zkj3e9d7f4g2z8qk6m8qy" }

// ---------------------------------------------------------------------------
// E2E: Reputation Scoring Tests
// ---------------------------------------------------------------------------

// TestReputationScoring_EndorseAgent tests the endorsement lifecycle:
// registered agent endorses another agent, query confirms endorsement.
func TestReputationScoring_EndorseAgent(t *testing.T) {
	f := initReputationFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	endorser := repBuyer1()
	endorsed := repAgent1()
	f.agentKeeper.registered[endorser] = true

	// Step 1: Endorse agent.
	resp, err := msgServer.EndorseAgent(f.ctx, &types.MsgEndorseAgent{
		Creator:      endorser,
		AgentAddress: endorsed,
		Reason:       "reliable and fast",
	})
	require.NoError(t, err)
	t.Logf("Step 1: Endorsement created — ID=%d", resp.EndorsementId)

	// Step 2: Verify endorsement stored.
	e, err := f.keeper.Endorsements.Get(f.ctx, resp.EndorsementId)
	require.NoError(t, err)
	require.Equal(t, endorser, e.Endorser)
	require.Equal(t, endorsed, e.Endorsed)
	require.Equal(t, "reliable and fast", e.Reason)

	// Step 3: Verify reputation record updated.
	rep, err := f.keeper.Reputations.Get(f.ctx, endorsed)
	require.NoError(t, err)
	require.Equal(t, uint64(1), rep.Endorsements)
	t.Log("Step 3: Endorsement count incremented")
}

// TestReputationScoring_RatingUpdatesScore tests that rating an agent
// correctly updates the average rating.
func TestReputationScoring_RatingUpdatesScore(t *testing.T) {
	f := initReputationFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	buyer := repBuyer1()
	seller := repAgent1()
	f.marketplaceKeeper.purchased[repPurchaseKey(buyer, seller)] = true

	// Step 1: Rate agent with 5 stars.
	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator:      buyer,
		AgentAddress: seller,
		SkillId:      1,
		Score:        5,
		Comment:      "outstanding work",
	})
	require.NoError(t, err)
	t.Log("Step 1: Agent rated 5 stars")

	// Step 2: Verify reputation record.
	rep, err := f.keeper.Reputations.Get(f.ctx, seller)
	require.NoError(t, err)
	require.Equal(t, uint64(1), rep.TotalRatings)
	require.Equal(t, uint64(5), rep.RatingSum)
	// AvgRatingBps = (5*100)/1 = 500
	require.Equal(t, uint64(500), rep.AvgRatingBps)
	t.Log("Step 2: Reputation record correctly updated")
}

// TestReputationScoring_MultipleRatingsAverageCorrectly verifies that
// multiple ratings produce the correct average.
func TestReputationScoring_MultipleRatingsAverageCorrectly(t *testing.T) {
	f := initReputationFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := repAgent1()
	buyers := []string{repBuyer1(), repBuyer2()}
	for _, b := range buyers {
		f.marketplaceKeeper.purchased[repPurchaseKey(b, seller)] = true
	}

	// Buyer1 rates 5 stars, Buyer2 rates 3 stars.
	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator: buyers[0], AgentAddress: seller, SkillId: 1, Score: 5,
	})
	require.NoError(t, err)

	_, err = msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator: buyers[1], AgentAddress: seller, SkillId: 1, Score: 3,
	})
	require.NoError(t, err)

	rep, err := f.keeper.Reputations.Get(f.ctx, seller)
	require.NoError(t, err)
	require.Equal(t, uint64(2), rep.TotalRatings)
	require.Equal(t, uint64(8), rep.RatingSum)
	// AvgRatingBps = (8*100)/2 = 400
	require.Equal(t, uint64(400), rep.AvgRatingBps)
	t.Log("Average rating across multiple buyers is correct")
}

// TestReputationScoring_SelfEndorsementRejected verifies that agents
// cannot endorse themselves.
func TestReputationScoring_SelfEndorsementRejected(t *testing.T) {
	f := initReputationFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	addr := repAgent1()
	f.agentKeeper.registered[addr] = true

	_, err := msgServer.EndorseAgent(f.ctx, &types.MsgEndorseAgent{
		Creator:      addr,
		AgentAddress: addr,
		Reason:       "I'm the best",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "self-endorsement")
	t.Log("Self-endorsement correctly rejected")
}

// TestReputationScoring_TopAgentsQuery tests that multiple agents are
// ranked correctly by average rating.
func TestReputationScoring_TopAgentsQuery(t *testing.T) {
	f := initReputationFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	buyer1 := repBuyer1()
	buyer2 := repBuyer2()
	agent1 := repAgent1()
	agent2 := repAgent2()

	f.marketplaceKeeper.purchased[repPurchaseKey(buyer1, agent1)] = true
	f.marketplaceKeeper.purchased[repPurchaseKey(buyer2, agent2)] = true

	// Agent1 gets 5 stars, Agent2 gets 3 stars.
	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator: buyer1, AgentAddress: agent1, Score: 5,
	})
	require.NoError(t, err)

	_, err = msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator: buyer2, AgentAddress: agent2, Score: 3,
	})
	require.NoError(t, err)

	// Query top agents — agent1 should rank first.
	resp, err := queryServer.TopAgents(f.ctx, &types.QueryTopAgentsRequest{Limit: 2})
	require.NoError(t, err)
	require.Len(t, resp.Agents, 2)
	require.Equal(t, agent1, resp.Agents[0].AgentAddress)
	require.Equal(t, agent2, resp.Agents[1].AgentAddress)
	t.Log("Top agents sorted correctly by rating")
}

// TestReputationScoring_RatingRequiresPurchase verifies that only buyers
// who have purchased from the agent can rate them.
func TestReputationScoring_RatingRequiresPurchase(t *testing.T) {
	f := initReputationFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// No purchase registered.
	_, err := msgServer.RateAgent(f.ctx, &types.MsgRateAgent{
		Creator:      repBuyer1(),
		AgentAddress: repAgent1(),
		SkillId:      1,
		Score:        4,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "prior purchase")
	t.Log("Rating without purchase correctly rejected")
}
