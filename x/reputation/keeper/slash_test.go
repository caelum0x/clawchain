package keeper_test

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/reputation/types"
)

func slashTestAddr() string {
	return sdk.AccAddress([]byte("slashtarget_________")).String()
}

// TestSlashReputationReducesScore verifies a slash decrements the stored score.
func TestSlashReputationReducesScore(t *testing.T) {
	f := initFixture(t)
	addr := slashTestAddr()

	require.NoError(t, f.keeper.Reputations.Set(f.ctx, addr, types.ReputationRecord{
		AgentAddress:   addr,
		UptimeScoreBps: 10000,
	}))

	require.NoError(t, f.keeper.SlashReputation(f.ctx, addr, 1))

	score, found, err := f.keeper.GetReputation(f.ctx, addr)
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, uint64(9999), score)
}

// TestSlashReputationFloorsAtZero verifies a slash larger than the score
// saturates to 0 rather than underflowing the uint64.
func TestSlashReputationFloorsAtZero(t *testing.T) {
	f := initFixture(t)
	addr := slashTestAddr()

	require.NoError(t, f.keeper.Reputations.Set(f.ctx, addr, types.ReputationRecord{
		AgentAddress:   addr,
		UptimeScoreBps: 5,
	}))

	require.NoError(t, f.keeper.SlashReputation(f.ctx, addr, 100))

	score, found, err := f.keeper.GetReputation(f.ctx, addr)
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, uint64(0), score)

	// Slashing an already-zero score stays at 0 (idempotent floor).
	require.NoError(t, f.keeper.SlashReputation(f.ctx, addr, 100))
	score, _, err = f.keeper.GetReputation(f.ctx, addr)
	require.NoError(t, err)
	require.Equal(t, uint64(0), score)
}

// TestSlashReputationUnknownAddressIsNoOp verifies slashing an address with no
// stored reputation does not error and matches GetReputation's missing-handling
// (an implicit score of 0).
func TestSlashReputationUnknownAddressIsNoOp(t *testing.T) {
	f := initFixture(t)
	addr := slashTestAddr()

	require.NoError(t, f.keeper.SlashReputation(f.ctx, addr, 50))

	score, found, err := f.keeper.GetReputation(f.ctx, addr)
	require.NoError(t, err)
	// Missing record: GetReputation reports not-found with score 0; the slash
	// did not create a record.
	require.False(t, found)
	require.Equal(t, uint64(0), score)
}
