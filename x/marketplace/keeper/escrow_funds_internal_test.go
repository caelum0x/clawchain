package keeper

import (
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/marketplace/types"
)

func TestEscrowFundsHelpers(t *testing.T) {
	escrow := types.EscrowAgreement{
		Amount:             "1000",
		Denom:              "uclaw",
		Milestones:         3,
		MilestonesComplete: 2,
	}

	total, err := escrowTotalCoin(escrow)
	require.NoError(t, err)
	require.EqualValues(t, 1000, total.Amount.Int64())

	released, err := escrowReleasedAmount(escrow)
	require.NoError(t, err)
	require.EqualValues(t, 666, released.Int64())

	remaining, err := escrowRemainingCoin(escrow)
	require.NoError(t, err)
	require.EqualValues(t, 334, remaining.Amount.Int64())

	// Last milestone should pay out the remainder exactly.
	next, err := nextMilestonePayout(escrow)
	require.NoError(t, err)
	require.EqualValues(t, 334, next.Amount.Int64())
}

func TestNextMilestonePayout_Errors(t *testing.T) {
	_, err := nextMilestonePayout(types.EscrowAgreement{
		Amount:     "1000",
		Denom:      "uclaw",
		Milestones: 0,
	})
	require.Error(t, err)

	_, err = nextMilestonePayout(types.EscrowAgreement{
		Amount:             "1000",
		Denom:              "uclaw",
		Milestones:         2,
		MilestonesComplete: 2,
	})
	require.Error(t, err)

	_, err = nextMilestonePayout(types.EscrowAgreement{
		Amount:             "bad",
		Denom:              "uclaw",
		Milestones:         2,
		MilestonesComplete: 0,
	})
	require.Error(t, err)

	_, err = escrowReleasedAmount(types.EscrowAgreement{
		Amount:             "1000",
		Denom:              "uclaw",
		Milestones:         0,
		MilestonesComplete: 0,
	})
	require.Error(t, err)
}
