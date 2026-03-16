package keeper_test

import (
	"context"
	"fmt"
	"testing"

	"cosmossdk.io/core/address"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	"clawchain/x/agent/keeper"
	module "clawchain/x/agent/module"
	"clawchain/x/agent/types"
)

// ---------------------------------------------------------------------------
// Mock BankKeeper
// ---------------------------------------------------------------------------

// mockBankKeeper is a test stub that records deposit operations.
type mockBankKeeper struct {
	// Balances tracks module-held balances per module name.
	moduleBalances map[string]sdk.Coins
	// AccountBalances tracks per-address spendable balances.
	accountBalances map[string]sdk.Coins
	// BurnedCoins accumulates all burned coins.
	BurnedCoins sdk.Coins
}

func newMockBankKeeper() *mockBankKeeper {
	return &mockBankKeeper{
		moduleBalances:  make(map[string]sdk.Coins),
		accountBalances: make(map[string]sdk.Coins),
	}
}

func (m *mockBankKeeper) fundAccount(addr sdk.AccAddress, coins sdk.Coins) {
	key := addr.String()
	m.accountBalances[key] = m.accountBalances[key].Add(coins...)
}

func (m *mockBankKeeper) SpendableCoins(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	return m.accountBalances[addr.String()]
}

func (m *mockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, senderAddr sdk.AccAddress, recipientModule string, amt sdk.Coins) error {
	key := senderAddr.String()
	bal := m.accountBalances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.accountBalances[key] = newBal
	m.moduleBalances[recipientModule] = m.moduleBalances[recipientModule].Add(amt...)
	return nil
}

func (m *mockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error {
	modBal := m.moduleBalances[senderModule]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.moduleBalances[senderModule] = newBal
	key := recipientAddr.String()
	m.accountBalances[key] = m.accountBalances[key].Add(amt...)
	return nil
}

func (m *mockBankKeeper) BurnCoins(_ context.Context, moduleName string, amt sdk.Coins) error {
	modBal := m.moduleBalances[moduleName]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.moduleBalances[moduleName] = newBal
	m.BurnedCoins = m.BurnedCoins.Add(amt...)
	return nil
}

func (m *mockBankKeeper) MintCoins(_ context.Context, moduleName string, amt sdk.Coins) error {
	m.moduleBalances[moduleName] = m.moduleBalances[moduleName].Add(amt...)
	return nil
}

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

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
	bk := newMockBankKeeper()

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authority,
		bk,
		nil, // mintKeeper (not needed in unit tests)
		nil, // reputationKeeper (not needed in unit tests)
	)

	// Initialize params with zero deposit so existing tests don't need funds.
	params := types.DefaultParams()
	params.MinAgentDepositUclaw = 0
	if err := k.Params.Set(ctx, params); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	return &fixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addressCodec,
		bankKeeper:   bk,
	}
}

// mockReputationKeeper returns configurable reputation scores for testing.
type mockReputationKeeper struct {
	scores map[string]uint64 // address → uptimeScoreBps
}

func (m *mockReputationKeeper) GetReputation(_ context.Context, agentAddress string) (uint64, bool, error) {
	score, found := m.scores[agentAddress]
	return score, found, nil
}

// initFixtureWithReputation creates a fixture with a reputation keeper configured.
func initFixtureWithReputation(t *testing.T, scores map[string]uint64) *fixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bk := newMockBankKeeper()
	repKeeper := &mockReputationKeeper{scores: scores}

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authority,
		bk,
		nil, // mintKeeper
		repKeeper,
	)

	params := types.DefaultParams()
	params.MinAgentDepositUclaw = 0
	if err := k.Params.Set(ctx, params); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	return &fixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addressCodec,
		bankKeeper:   bk,
	}
}

// initFixtureWithDeposit creates a fixture where agent registration requires a deposit.
func initFixtureWithDeposit(t *testing.T, depositUclaw uint64) *fixture {
	t.Helper()
	f := initFixture(t)
	params, err := f.keeper.Params.Get(f.ctx)
	if err != nil {
		t.Fatalf("failed to get params: %v", err)
	}
	params.MinAgentDepositUclaw = depositUclaw
	if err := f.keeper.Params.Set(f.ctx, params); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}
	return f
}
