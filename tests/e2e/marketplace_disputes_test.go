//go:build e2e
// +build e2e

package e2e

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/marketplace/keeper"
	"clawchain/x/marketplace/types"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func escrowBuyer() string {
	return sdk.AccAddress([]byte("escrow_buyer________")).String()
}

func escrowSeller() string {
	return sdk.AccAddress([]byte("escrow_seller_______")).String()
}

func escrowThirdParty() string {
	return sdk.AccAddress([]byte("third_party_________")).String()
}

func escrowAuthority() string {
	return authtypes.NewModuleAddress(types.GovModuleName).String()
}

// listSkillAndCreateEscrow is a helper that lists a skill as the seller
// and creates an escrow for the buyer with the given milestones.
func listSkillAndCreateEscrow(
	t *testing.T,
	f *marketFixture,
	msgSrv types.MsgServer,
	buyer, seller string,
	milestones uint64,
	deadlineBlocks int64,
) uint64 {
	t.Helper()

	// Fund the buyer.
	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	f.bankKeeper.balances[buyerAddr.String()] = f.bankKeeper.balances[buyerAddr.String()].Add(
		sdk.NewInt64Coin("uclaw", 100_000_000),
	)

	// List a skill.
	skillResp, err := msgSrv.ListSkill(f.ctx, &types.MsgListSkill{
		Creator:     seller,
		Name:        "AI Analysis Service",
		Description: "Comprehensive AI analysis",
		Price:       "1000000",
		Denom:       "uclaw",
	})
	require.NoError(t, err)

	// Create escrow.
	escrowResp, err := msgSrv.CreateEscrow(f.ctx, &types.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillResp.SkillId,
		Description:    "Escrow for AI analysis",
		DeadlineBlocks: deadlineBlocks,
		Milestones:     milestones,
	})
	require.NoError(t, err)
	return escrowResp.EscrowId
}

// ---------------------------------------------------------------------------
// E2E: Marketplace Escrow Dispute Tests
// ---------------------------------------------------------------------------

// TestMarketplaceDisputes_CreateAndResolveEscrow creates an escrow,
// completes all milestones, and verifies funds are released.
func TestMarketplaceDisputes_CreateAndResolveEscrow(t *testing.T) {
	f := initMarketFixture(t)
	msgSrv := keeper.NewMsgServerImpl(f.keeper)
	buyer := escrowBuyer()
	seller := escrowSeller()

	escrowID := listSkillAndCreateEscrow(t, f, msgSrv, buyer, seller, 3, 1000)
	t.Logf("Step 1: Escrow created — ID=%d", escrowID)

	// Verify funds locked in module.
	escrow, err := f.keeper.Escrows.Get(f.ctx, escrowID)
	require.NoError(t, err)
	require.Equal(t, "active", escrow.Status)
	require.Equal(t, uint64(3), escrow.Milestones)

	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	sellerBalBefore := f.bankKeeper.balances[sellerAddr.String()].AmountOf("uclaw")

	// Complete all 3 milestones.
	for i := uint64(0); i < 3; i++ {
		_, err := msgSrv.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
			Creator:  buyer,
			EscrowId: escrowID,
		})
		require.NoError(t, err)
		t.Logf("Step 2.%d: Milestone %d completed", i+1, i+1)
	}

	// Verify escrow completed.
	escrow, err = f.keeper.Escrows.Get(f.ctx, escrowID)
	require.NoError(t, err)
	require.Equal(t, "completed", escrow.Status)
	require.Equal(t, uint64(3), escrow.MilestonesComplete)

	// Verify seller received funds.
	sellerBalAfter := f.bankKeeper.balances[sellerAddr.String()].AmountOf("uclaw")
	require.True(t, sellerBalAfter.GT(sellerBalBefore),
		"seller balance should increase after escrow completion")
	t.Log("Step 3: Escrow completed — all funds released to seller")
}

// TestMarketplaceDisputes_BuyerInitiatesDispute tests the buyer disputing
// an escrow and the authority resolving in the buyer's favor.
func TestMarketplaceDisputes_BuyerInitiatesDispute(t *testing.T) {
	f := initMarketFixture(t)
	msgSrv := keeper.NewMsgServerImpl(f.keeper)
	buyer := escrowBuyer()
	seller := escrowSeller()

	escrowID := listSkillAndCreateEscrow(t, f, msgSrv, buyer, seller, 3, 1000)
	t.Logf("Step 1: Escrow created — ID=%d", escrowID)

	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	buyerBalBefore := f.bankKeeper.balances[buyerAddr.String()].AmountOf("uclaw")

	// Buyer disputes.
	_, err := msgSrv.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  buyer,
		EscrowId: escrowID,
		Reason:   "Work not delivered as promised",
	})
	require.NoError(t, err)
	t.Log("Step 2: Buyer initiated dispute")

	// Verify escrow status changed.
	escrow, err := f.keeper.Escrows.Get(f.ctx, escrowID)
	require.NoError(t, err)
	require.Equal(t, "disputed", escrow.Status)

	// Authority resolves in buyer's favor.
	_, err = msgSrv.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: escrowAuthority(),
		EscrowId:  escrowID,
		InFavorOf: buyer,
	})
	require.NoError(t, err)
	t.Log("Step 3: Authority resolved in buyer's favor")

	// Verify escrow refunded.
	escrow, err = f.keeper.Escrows.Get(f.ctx, escrowID)
	require.NoError(t, err)
	require.Equal(t, "refunded", escrow.Status)

	// Verify buyer got refund.
	buyerBalAfter := f.bankKeeper.balances[buyerAddr.String()].AmountOf("uclaw")
	require.True(t, buyerBalAfter.GT(buyerBalBefore),
		"buyer should receive refund after favorable dispute resolution")
	t.Log("Step 4: Buyer refunded")
}

// TestMarketplaceDisputes_SellerWinsDispute tests the authority resolving
// a dispute in the seller's favor.
func TestMarketplaceDisputes_SellerWinsDispute(t *testing.T) {
	f := initMarketFixture(t)
	msgSrv := keeper.NewMsgServerImpl(f.keeper)
	buyer := escrowBuyer()
	seller := escrowSeller()

	escrowID := listSkillAndCreateEscrow(t, f, msgSrv, buyer, seller, 3, 1000)

	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	sellerBalBefore := f.bankKeeper.balances[sellerAddr.String()].AmountOf("uclaw")

	// Buyer disputes.
	_, err := msgSrv.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  buyer,
		EscrowId: escrowID,
		Reason:   "Unsatisfied with delivery",
	})
	require.NoError(t, err)

	// Authority resolves in seller's favor.
	_, err = msgSrv.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: escrowAuthority(),
		EscrowId:  escrowID,
		InFavorOf: seller,
	})
	require.NoError(t, err)

	// Verify escrow completed (seller wins).
	escrow, err := f.keeper.Escrows.Get(f.ctx, escrowID)
	require.NoError(t, err)
	require.Equal(t, "completed", escrow.Status)
	require.Equal(t, escrow.Milestones, escrow.MilestonesComplete)

	// Verify seller received funds.
	sellerBalAfter := f.bankKeeper.balances[sellerAddr.String()].AmountOf("uclaw")
	require.True(t, sellerBalAfter.GT(sellerBalBefore),
		"seller should receive funds after winning dispute")
	t.Log("Seller won dispute — funds released")
}

// TestMarketplaceDisputes_EscrowExpiry tests that an expired escrow
// refunds the buyer automatically.
func TestMarketplaceDisputes_EscrowExpiry(t *testing.T) {
	f := initMarketFixture(t)
	msgSrv := keeper.NewMsgServerImpl(f.keeper)
	buyer := escrowBuyer()
	seller := escrowSeller()

	// Short deadline.
	escrowID := listSkillAndCreateEscrow(t, f, msgSrv, buyer, seller, 2, 10)
	t.Logf("Step 1: Escrow created with 10-block deadline — ID=%d", escrowID)

	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	buyerBalBefore := f.bankKeeper.balances[buyerAddr.String()].AmountOf("uclaw")

	// Advance block height past the deadline.
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)
	f.ctx = sdkCtx.WithBlockHeight(sdkCtx.BlockHeight() + 20)

	// Expire escrows.
	err := f.keeper.ExpireEscrows(f.ctx)
	require.NoError(t, err)
	t.Log("Step 2: ExpireEscrows called after deadline")

	// Verify escrow expired.
	escrow, err := f.keeper.Escrows.Get(f.ctx, escrowID)
	require.NoError(t, err)
	require.Equal(t, "expired", escrow.Status)

	// Verify buyer refunded.
	buyerBalAfter := f.bankKeeper.balances[buyerAddr.String()].AmountOf("uclaw")
	require.True(t, buyerBalAfter.GT(buyerBalBefore),
		"buyer should receive auto-refund on escrow expiry")
	t.Log("Step 3: Buyer auto-refunded after escrow expiry")
}

// TestMarketplaceDisputes_PartialMilestoneCompletion tests that when some
// milestones are completed and a dispute is raised, partial payment was
// already released.
func TestMarketplaceDisputes_PartialMilestoneCompletion(t *testing.T) {
	f := initMarketFixture(t)
	msgSrv := keeper.NewMsgServerImpl(f.keeper)
	buyer := escrowBuyer()
	seller := escrowSeller()

	escrowID := listSkillAndCreateEscrow(t, f, msgSrv, buyer, seller, 3, 1000)
	t.Logf("Step 1: Escrow created with 3 milestones — ID=%d", escrowID)

	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	sellerBalBefore := f.bankKeeper.balances[sellerAddr.String()].AmountOf("uclaw")

	// Complete 2 of 3 milestones.
	for i := 0; i < 2; i++ {
		_, err := msgSrv.CompleteMilestone(f.ctx, &types.MsgCompleteMilestone{
			Creator:  buyer,
			EscrowId: escrowID,
		})
		require.NoError(t, err)
	}
	t.Log("Step 2: Completed 2/3 milestones")

	// Verify seller received partial payment.
	sellerBalAfterPartial := f.bankKeeper.balances[sellerAddr.String()].AmountOf("uclaw")
	require.True(t, sellerBalAfterPartial.GT(sellerBalBefore),
		"seller should have received partial payment for completed milestones")

	// Buyer disputes the 3rd milestone.
	_, err := msgSrv.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  buyer,
		EscrowId: escrowID,
		Reason:   "Third milestone not delivered",
	})
	require.NoError(t, err)
	t.Log("Step 3: Dispute raised on 3rd milestone")

	// Authority resolves in buyer's favor — remaining funds returned.
	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	buyerBalBeforeResolve := f.bankKeeper.balances[buyerAddr.String()].AmountOf("uclaw")

	_, err = msgSrv.ResolveDispute(f.ctx, &types.MsgResolveDispute{
		Authority: escrowAuthority(),
		EscrowId:  escrowID,
		InFavorOf: buyer,
	})
	require.NoError(t, err)

	buyerBalAfterResolve := f.bankKeeper.balances[buyerAddr.String()].AmountOf("uclaw")
	require.True(t, buyerBalAfterResolve.GT(buyerBalBeforeResolve),
		"buyer should receive remaining 1/3 funds after dispute resolution")
	t.Log("Step 4: Remaining funds returned to buyer after dispute")
}

// TestMarketplaceDisputes_ComputeLeaseDispute tests that a GPU lease
// can be disputed by creating an escrow-like scenario.
func TestMarketplaceDisputes_ComputeLeaseDispute(t *testing.T) {
	f := initMarketFixture(t)
	msgSrv := keeper.NewMsgServerImpl(f.keeper)
	buyer := escrowBuyer()
	seller := escrowSeller()

	// Create an escrow representing a compute lease payment.
	escrowID := listSkillAndCreateEscrow(t, f, msgSrv, buyer, seller, 1, 500)

	// Seller disputes — job failed, wants payment for resources used.
	_, err := msgSrv.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  seller,
		EscrowId: escrowID,
		Reason:   "GPU compute delivered but job reported as failed incorrectly",
	})
	require.NoError(t, err)

	// Verify dispute recorded.
	dispute, err := f.keeper.Disputes.Get(f.ctx, escrowID)
	require.NoError(t, err)
	require.Equal(t, "open", dispute.Status)
	require.Equal(t, seller, dispute.Initiator)
	t.Log("Provider initiated dispute — recorded correctly")
}

// TestMarketplaceDisputes_UnauthorizedDisputeRejected tests that a
// non-party address cannot dispute an escrow.
func TestMarketplaceDisputes_UnauthorizedDisputeRejected(t *testing.T) {
	f := initMarketFixture(t)
	msgSrv := keeper.NewMsgServerImpl(f.keeper)
	buyer := escrowBuyer()
	seller := escrowSeller()
	thirdParty := escrowThirdParty()

	escrowID := listSkillAndCreateEscrow(t, f, msgSrv, buyer, seller, 2, 500)

	// Third party tries to dispute — should fail.
	_, err := msgSrv.DisputeEscrow(f.ctx, &types.MsgDisputeEscrow{
		Creator:  thirdParty,
		EscrowId: escrowID,
		Reason:   "I don't like this escrow",
	})
	require.Error(t, err)
	require.ErrorContains(t, err, "not escrow party")
	t.Log("Unauthorized dispute correctly rejected")
}
