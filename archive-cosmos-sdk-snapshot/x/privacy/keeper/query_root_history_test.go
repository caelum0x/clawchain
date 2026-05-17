//go:build integration
// +build integration

package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/privacy/keeper"
	"clawchain/x/privacy/types"
)

func TestQueryRootHistoryPagination(t *testing.T) {
	f := initFixtureWithBank(t)
	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	// Add 3 new roots (genesis root is recorded during init).
	_, _, root1, err := f.keeper.AppendCommitment(f.ctx, []byte{0x01})
	require.NoError(t, err)
	_, _, root2, err := f.keeper.AppendCommitment(f.ctx, []byte{0x02})
	require.NoError(t, err)
	_, _, root3, err := f.keeper.AppendCommitment(f.ctx, []byte{0x03})
	require.NoError(t, err)

	q := keeper.NewQueryServerImpl(f.keeper)

	first, err := q.RootHistory(f.ctx, &types.QueryRootHistoryRequest{Offset: 0, Limit: 2})
	require.NoError(t, err)
	require.Len(t, first.Roots, 2)
	require.Equal(t, uint64(2), first.NextOffset)
	require.Equal(t, uint64(4), first.Total)

	second, err := q.RootHistory(f.ctx, &types.QueryRootHistoryRequest{Offset: first.NextOffset, Limit: 10})
	require.NoError(t, err)
	require.Len(t, second.Roots, 2)
	require.Equal(t, uint64(0), second.NextOffset)
	require.Equal(t, uint64(4), second.Total)
	require.Equal(t, root2, second.Roots[0])
	require.Equal(t, root3, second.Roots[1])

	// sanity: immediate roots appear in order as appended
	all, err := q.RootHistory(f.ctx, &types.QueryRootHistoryRequest{Offset: 0, Limit: 10})
	require.NoError(t, err)
	require.Len(t, all.Roots, 4)
	require.Equal(t, root1, all.Roots[1])
	require.Equal(t, root2, all.Roots[2])
	require.Equal(t, root3, all.Roots[3])
}

func TestQueryRootHistoryDefaultLimitAndBounds(t *testing.T) {
	f := initFixtureWithBank(t)
	err := f.keeper.InitGenesis(f.ctx, *types.DefaultGenesis())
	require.NoError(t, err)

	q := keeper.NewQueryServerImpl(f.keeper)

	resp, err := q.RootHistory(f.ctx, &types.QueryRootHistoryRequest{Offset: 99, Limit: 0})
	require.NoError(t, err)
	require.Len(t, resp.Roots, 0)
	require.Equal(t, uint64(0), resp.NextOffset)
	require.Equal(t, uint64(1), resp.Total)

	_, err = q.RootHistory(f.ctx, nil)
	require.Error(t, err)
	require.ErrorContains(t, err, "invalid request")
}
