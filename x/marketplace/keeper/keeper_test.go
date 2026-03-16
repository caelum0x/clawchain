package keeper_test

import (
	"context"
	"testing"

	"cosmossdk.io/core/address"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	"clawchain/x/marketplace/keeper"
	module "clawchain/x/marketplace/module"
	"clawchain/x/marketplace/types"
)

// mockBankKeeper is a minimal mock for testing.
type mockBankKeeper struct {
	balances       map[string]sdk.Coins
	moduleBalances map[string]sdk.Coins
}

func newMockBankKeeper() *mockBankKeeper {
	return &mockBankKeeper{
		balances:       make(map[string]sdk.Coins),
		moduleBalances: make(map[string]sdk.Coins),
	}
}

func (m *mockBankKeeper) FundAccount(addr sdk.AccAddress, coins sdk.Coins) {
	key := addr.String()
	m.balances[key] = m.balances[key].Add(coins...)
}

func (m *mockBankKeeper) SpendableCoins(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	return m.balances[addr.String()]
}

func (m *mockBankKeeper) SendCoins(_ context.Context, from, to sdk.AccAddress, coins sdk.Coins) error {
	fromKey := from.String()
	toKey := to.String()

	fromBal := m.balances[fromKey]
	if !fromBal.IsAllGTE(coins) {
		return types.ErrInsufficientFunds
	}
	m.balances[fromKey] = fromBal.Sub(coins...)
	m.balances[toKey] = m.balances[toKey].Add(coins...)
	return nil
}

func (m *mockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, from sdk.AccAddress, module string, coins sdk.Coins) error {
	fromKey := from.String()
	fromBal := m.balances[fromKey]
	if !fromBal.IsAllGTE(coins) {
		return types.ErrInsufficientFunds
	}
	m.balances[fromKey] = fromBal.Sub(coins...)
	m.moduleBalances[module] = m.moduleBalances[module].Add(coins...)
	return nil
}

func (m *mockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, module string, to sdk.AccAddress, coins sdk.Coins) error {
	moduleBal := m.moduleBalances[module]
	if !moduleBal.IsAllGTE(coins) {
		return types.ErrInsufficientFunds
	}
	m.moduleBalances[module] = moduleBal.Sub(coins...)
	toKey := to.String()
	m.balances[toKey] = m.balances[toKey].Add(coins...)
	return nil
}

type fixture struct {
	ctx          context.Context
	keeper       keeper.Keeper
	addressCodec address.Codec
	bankKeeper   *mockBankKeeper
}

func initFixture(t *testing.T) *fixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)

	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bank := newMockBankKeeper()

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authority,
		bank,
		nil, // agentKeeper (not needed in unit tests)
	)

	// Initialize params
	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	return &fixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addressCodec,
		bankKeeper:   bank,
	}
}
