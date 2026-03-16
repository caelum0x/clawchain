package keeper_test

import (
	"context"
	"testing"

	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"

	"clawchain/x/oracle/keeper"
	"clawchain/x/oracle/types"
)

// Test constants for validators and feeder addresses.
var (
	testValidator  = sdk.AccAddress([]byte("validator1__________")).String()
	testValidator2 = sdk.AccAddress([]byte("validator2__________")).String()
	testValidator3 = sdk.AccAddress([]byte("validator3__________")).String()
	testFeeder     = sdk.AccAddress([]byte("feeder1_____________")).String()
)

// mockStakingKeeper implements types.StakingKeeper for tests.
type mockStakingKeeper struct {
	validators []stakingtypes.Validator
}

func (m *mockStakingKeeper) GetBondedValidatorsByPower(_ context.Context) ([]stakingtypes.Validator, error) {
	return m.validators, nil
}

func (m *mockStakingKeeper) GetValidator(_ context.Context, _ sdk.ValAddress) (stakingtypes.Validator, error) {
	return stakingtypes.Validator{}, nil
}

// setupOracleKeeper creates a test keeper with a fresh in-memory store.
func setupOracleKeeper(t *testing.T) (keeper.Keeper, context.Context) {
	t.Helper()

	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	// Mock staking keeper with 3 test validators
	sk := &mockStakingKeeper{
		validators: []stakingtypes.Validator{
			{OperatorAddress: testValidator},
			{OperatorAddress: testValidator2},
			{OperatorAddress: testValidator3},
		},
	}

	k := keeper.NewKeeper(
		storeService,
		nil, // codec not needed for JSON-based storage
		[]byte("authority"),
		sk,
		nil, // bankKeeper not needed in unit tests
	)

	// Initialize params
	if err := k.SetParams(ctx, types.DefaultParams); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	return k, ctx
}
