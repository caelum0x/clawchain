//go:build integration

package keeper_test

import (
	"encoding/json"
	"testing"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/marketplace/keeper"
	"clawchain/x/marketplace/types"
)

// ===========================================================================
// QueryComputeResources
// ===========================================================================

// TestCoverage4_QueryComputeResources_WithAvailableFilter exercises the
// onlyAvailable filter: active+no-lessee passes, active+leased and inactive
// are excluded.
func TestCoverage4_QueryComputeResources_WithAvailableFilter(t *testing.T) {
	f := initFixture(t)

	// Active, available
	res1 := types.ComputeResource{Id: 1, Owner: validAddress(), Active: true, GpuModel: "A100", VramGb: 80}
	bz1, err := json.Marshal(res1)
	require.NoError(t, err)
	require.NoError(t, f.keeper.ComputeResources.Set(f.ctx, 1, string(bz1)))

	// Active, leased
	res2 := types.ComputeResource{Id: 2, Owner: validAddress(), Active: true, CurrentLessee: validAddress2(), GpuModel: "H100", VramGb: 80}
	bz2, err := json.Marshal(res2)
	require.NoError(t, err)
	require.NoError(t, f.keeper.ComputeResources.Set(f.ctx, 2, string(bz2)))

	// Inactive
	res3 := types.ComputeResource{Id: 3, Owner: validAddress(), Active: false, GpuModel: "RTX4090", VramGb: 24}
	bz3, err := json.Marshal(res3)
	require.NoError(t, err)
	require.NoError(t, f.keeper.ComputeResources.Set(f.ctx, 3, string(bz3)))

	all, err := f.keeper.QueryComputeResources(f.ctx, false)
	require.NoError(t, err)
	require.Len(t, all, 3)

	available, err := f.keeper.QueryComputeResources(f.ctx, true)
	require.NoError(t, err)
	require.Len(t, available, 1)
	require.Equal(t, uint64(1), available[0].Id)
}

// TestCoverage4_QueryComputeResources_MalformedSkipped ensures malformed JSON
// entries are silently skipped during Walk.
func TestCoverage4_QueryComputeResources_MalformedSkipped(t *testing.T) {
	f := initFixture(t)

	// One valid resource
	res := types.ComputeResource{Id: 10, Owner: validAddress(), Active: true, GpuModel: "V100"}
	bz, err := json.Marshal(res)
	require.NoError(t, err)
	require.NoError(t, f.keeper.ComputeResources.Set(f.ctx, 10, string(bz)))

	// Two malformed entries
	require.NoError(t, f.keeper.ComputeResources.Set(f.ctx, 11, "{bad"))
	require.NoError(t, f.keeper.ComputeResources.Set(f.ctx, 12, "not-json-at-all"))

	all, err := f.keeper.QueryComputeResources(f.ctx, false)
	require.NoError(t, err)
	require.Len(t, all, 1, "malformed entries should be skipped")
	require.Equal(t, uint64(10), all[0].Id)

	available, err := f.keeper.QueryComputeResources(f.ctx, true)
	require.NoError(t, err)
	require.Len(t, available, 1)
}

// TestCoverage4_QueryComputeResources_EmptyStore returns empty slice when
// nothing is stored.
func TestCoverage4_QueryComputeResources_EmptyStore(t *testing.T) {
	f := initFixture(t)

	resources, err := f.keeper.QueryComputeResources(f.ctx, false)
	require.NoError(t, err)
	require.Empty(t, resources)

	resources, err = f.keeper.QueryComputeResources(f.ctx, true)
	require.NoError(t, err)
	require.Empty(t, resources)
}

// ===========================================================================
// QueryComputeResource (single)
// ===========================================================================

func TestCoverage4_QueryComputeResource_Found(t *testing.T) {
	f := initFixture(t)

	res := types.ComputeResource{Id: 42, Owner: validAddress(), Active: true, GpuModel: "A100"}
	bz, err := json.Marshal(res)
	require.NoError(t, err)
	require.NoError(t, f.keeper.ComputeResources.Set(f.ctx, 42, string(bz)))

	got, err := f.keeper.QueryComputeResource(f.ctx, 42)
	require.NoError(t, err)
	require.Equal(t, "A100", got.GpuModel)
	require.Equal(t, uint64(42), got.Id)
}

func TestCoverage4_QueryComputeResource_NotFound(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.QueryComputeResource(f.ctx, 9999)
	require.Error(t, err)
}

func TestCoverage4_QueryComputeResource_MalformedJSON(t *testing.T) {
	f := initFixture(t)

	require.NoError(t, f.keeper.ComputeResources.Set(f.ctx, 99, "{bad-json"))
	_, err := f.keeper.QueryComputeResource(f.ctx, 99)
	require.Error(t, err)
}

// ===========================================================================
// QueryComputeLeases
// ===========================================================================

func TestCoverage4_QueryComputeLeases_FilterByAddress(t *testing.T) {
	f := initFixture(t)

	lease1 := types.ComputeLease{Id: 1, Lessee: validAddress(), Provider: validAddress2()}
	lease2 := types.ComputeLease{Id: 2, Lessee: validAddress2(), Provider: validAddress()}
	bz1, _ := json.Marshal(lease1)
	bz2, _ := json.Marshal(lease2)
	require.NoError(t, f.keeper.ComputeLeases.Set(f.ctx, 1, string(bz1)))
	require.NoError(t, f.keeper.ComputeLeases.Set(f.ctx, 2, string(bz2)))

	// validAddress appears in both (lessee in lease1, provider in lease2)
	leases, err := f.keeper.QueryComputeLeases(f.ctx, validAddress())
	require.NoError(t, err)
	require.Len(t, leases, 2)

	// empty address returns all
	all, err := f.keeper.QueryComputeLeases(f.ctx, "")
	require.NoError(t, err)
	require.Len(t, all, 2)

	// unknown address returns empty
	none, err := f.keeper.QueryComputeLeases(f.ctx, "cosmos1nonexistent")
	require.NoError(t, err)
	require.Empty(t, none)
}

// TestCoverage4_QueryComputeLeases_OnlyProvider matches only when address is
// in the Provider field but not Lessee.
func TestCoverage4_QueryComputeLeases_OnlyProvider(t *testing.T) {
	f := initFixture(t)

	thirdAddr := "cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh"
	lease := types.ComputeLease{Id: 5, Lessee: validAddress(), Provider: thirdAddr}
	bz, _ := json.Marshal(lease)
	require.NoError(t, f.keeper.ComputeLeases.Set(f.ctx, 5, string(bz)))

	leases, err := f.keeper.QueryComputeLeases(f.ctx, thirdAddr)
	require.NoError(t, err)
	require.Len(t, leases, 1)
	require.Equal(t, thirdAddr, leases[0].Provider)
}

// TestCoverage4_QueryComputeLeases_MalformedSkipped ensures malformed lease
// entries are silently skipped.
func TestCoverage4_QueryComputeLeases_MalformedSkipped(t *testing.T) {
	f := initFixture(t)

	lease := types.ComputeLease{Id: 1, Lessee: validAddress(), Provider: validAddress2()}
	bz, _ := json.Marshal(lease)
	require.NoError(t, f.keeper.ComputeLeases.Set(f.ctx, 1, string(bz)))
	require.NoError(t, f.keeper.ComputeLeases.Set(f.ctx, 2, "{bad"))
	require.NoError(t, f.keeper.ComputeLeases.Set(f.ctx, 3, ""))

	all, err := f.keeper.QueryComputeLeases(f.ctx, "")
	require.NoError(t, err)
	require.Len(t, all, 1, "malformed leases should be skipped")
}

// ===========================================================================
// ResolveDispute — additional branch coverage
// ===========================================================================

func TestCoverage4_ResolveDispute_InFavorOfSeller(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4SellerDispute", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "seller dispute cov4",
		Milestones:     1,
	})
	require.NoError(t, err)

	_, err = msgServer.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  seller,
		EscrowId: createResp.EscrowId,
		Reason:   "Quality issues",
	})
	require.NoError(t, err)

	authority := authtypes.NewModuleAddress(types.GovModuleName).String()
	_, err = msgServer.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: authority,
		EscrowId:  createResp.EscrowId,
		InFavorOf: seller,
	})
	require.NoError(t, err)

	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	sellerBal := f.bankKeeper.SpendableCoins(f.ctx, sellerAddr)
	require.True(t, sellerBal.AmountOf("uclaw").Equal(math.NewInt(1000000)))

	escrow, err := f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "completed", escrow.Status)
	require.Equal(t, escrow.Milestones, escrow.MilestonesComplete)

	dispute, err := f.keeper.Disputes.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "resolved_seller", dispute.Status)
	require.GreaterOrEqual(t, dispute.ResolvedAt, int64(0))
}

func TestCoverage4_ResolveDispute_InFavorOfBuyer(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4BuyerDispute", "2000000")
	fundAccount(f, buyer, 2000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "buyer dispute cov4",
		Milestones:     1,
	})
	require.NoError(t, err)

	_, err = msgServer.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
		Reason:   "Never delivered",
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
	require.True(t, buyerBal.AmountOf("uclaw").Equal(math.NewInt(2000000)))

	escrow, err := f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "refunded", escrow.Status)

	dispute, err := f.keeper.Disputes.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "resolved_buyer", dispute.Status)
}

// TestCoverage4_ResolveDispute_AfterPartialMilestones resolves in favor of the
// buyer after one milestone has already been paid out. Only the remaining
// balance should be refunded.
func TestCoverage4_ResolveDispute_AfterPartialMilestones(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4PartialDispute", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 200,
		Description:    "partial milestone dispute",
		Milestones:     2,
	})
	require.NoError(t, err)

	// Complete 1 of 2 milestones — seller receives 500000
	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.NoError(t, err)

	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	sellerBal := f.bankKeeper.SpendableCoins(f.ctx, sellerAddr)
	require.True(t, sellerBal.AmountOf("uclaw").Equal(math.NewInt(500000)))

	// Now dispute
	_, err = msgServer.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
		Reason:   "Second milestone not delivered",
	})
	require.NoError(t, err)

	// Resolve in favor of buyer — remaining 500000 goes back to buyer
	authority := authtypes.NewModuleAddress(types.GovModuleName).String()
	_, err = msgServer.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: authority,
		EscrowId:  createResp.EscrowId,
		InFavorOf: buyer,
	})
	require.NoError(t, err)

	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	buyerBal := f.bankKeeper.SpendableCoins(f.ctx, buyerAddr)
	require.True(t, buyerBal.AmountOf("uclaw").Equal(math.NewInt(500000)))

	escrow, err := f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "refunded", escrow.Status)
}

// TestCoverage4_ResolveDispute_SellerAfterPartialMilestones resolves in favor
// of seller after partial milestones. Seller receives the remaining balance.
func TestCoverage4_ResolveDispute_SellerAfterPartialMilestones(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4PartialSellerDisp", "900000")
	fundAccount(f, buyer, 900000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 200,
		Description:    "partial seller dispute",
		Milestones:     3,
	})
	require.NoError(t, err)

	// Complete 1 of 3 milestones — seller receives 300000
	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.NoError(t, err)

	_, err = msgServer.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  seller,
		EscrowId: createResp.EscrowId,
		Reason:   "Buyer unresponsive",
	})
	require.NoError(t, err)

	authority := authtypes.NewModuleAddress(types.GovModuleName).String()
	_, err = msgServer.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: authority,
		EscrowId:  createResp.EscrowId,
		InFavorOf: seller,
	})
	require.NoError(t, err)

	// Seller gets 300000 from milestone + 600000 from resolution = 900000 total
	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	sellerBal := f.bankKeeper.SpendableCoins(f.ctx, sellerAddr)
	require.True(t, sellerBal.AmountOf("uclaw").Equal(math.NewInt(900000)))

	escrow, err := f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "completed", escrow.Status)
	require.Equal(t, escrow.Milestones, escrow.MilestonesComplete)
}

func TestCoverage4_ResolveDispute_InvalidAuthority(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: "bad-address",
		EscrowId:  0,
		InFavorOf: validAddress(),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid authority")
}

func TestCoverage4_ResolveDispute_UnauthorizedAuthority(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: validAddress(), // not the gov module
		EscrowId:  0,
		InFavorOf: validAddress(),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "unauthorized")
}

func TestCoverage4_ResolveDispute_EscrowNotFound(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	authority := authtypes.NewModuleAddress(types.GovModuleName).String()
	_, err := msgServer.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: authority,
		EscrowId:  999,
		InFavorOf: validAddress(),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "escrow not found")
}

// TestCoverage4_ResolveDispute_DisputeNotFound tests the case where an escrow
// exists but no dispute has been filed.
func TestCoverage4_ResolveDispute_DisputeNotFound(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4NoDispute", "500000")
	fundAccount(f, buyer, 500000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "no dispute filed",
		Milestones:     1,
	})
	require.NoError(t, err)

	authority := authtypes.NewModuleAddress(types.GovModuleName).String()
	_, err = msgServer.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: authority,
		EscrowId:  createResp.EscrowId,
		InFavorOf: buyer,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "dispute not found")
}

func TestCoverage4_ResolveDispute_InvalidInFavorOf(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4InvalidFavor", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "invalid favor",
		Milestones:     1,
	})
	require.NoError(t, err)

	_, err = msgServer.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  seller,
		EscrowId: createResp.EscrowId,
		Reason:   "dispute",
	})
	require.NoError(t, err)

	authority := authtypes.NewModuleAddress(types.GovModuleName).String()
	_, err = msgServer.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: authority,
		EscrowId:  createResp.EscrowId,
		InFavorOf: "cosmos1fl48vsnmsdzcv85q5d2q4z5ajdha8yu34mf0eh", // third party
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "must be buyer or seller")
}

// ===========================================================================
// CompleteMilestone — edge cases
// ===========================================================================

func TestCoverage4_CompleteMilestone_InvalidAddress(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  "bad-address",
		EscrowId: 0,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid")
}

func TestCoverage4_CompleteMilestone_EscrowNotFound(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	_, err := msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  validAddress(),
		EscrowId: 999,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "escrow not found")
}

func TestCoverage4_CompleteMilestone_NotBuyer(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4NotBuyer", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "not buyer test",
		Milestones:     2,
	})
	require.NoError(t, err)

	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  seller,
		EscrowId: createResp.EscrowId,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "only buyer")
}

// TestCoverage4_CompleteMilestone_EscrowNotActive tests calling
// CompleteMilestone on an escrow that has been completed or refunded.
func TestCoverage4_CompleteMilestone_EscrowNotActive(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4NotActive", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "will be completed first",
		Milestones:     1,
	})
	require.NoError(t, err)

	// Complete the only milestone — escrow status becomes "completed"
	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.NoError(t, err)

	escrow, err := f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, "completed", escrow.Status)

	// Now try again — escrow is not active
	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "not active")
}

func TestCoverage4_CompleteMilestone_ExpiredEscrow(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4Expired", "1000000")
	fundAccount(f, buyer, 1000000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 1,
		Description:    "expires quickly",
		Milestones:     2,
	})
	require.NoError(t, err)

	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(sdkCtx.BlockHeight() + 10)

	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "expired")
}

// TestCoverage4_CompleteMilestone_MultiMilestoneFlow exercises a 3-milestone
// escrow end-to-end, verifying intermediate payout amounts and final status.
func TestCoverage4_CompleteMilestone_MultiMilestoneFlow(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4MultiMilestone", "900000")
	fundAccount(f, buyer, 900000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 200,
		Description:    "three milestones",
		Milestones:     3,
	})
	require.NoError(t, err)

	sellerAddr, _ := sdk.AccAddressFromBech32(seller)

	// Milestone 1: pays 300000
	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.NoError(t, err)
	sellerBal := f.bankKeeper.SpendableCoins(f.ctx, sellerAddr)
	require.True(t, sellerBal.AmountOf("uclaw").Equal(math.NewInt(300000)))

	escrow, err := f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, uint64(1), escrow.MilestonesComplete)
	require.Equal(t, "active", escrow.Status)

	// Milestone 2: pays 300000
	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.NoError(t, err)
	sellerBal = f.bankKeeper.SpendableCoins(f.ctx, sellerAddr)
	require.True(t, sellerBal.AmountOf("uclaw").Equal(math.NewInt(600000)))

	escrow, err = f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, uint64(2), escrow.MilestonesComplete)
	require.Equal(t, "active", escrow.Status)

	// Milestone 3 (final): pays remaining 300000
	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.NoError(t, err)
	sellerBal = f.bankKeeper.SpendableCoins(f.ctx, sellerAddr)
	require.True(t, sellerBal.AmountOf("uclaw").Equal(math.NewInt(900000)))

	escrow, err = f.keeper.Escrows.Get(f.ctx, createResp.EscrowId)
	require.NoError(t, err)
	require.Equal(t, uint64(3), escrow.MilestonesComplete)
	require.Equal(t, "completed", escrow.Status)

	// Module balance should be zero
	require.True(t, f.bankKeeper.moduleBalances[types.ModuleName].AmountOf("uclaw").Equal(math.NewInt(0)))
}

// TestCoverage4_CompleteMilestone_AllAlreadyCompleted tries to complete a
// milestone when MilestonesComplete >= Milestones.
func TestCoverage4_CompleteMilestone_AllAlreadyCompleted(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	seller := validAddress()
	buyer := validAddress2()
	skillID := listSkill(t, f, seller, "Cov4AllDone", "500000")
	fundAccount(f, buyer, 500000)

	createResp, err := msgServer.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		DeadlineBlocks: 100,
		Description:    "single milestone",
		Milestones:     1,
	})
	require.NoError(t, err)

	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.NoError(t, err)

	// Second attempt hits "all milestones already completed" or "not active"
	_, err = msgServer.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
		Creator:  buyer,
		EscrowId: createResp.EscrowId,
	})
	require.Error(t, err)
}

// ===========================================================================
// UpdateParam and Genesis round-trip (kept from original)
// ===========================================================================

func TestCoverage4_UpdateParam_MaxSkillsPerAgent(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "max_skills_per_agent", "50")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(50), params.MaxSkillsPerAgent)
}

func TestCoverage4_GenesisExportImport(t *testing.T) {
	f := initFixture(t)

	exported, err := f.keeper.ExportGenesis(f.ctx)
	require.NoError(t, err)
	require.NotNil(t, exported)

	f2 := initFixture(t)
	require.NoError(t, f2.keeper.InitGenesis(f2.ctx, *exported))
}
