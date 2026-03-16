package keeper_test

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/messaging/types"
)

func TestPruneExpiredMessages_NoMessages(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(200000)
	f.ctx = sdkCtx

	err := f.keeper.PruneExpiredMessages(f.ctx)
	require.NoError(t, err)
}

func TestPruneExpiredMessages_TTLDisabled(t *testing.T) {
	f := initFixture(t)

	// Set TTL to 0 (disabled)
	params := types.DefaultParams()
	params.MessageTtlBlocks = 0
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	sendMessage(t, f, validAddress(), validAddress2(), "hello", "n1")

	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(999999)
	f.ctx = sdkCtx

	err := f.keeper.PruneExpiredMessages(f.ctx)
	require.NoError(t, err)

	// Message should still exist
	msg, err := f.keeper.Messages.Get(f.ctx, 0)
	require.NoError(t, err)
	require.Equal(t, "hello", msg.Ciphertext)
}

func TestPruneExpiredMessages_PrunesOldMessages(t *testing.T) {
	f := initFixture(t)

	// Set short TTL
	params := types.DefaultParams()
	params.MessageTtlBlocks = 100
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	// Send message at block 10
	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(10)
	f.ctx = sdkCtx
	sendMessage(t, f, validAddress(), validAddress2(), "old msg", "n1")

	// Send message at block 150
	sdkCtx = sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(150)
	f.ctx = sdkCtx
	sendMessage(t, f, validAddress(), validAddress2(), "new msg", "n2")

	// Prune at block 200 (cutoff = 200 - 100 = 100). Message at block 10 should be pruned.
	sdkCtx = sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(200)
	f.ctx = sdkCtx
	err := f.keeper.PruneExpiredMessages(f.ctx)
	require.NoError(t, err)

	// Old message should be gone
	_, err = f.keeper.Messages.Get(f.ctx, 0)
	require.Error(t, err)

	// New message should remain
	msg, err := f.keeper.Messages.Get(f.ctx, 1)
	require.NoError(t, err)
	require.Equal(t, "new msg", msg.Ciphertext)
}

func TestPruneExpiredMessages_CutoffBeforeZero(t *testing.T) {
	f := initFixture(t)

	// TTL larger than current height → cutoff < 0, no pruning
	params := types.DefaultParams()
	params.MessageTtlBlocks = 1000
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	sendMessage(t, f, validAddress(), validAddress2(), "hello", "n1")

	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(5)
	f.ctx = sdkCtx

	err := f.keeper.PruneExpiredMessages(f.ctx)
	require.NoError(t, err)

	// Message should still exist
	msg, err := f.keeper.Messages.Get(f.ctx, 0)
	require.NoError(t, err)
	require.Equal(t, "hello", msg.Ciphertext)
}
