package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	"clawchain/x/marketplace/keeper"
	"clawchain/x/marketplace/types"
)

// ---------------------------------------------------------------------------
// Escrow query tests
// ---------------------------------------------------------------------------

func TestQueryEscrow_Found(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "EscrowQuerySkill", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "Query escrow test",
		Milestones:     1,
	})
	require.NoError(t, err)

	resp, err := queryServer.Escrow(f.ctx, &types.QueryEscrowRequest{
		EscrowId: createResp.EscrowId,
	})
	require.NoError(t, err)
	require.Equal(t, buyer, resp.Escrow.Buyer)
	require.Equal(t, seller, resp.Escrow.Seller)
	require.Equal(t, "active", resp.Escrow.Status)
}

func TestQueryEscrow_NotFound(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Escrow(f.ctx, &types.QueryEscrowRequest{
		EscrowId: 99999,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not found")
}

func TestSkillSearchAndAnalytics_ErrorBranches(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.SkillSearch(f.ctx, nil)
	require.Error(t, err)

	_, err = queryServer.SkillSearch(f.ctx, &types.QuerySkillSearchRequest{Query: "   "})
	require.Error(t, err)

	_, err = queryServer.SkillAnalytics(f.ctx, nil)
	require.Error(t, err)

	_, err = queryServer.SkillAnalytics(f.ctx, &types.QuerySkillAnalyticsRequest{SkillId: 999999})
	require.Error(t, err)
}

func TestQueryEscrows_ForBuyer(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "EscrowsQuerySkill", "500000")
	fundAccount(f, buyer, 1000000)

	_, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "First escrow",
		Milestones:     1,
	})
	require.NoError(t, err)

	resp, err := queryServer.Escrows(f.ctx, &types.QueryEscrowsRequest{
		Address: buyer,
	})
	require.NoError(t, err)
	require.Len(t, resp.Escrows, 1)
	require.Equal(t, buyer, resp.Escrows[0].Buyer)
}

func TestQueryDispute_NotFound(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Dispute(f.ctx, &types.QueryDisputeRequest{
		EscrowId: 99999,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not found")
}

// ---------------------------------------------------------------------------
// Params query tests
// ---------------------------------------------------------------------------

func TestQueryParams_Marketplace(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.Params(f.ctx, &types.QueryParamsRequest{})
	require.NoError(t, err)
	require.Equal(t, types.DefaultParams(), resp.Params)
}

// ---------------------------------------------------------------------------
// UpdateParams message tests
// ---------------------------------------------------------------------------

func TestUpdateParams_Marketplace(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	authority := authtypes.NewModuleAddress(types.GovModuleName).String()

	newParams := types.DefaultParams()
	newParams.MaxSkillsPerAgent = 100

	_, err := msgServer.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: authority,
		Params:    newParams,
	})
	require.NoError(t, err)

	// Verify params were updated.
	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(100), params.MaxSkillsPerAgent)
}

func TestUpdateParams_Unauthorized(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	// Use a non-authority address.
	_, err := msgServer.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: validAddress(),
		Params:    types.DefaultParams(),
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "unauthorized")
}

// ---------------------------------------------------------------------------
// Nil-request edge cases for escrow queries
// ---------------------------------------------------------------------------

func TestQueryEscrow_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Escrow(f.ctx, nil)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid request")
}

func TestQueryEscrows_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Escrows(f.ctx, nil)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid request")
}

func TestQueryEscrows_EmptyAddress(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Escrows(f.ctx, &types.QueryEscrowsRequest{Address: ""})
	require.Error(t, err)
	require.ErrorContains(t, err, "address cannot be empty")
}

func TestQueryDispute_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Dispute(f.ctx, nil)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid request")
}

func TestQueryParams_NilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Params(f.ctx, nil)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid request")
}
