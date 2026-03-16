package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/x/privacy/types"
)

func TestMinShieldAmount_Default(t *testing.T) {
	minAmount := types.GetMinShieldAmount()
	require.Equal(t, uint64(1000), minAmount)
}

func TestAutoShieldThreshold_Default(t *testing.T) {
	threshold := types.GetAutoShieldThreshold()
	require.Equal(t, uint64(0), threshold)
}

func TestAutoShieldMode_Default(t *testing.T) {
	mode := types.GetAutoShieldMode()
	require.Equal(t, "memo_only", mode)
}
