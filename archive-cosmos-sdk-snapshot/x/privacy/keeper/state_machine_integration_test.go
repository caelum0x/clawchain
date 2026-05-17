//go:build integration
// +build integration

package keeper_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/privacy/types"
)

func TestRootHistoryTracksGenesisAndTransitions(t *testing.T) {
	f := initFixtureWithBank(t)

	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	count, err := f.keeper.RootHistoryCount.Peek(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(1), count)

	genesisRoot, err := f.keeper.RootHistory.Get(f.ctx, 0)
	require.NoError(t, err)
	require.NotEmpty(t, genesisRoot)

	_, _, root1, err := f.keeper.AppendCommitment(f.ctx, []byte{0x01, 0x02, 0x03})
	require.NoError(t, err)
	_, _, root2, err := f.keeper.AppendCommitment(f.ctx, []byte{0x04, 0x05, 0x06})
	require.NoError(t, err)
	require.NotEqual(t, root1, root2)

	count, err = f.keeper.RootHistoryCount.Peek(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(3), count)

	rootAt1, err := f.keeper.RootHistory.Get(f.ctx, 1)
	require.NoError(t, err)
	require.Equal(t, root1, rootAt1)

	rootAt2, err := f.keeper.RootHistory.Get(f.ctx, 2)
	require.NoError(t, err)
	require.Equal(t, root2, rootAt2)
}

func TestAppendCommitmentRejectsDuplicates(t *testing.T) {
	f := initFixtureWithBank(t)
	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	_, commitmentHex, _, err := f.keeper.AppendCommitment(f.ctx, []byte{0xAA, 0xBB, 0xCC})
	require.NoError(t, err)
	require.NotEmpty(t, commitmentHex)

	_, _, _, err = f.keeper.AppendCommitment(f.ctx, []byte{0xAA, 0xBB, 0xCC})
	require.Error(t, err)
	require.ErrorContains(t, err, "duplicate commitment")

	idx, err := f.keeper.CommitmentIndex.Get(f.ctx, commitmentHex)
	require.NoError(t, err)
	require.Equal(t, uint64(0), idx)
}

func TestConsumeNullifiersCanonicalizationAndDoubleSpend(t *testing.T) {
	f := initFixtureWithBank(t)
	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	err = f.keeper.ConsumeNullifiers(f.ctx, []string{" 0A0B ", "0c0d"})
	require.NoError(t, err)

	existsA, err := f.keeper.Nullifiers.Has(f.ctx, "0a0b")
	require.NoError(t, err)
	require.True(t, existsA)

	existsB, err := f.keeper.Nullifiers.Has(f.ctx, "0c0d")
	require.NoError(t, err)
	require.True(t, existsB)

	err = f.keeper.ConsumeNullifiers(f.ctx, []string{"0A0B"})
	require.Error(t, err)
	require.ErrorContains(t, err, "nullifier")
}

func TestValidateKnownRootCanonicalization(t *testing.T) {
	f := initFixtureWithBank(t)
	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	root0, err := f.keeper.RootHistory.Get(f.ctx, 0)
	require.NoError(t, err)
	require.NotEmpty(t, root0)

	validated, err := f.keeper.ValidateKnownRoot(f.ctx, "  "+strings.ToUpper(root0)+"  ")
	require.NoError(t, err)
	require.Equal(t, root0, validated)
}
