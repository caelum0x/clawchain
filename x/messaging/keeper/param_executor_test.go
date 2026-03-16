package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUpdateParam_Messaging(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "max_message_size", "8192")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.EqualValues(t, 8192, params.MaxMessageSize)
}

func TestUpdateParam_MessagingUnknownKey(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.UpdateParam(f.ctx, "unknown", "1")
	require.Error(t, err)
	require.Contains(t, err.Error(), "unknown messaging param key")
}
