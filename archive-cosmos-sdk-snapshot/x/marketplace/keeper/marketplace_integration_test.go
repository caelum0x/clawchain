package keeper_test

import (
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/marketplace/keeper"
	"clawchain/x/marketplace/types"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func validAddress() string {
	return "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
}

// ---------------------------------------------------------------------------
// Escrow tests
// ---------------------------------------------------------------------------

func TestCreateEscrowLocksFunds(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "EscrowSkill", "1000000")
	fundAccount(f, buyer, 1000000)

	resp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "Deliver output",
		Milestones:     2,
	})
	require.NoError(t, err)
	require.Equal(t, uint64(0), resp.EscrowId)

	escrow, err := f.keeper.Escrows.Get(f.ctx, resp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "active", escrow.Status)
	require.Equal(t, buyer, escrow.Buyer)
	require.Equal(t, seller, escrow.Seller)

	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	buyerBal := f.bankKeeper.SpendableCoins(f.ctx, buyerAddr)
	require.True(t, buyerBal.AmountOf("uclaw").Equal(math.NewInt(0)))
	require.True(t, f.bankKeeper.moduleBalances[types.ModuleName].AmountOf("uclaw").Equal(math.NewInt(1000000)))
}

func TestCompleteMilestoneReleasesPartialFunds(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "MilestoneSkill", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "Milestone flow",
		Milestones:     2,
	})
	require.NoError(t, err)

	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.NoError(t, err)

	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	sellerBal := f.bankKeeper.SpendableCoins(f.ctx, sellerAddr)
	require.True(t, sellerBal.AmountOf("uclaw").Equal(math.NewInt(500000)))
	require.True(t, f.bankKeeper.moduleBalances[types.ModuleName].AmountOf("uclaw").Equal(math.NewInt(500000)))

	escrow, err := f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, uint64(1), escrow.MilestonesComplete)
	require.Equal(t, "active", escrow.Status)
}

func TestCompleteEscrowReleasesRemainingFunds(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "CompleteSkill", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "Complete escrow",
		Milestones:     2,
	})
	require.NoError(t, err)

	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{Creator: buyer, EscrowId: createResp.EscrowId})
	require.NoError(t, err)
	_, err = msgServer.CompleteEscrow(f.ctx, &types.MsgCompleteEscrow{Creator: buyer, EscrowId: createResp.EscrowId})
	require.NoError(t, err)

	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	sellerBal := f.bankKeeper.SpendableCoins(f.ctx, sellerAddr)
	require.True(t, sellerBal.AmountOf("uclaw").Equal(math.NewInt(1000000)))
	require.True(t, f.bankKeeper.moduleBalances[types.ModuleName].AmountOf("uclaw").Equal(math.NewInt(0)))

	escrow, err := f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "completed", escrow.Status)
}

func TestResolveDisputeRefundsBuyer(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "DisputeSkill", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "Disputed delivery",
		Milestones:     1,
	})
	require.NoError(t, err)

	_, err = msgServer.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  seller,
		EscrowId: createResp.EscrowId,
		Reason:   "Buyer claims missing deliverable",
	})
	require.NoError(t, err)

	authority := authtypes.NewModuleAddress(types.GovModuleName).String()
	_, err = msgServer.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: authority,
		EscrowId:  createResp.EscrowId,
		InFavorOf: buyer,
	})
	require.NoError(t, err)

	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	buyerBal := f.bankKeeper.SpendableCoins(f.ctx, buyerAddr)
	require.True(t, buyerBal.AmountOf("uclaw").Equal(math.NewInt(1000000)))
	require.True(t, f.bankKeeper.moduleBalances[types.ModuleName].AmountOf("uclaw").Equal(math.NewInt(0)))

	escrow, err := f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "refunded", escrow.Status)
}

func TestExpireEscrowsRefundsBuyer(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "ExpirySkill", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 1,
		Description:    "Will expire",
		Milestones:     1,
	})
	require.NoError(t, err)

	// Move past deadline and run expiration hook.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(sdkCtx.BlockHeight() + 2)
	require.NoError(t, f.keeper.ExpireEscrows(f.ctx))

	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	buyerBal := f.bankKeeper.SpendableCoins(f.ctx, buyerAddr)
	require.True(t, buyerBal.AmountOf("uclaw").Equal(math.NewInt(1000000)))
	require.True(t, f.bankKeeper.moduleBalances[types.ModuleName].AmountOf("uclaw").Equal(math.NewInt(0)))

	escrow, err := f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "expired", escrow.Status)
}

func validAddress2() string {
	return "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"
}

func listSkill(t *testing.T, f *fixture, creator, name, price string) uint64 {
	t.Helper()
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	resp, err := msgServer.ListSkill(f.ctx, &types.MsgListSkill{
		Creator:     creator,
		Name:        name,
		Description: "A test skill",
		Price:       price,
		Denom:       "uclaw",
	})
	require.NoError(t, err)
	return resp.SkillId
}

func fundAccount(f *fixture, addrStr string, amount uint64) {
	addr, _ := sdk.AccAddressFromBech32(addrStr)
	coins := sdk.NewCoins(sdk.NewCoin("uclaw", math.NewIntFromUint64(amount)))
	f.bankKeeper.FundAccount(addr, coins)
}

// ---------------------------------------------------------------------------
// ListSkill tests
// ---------------------------------------------------------------------------

func TestListSkillSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	resp, err := msgServer.ListSkill(f.ctx, &types.MsgListSkill{
		Creator:     validAddress(),
		Name:        "MySkill",
		Description: "A useful skill",
		Price:       "1000000",
		Denom:       "uclaw",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint64(0), resp.SkillId)

	// Verify skill stored correctly.
	skill, err := f.keeper.Skills.Get(f.ctx, 0)
	require.NoError(t, err)
	require.Equal(t, validAddress(), skill.Owner)
	require.Equal(t, "MySkill", skill.Name)
	require.Equal(t, "A useful skill", skill.Description)
	require.Equal(t, "1000000", skill.Price)
	require.Equal(t, "uclaw", skill.Denom)
	require.True(t, skill.Active)
	require.Equal(t, uint64(0), skill.PurchaseCount)
}

func TestListSkillDefaultDenom(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	resp, err := msgServer.ListSkill(f.ctx, &types.MsgListSkill{
		Creator:     validAddress(),
		Name:        "NoDenomSkill",
		Description: "Skill with no explicit denom",
		Price:       "500",
		Denom:       "", // Should default to uclaw
	})
	require.NoError(t, err)

	skill, err := f.keeper.Skills.Get(f.ctx, resp.SkillId)
	require.NoError(t, err)
	require.Equal(t, "uclaw", skill.Denom)
}

func TestListSkillEmptyName(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.ListSkill(f.ctx, &types.MsgListSkill{
		Creator:     validAddress(),
		Name:        "",
		Description: "Missing name",
		Price:       "100",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "skill name cannot be empty")
}

func TestListSkillEmptyDescription(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.ListSkill(f.ctx, &types.MsgListSkill{
		Creator:     validAddress(),
		Name:        "TestSkill",
		Description: "",
		Price:       "100",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "skill description cannot be empty")
}

func TestListSkillInvalidPrice(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.ListSkill(f.ctx, &types.MsgListSkill{
		Creator:     validAddress(),
		Name:        "TestSkill",
		Description: "Description",
		Price:       "0",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "price must be a positive integer")

	_, err = msgServer.ListSkill(f.ctx, &types.MsgListSkill{
		Creator:     validAddress(),
		Name:        "TestSkill",
		Description: "Description",
		Price:       "not-a-number",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "price must be a positive integer")
}

func TestListSkillInvalidAddress(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.ListSkill(f.ctx, &types.MsgListSkill{
		Creator:     "invalid-address",
		Name:        "TestSkill",
		Description: "Description",
		Price:       "100",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid")
}

func TestListSkillAutoIncrementID(t *testing.T) {
	f := initFixture(t)

	id0 := listSkill(t, f, validAddress(), "Skill0", "100")
	id1 := listSkill(t, f, validAddress(), "Skill1", "200")
	id2 := listSkill(t, f, validAddress(), "Skill2", "300")

	require.Equal(t, uint64(0), id0)
	require.Equal(t, uint64(1), id1)
	require.Equal(t, uint64(2), id2)
}

// ---------------------------------------------------------------------------
// DelistSkill tests
// ---------------------------------------------------------------------------

func TestDelistSkillSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	addr := validAddress()
	skillID := listSkill(t, f, addr, "ToBeDelisted", "100")

	_, err := msgServer.DelistSkill(f.ctx, &types.MsgDelistSkill{
		Creator: addr,
		SkillId: skillID,
	})
	require.NoError(t, err)

	// Verify skill is now inactive.
	skill, err := f.keeper.Skills.Get(f.ctx, skillID)
	require.NoError(t, err)
	require.False(t, skill.Active)
}

func TestDelistSkillNotOwner(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	skillID := listSkill(t, f, validAddress(), "OwnedByAddr1", "100")

	_, err := msgServer.DelistSkill(f.ctx, &types.MsgDelistSkill{
		Creator: validAddress2(),
		SkillId: skillID,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "only the owner can delist")
}

func TestDelistSkillNotFound(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.DelistSkill(f.ctx, &types.MsgDelistSkill{
		Creator: validAddress(),
		SkillId: 999,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not found")
}

func TestDelistSkillInvalidAddress(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.DelistSkill(f.ctx, &types.MsgDelistSkill{
		Creator: "bad-addr",
		SkillId: 0,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid")
}

// ---------------------------------------------------------------------------
// PurchaseSkill tests
// ---------------------------------------------------------------------------

func TestPurchaseSkillSuccess(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "PaidSkill", "1000000")

	// Fund buyer.
	fundAccount(f, buyer, 10000000)

	_, err := msgServer.PurchaseSkill(f.ctx, &types.MsgPurchaseSkill{
		Creator: buyer,
		SkillId: skillID,
	})
	require.NoError(t, err)

	// Verify purchase count incremented.
	skill, err := f.keeper.Skills.Get(f.ctx, skillID)
	require.NoError(t, err)
	require.Equal(t, uint64(1), skill.PurchaseCount)
	require.Equal(t, "1000000", skill.TotalRevenue)

	// Verify funds transferred.
	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	sellerBal := f.bankKeeper.SpendableCoins(f.ctx, sellerAddr)
	require.True(t, sellerBal.AmountOf("uclaw").Equal(math.NewInt(1000000)))

	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	buyerBal := f.bankKeeper.SpendableCoins(f.ctx, buyerAddr)
	require.True(t, buyerBal.AmountOf("uclaw").Equal(math.NewInt(9000000)))
}

func TestPurchaseSkillInsufficientFunds(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	listSkill(t, f, seller, "ExpensiveSkill", "1000000")

	// Don't fund buyer — should fail.
	_, err := msgServer.PurchaseSkill(f.ctx, &types.MsgPurchaseSkill{
		Creator: buyer,
		SkillId: 0,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "insufficient funds")
}

func TestPurchaseSkillSelfPurchase(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	addr := validAddress()
	skillID := listSkill(t, f, addr, "OwnSkill", "100")
	fundAccount(f, addr, 10000000)

	_, err := msgServer.PurchaseSkill(f.ctx, &types.MsgPurchaseSkill{
		Creator: addr,
		SkillId: skillID,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "cannot purchase your own skill")
}

func TestPurchaseSkillInactive(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "DelistedSkill", "100")
	fundAccount(f, buyer, 10000000)

	// Delist the skill.
	_, err := msgServer.DelistSkill(f.ctx, &types.MsgDelistSkill{
		Creator: seller,
		SkillId: skillID,
	})
	require.NoError(t, err)

	// Try to purchase — should fail.
	_, err = msgServer.PurchaseSkill(f.ctx, &types.MsgPurchaseSkill{
		Creator: buyer,
		SkillId: skillID,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not active")
}

func TestPurchaseSkillNotFound(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.PurchaseSkill(f.ctx, &types.MsgPurchaseSkill{
		Creator: validAddress(),
		SkillId: 999,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not found")
}

func TestPurchaseSkillMultipleBuyers(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "PopularSkill", "100")

	// Fund buyer and purchase multiple times.
	fundAccount(f, buyer, 10000000)
	for i := 0; i < 5; i++ {
		_, err := msgServer.PurchaseSkill(f.ctx, &types.MsgPurchaseSkill{
			Creator: buyer,
			SkillId: skillID,
		})
		require.NoError(t, err)
	}

	skill, err := f.keeper.Skills.Get(f.ctx, skillID)
	require.NoError(t, err)
	require.Equal(t, uint64(5), skill.PurchaseCount)
	require.Equal(t, "500", skill.TotalRevenue)
}

// ---------------------------------------------------------------------------
// Query tests
// ---------------------------------------------------------------------------

func TestQuerySkillsEmpty(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.Skills(f.ctx, &types.QuerySkillsRequest{})
	require.NoError(t, err)
	require.Empty(t, resp.Skills)
}

func TestQuerySkillsMultiple(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	listSkill(t, f, validAddress(), "Skill1", "100")
	listSkill(t, f, validAddress(), "Skill2", "200")
	listSkill(t, f, validAddress2(), "Skill3", "300")

	resp, err := queryServer.Skills(f.ctx, &types.QuerySkillsRequest{})
	require.NoError(t, err)
	require.Len(t, resp.Skills, 3)
}

func TestQuerySkillFound(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	listSkill(t, f, validAddress(), "QueryMe", "500")

	resp, err := queryServer.Skill(f.ctx, &types.QuerySkillRequest{SkillId: 0})
	require.NoError(t, err)
	require.Equal(t, "QueryMe", resp.Skill.Name)
	require.Equal(t, "500", resp.Skill.Price)
}

func TestQuerySkillNotFound(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Skill(f.ctx, &types.QuerySkillRequest{SkillId: 999})
	require.Error(t, err)
	require.ErrorContains(t, err, "not found")
}

func TestQuerySkillsNilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Skills(f.ctx, nil)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid request")
}

func TestQuerySkillNilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	_, err := queryServer.Skill(f.ctx, nil)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid request")
}

func TestQuerySkillsByCategory(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	skillA := listSkill(t, f, validAddress(), "CatA-1", "100")
	skillB := listSkill(t, f, validAddress(), "CatB-1", "100")
	_, err := msgServer.UpdateSkill(f.ctx, &types.MsgUpdateSkill{
		Creator:      validAddress(),
		SkillId:      skillA,
		Description:  "cat A skill",
		Price:        "100",
		Category:     "agent-tools",
		Tags:         []string{"automation"},
		Dependencies: []uint64{},
	})
	require.NoError(t, err)
	_, err = msgServer.UpdateSkill(f.ctx, &types.MsgUpdateSkill{
		Creator:      validAddress(),
		SkillId:      skillB,
		Description:  "cat B skill",
		Price:        "100",
		Category:     "analytics",
		Tags:         []string{"insights"},
		Dependencies: []uint64{},
	})
	require.NoError(t, err)

	resp, err := queryServer.SkillsByCategory(f.ctx, &types.QuerySkillsByCategoryRequest{Category: "agent-tools"})
	require.NoError(t, err)
	require.Len(t, resp.Skills, 1)
	require.Equal(t, skillA, resp.Skills[0].Id)
}

func TestQuerySkillsByOwner(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	ownerA := validAddress()
	ownerB := validAddress2()
	listSkill(t, f, ownerA, "OwnerA-1", "100")
	listSkill(t, f, ownerA, "OwnerA-2", "200")
	listSkill(t, f, ownerB, "OwnerB-1", "300")

	resp, err := queryServer.SkillsByOwner(f.ctx, &types.QuerySkillsByOwnerRequest{Owner: ownerA})
	require.NoError(t, err)
	require.Len(t, resp.Skills, 2)
}

func TestQuerySkillSearch(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	searchID := listSkill(t, f, validAddress(), "Code Assistant", "250")
	_, err := msgServer.UpdateSkill(f.ctx, &types.MsgUpdateSkill{
		Creator:      validAddress(),
		SkillId:      searchID,
		Description:  "Automates chain workflows",
		Price:        "250",
		Category:     "automation",
		Tags:         []string{"workflow", "assistant"},
		Dependencies: []uint64{},
	})
	require.NoError(t, err)
	listSkill(t, f, validAddress2(), "Data Reporter", "400")

	resp, err := queryServer.SkillSearch(f.ctx, &types.QuerySkillSearchRequest{Query: "assistant"})
	require.NoError(t, err)
	require.Len(t, resp.Skills, 1)
	require.Equal(t, searchID, resp.Skills[0].Id)
}

func TestQuerySkillAnalytics(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	skillID := listSkill(t, f, validAddress(), "AnalyticsSkill", "100")
	fundAccount(f, validAddress2(), 1000)
	_, err := msgServer.PurchaseSkill(f.ctx, &types.MsgPurchaseSkill{
		Creator: validAddress2(),
		SkillId: skillID,
	})
	require.NoError(t, err)

	resp, err := queryServer.SkillAnalytics(f.ctx, &types.QuerySkillAnalyticsRequest{SkillId: skillID})
	require.NoError(t, err)
	require.Equal(t, skillID, resp.SkillId)
	require.Equal(t, uint64(1), resp.PurchaseCount)
	require.Equal(t, "100", resp.TotalRevenue)
	require.Equal(t, uint64(1), resp.Version)
}

// ---------------------------------------------------------------------------
// Full marketplace workflow
// ---------------------------------------------------------------------------

func TestFullMarketplaceWorkflow(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()

	// 1. Seller lists a skill.
	listResp, err := msgServer.ListSkill(f.ctx, &types.MsgListSkill{
		Creator:     seller,
		Name:        "DataAnalysis",
		Description: "Analyzes datasets and produces reports",
		Price:       "5000000",
		Denom:       "uclaw",
	})
	require.NoError(t, err)
	skillID := listResp.SkillId

	// 2. Query shows the skill.
	qResp, err := queryServer.Skill(f.ctx, &types.QuerySkillRequest{SkillId: skillID})
	require.NoError(t, err)
	require.Equal(t, "DataAnalysis", qResp.Skill.Name)
	require.True(t, qResp.Skill.Active)

	// 3. Buyer purchases the skill.
	fundAccount(f, buyer, 50000000)
	_, err = msgServer.PurchaseSkill(f.ctx, &types.MsgPurchaseSkill{
		Creator: buyer,
		SkillId: skillID,
	})
	require.NoError(t, err)

	// 4. Verify purchase count and balances.
	qResp, err = queryServer.Skill(f.ctx, &types.QuerySkillRequest{SkillId: skillID})
	require.NoError(t, err)
	require.Equal(t, uint64(1), qResp.Skill.PurchaseCount)

	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	require.True(t, f.bankKeeper.SpendableCoins(f.ctx, sellerAddr).AmountOf("uclaw").Equal(math.NewInt(5000000)))

	// 5. Seller delists the skill.
	_, err = msgServer.DelistSkill(f.ctx, &types.MsgDelistSkill{
		Creator: seller,
		SkillId: skillID,
	})
	require.NoError(t, err)

	// 6. Buyer cannot purchase delisted skill.
	_, err = msgServer.PurchaseSkill(f.ctx, &types.MsgPurchaseSkill{
		Creator: buyer,
		SkillId: skillID,
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not active")

	// 7. Skills query shows it as inactive.
	allResp, err := queryServer.Skills(f.ctx, &types.QuerySkillsRequest{})
	require.NoError(t, err)
	require.Len(t, allResp.Skills, 1)
	require.False(t, allResp.Skills[0].Active)
}
