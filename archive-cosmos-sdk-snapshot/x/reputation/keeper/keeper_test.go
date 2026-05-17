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

	"clawchain/x/reputation/keeper"
	module "clawchain/x/reputation/module"
	"clawchain/x/reputation/types"
)

type mockAgentKeeper struct {
	registered map[string]bool
	err        error
}

func (m *mockAgentKeeper) IsAgentRegistered(_ context.Context, address string) (bool, error) {
	if m.err != nil {
		return false, m.err
	}
	return m.registered[address], nil
}

func (m *mockAgentKeeper) GetMaxHeartbeatGapBlocks(_ context.Context) (int64, error) {
	return 100, m.err
}

func (m *mockAgentKeeper) WalkHeartbeatStatuses(_ context.Context, walkFn func(string, int64) (bool, error)) error {
	return nil
}

func (m *mockAgentKeeper) WalkCompletedTaskSLAEvents(_ context.Context, _ uint64, walkFn func(uint64, string, bool, int64) (bool, error)) error {
	return nil
}

func (m *mockAgentKeeper) GetDepositSlashBps(_ context.Context) (uint64, error) {
	return 100, m.err
}

func (m *mockAgentKeeper) SlashAgentDeposit(_ context.Context, _ string, _ uint64) error {
	return m.err
}

type mockMarketplaceKeeper struct {
	purchased map[string]bool
	err       error
}

func purchaseKey(buyer, seller string) string {
	return buyer + "|" + seller
}

func (m *mockMarketplaceKeeper) HasPurchased(_ context.Context, buyer, seller string) (bool, error) {
	if m.err != nil {
		return false, m.err
	}
	return m.purchased[purchaseKey(buyer, seller)], nil
}

type fixture struct {
	ctx               context.Context
	keeper            keeper.Keeper
	addressCodec      address.Codec
	agentKeeper       *mockAgentKeeper
	marketplaceKeeper *mockMarketplaceKeeper
}

func initFixture(t *testing.T) *fixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	authority := authtypes.NewModuleAddress(types.GovModuleName)

	agentKeeper := &mockAgentKeeper{registered: make(map[string]bool)}
	marketplaceKeeper := &mockMarketplaceKeeper{purchased: make(map[string]bool)}

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authority,
		agentKeeper,
		marketplaceKeeper,
	)

	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	return &fixture{
		ctx:               ctx,
		keeper:            k,
		addressCodec:      addressCodec,
		agentKeeper:       agentKeeper,
		marketplaceKeeper: marketplaceKeeper,
	}
}
