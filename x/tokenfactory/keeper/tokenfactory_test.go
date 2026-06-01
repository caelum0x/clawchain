package keeper_test

import (
	"context"
	"testing"

	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/tokenfactory/keeper"
	"clawchain/x/tokenfactory/types"
)

// ---- test addresses --------------------------------------------------------

var (
	testCreator  = sdk.AccAddress([]byte("creator1____________")).String()
	testCreator2 = sdk.AccAddress([]byte("creator2____________")).String()
)

// ---- mock bank keeper ------------------------------------------------------

type mockBankKeeper struct {
	mintCalled                    bool
	burnCalled                    bool
	sendFromModuleToAccountCalled bool
	sendFromAccountToModuleCalled bool
	lastMintModule                string
	lastMintCoins                 sdk.Coins
	lastBurnModule                string
	lastBurnCoins                 sdk.Coins
}

func (m *mockBankKeeper) MintCoins(_ context.Context, moduleName string, amounts sdk.Coins) error {
	m.mintCalled = true
	m.lastMintModule = moduleName
	m.lastMintCoins = amounts
	return nil
}

func (m *mockBankKeeper) BurnCoins(_ context.Context, moduleName string, amounts sdk.Coins) error {
	m.burnCalled = true
	m.lastBurnModule = moduleName
	m.lastBurnCoins = amounts
	return nil
}

func (m *mockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, _ string, _ sdk.AccAddress, _ sdk.Coins) error {
	m.sendFromModuleToAccountCalled = true
	return nil
}

func (m *mockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, _ sdk.AccAddress, _ string, _ sdk.Coins) error {
	m.sendFromAccountToModuleCalled = true
	return nil
}

// ---- test setup ------------------------------------------------------------

func setupTokenFactoryKeeper(t *testing.T) (keeper.Keeper, sdk.Context, *mockBankKeeper) {
	t.Helper()

	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx
	storeService := runtime.NewKVStoreService(storeKey)

	bk := &mockBankKeeper{}
	ac := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	authority := authtypes.NewModuleAddress(types.GovModuleName)

	k := keeper.NewKeeper(
		storeService,
		ac,
		authority,
		bk,
	)

	return k, ctx, bk
}

// ---- CreateDenom tests -----------------------------------------------------

func TestCreateDenom(t *testing.T) {
	k, ctx, _ := setupTokenFactoryKeeper(t)

	denom, err := k.CreateDenom(ctx, testCreator, "mytoken")
	require.NoError(t, err)
	require.Equal(t, "factory/"+testCreator+"/mytoken", denom)

	// Verify admin is set
	admin, err := k.DenomAdmins.Get(ctx, denom)
	require.NoError(t, err)
	require.Equal(t, testCreator, admin)
}

func TestCreateDenomDuplicate(t *testing.T) {
	k, ctx, _ := setupTokenFactoryKeeper(t)

	_, err := k.CreateDenom(ctx, testCreator, "dup")
	require.NoError(t, err)

	// Creating the same denom again should fail
	_, err = k.CreateDenom(ctx, testCreator, "dup")
	require.Error(t, err)
	require.Contains(t, err.Error(), "already exists")
}

// ---- MintTo tests ----------------------------------------------------------

func TestMintTo(t *testing.T) {
	k, ctx, bk := setupTokenFactoryKeeper(t)

	denom, err := k.CreateDenom(ctx, testCreator, "mintable")
	require.NoError(t, err)

	coin := sdk.NewInt64Coin(denom, 1000)
	err = k.MintTo(ctx, testCreator, coin, testCreator)
	require.NoError(t, err)

	// Verify bank mock was called
	require.True(t, bk.mintCalled)
	require.Equal(t, types.ModuleName, bk.lastMintModule)
	require.True(t, bk.sendFromModuleToAccountCalled)
}

func TestMintToUnauthorized(t *testing.T) {
	k, ctx, _ := setupTokenFactoryKeeper(t)

	denom, err := k.CreateDenom(ctx, testCreator, "restricted")
	require.NoError(t, err)

	// Try minting from a non-admin
	coin := sdk.NewInt64Coin(denom, 500)
	err = k.MintTo(ctx, testCreator2, coin, testCreator2)
	require.Error(t, err)
	require.Contains(t, err.Error(), "not the admin")
}

// ---- BurnFrom tests --------------------------------------------------------

func TestBurnFrom(t *testing.T) {
	k, ctx, bk := setupTokenFactoryKeeper(t)

	denom, err := k.CreateDenom(ctx, testCreator, "burnable")
	require.NoError(t, err)

	coin := sdk.NewInt64Coin(denom, 500)
	err = k.BurnFrom(ctx, testCreator, coin, testCreator)
	require.NoError(t, err)

	// Verify bank mock was called
	require.True(t, bk.sendFromAccountToModuleCalled)
	require.True(t, bk.burnCalled)
	require.Equal(t, types.ModuleName, bk.lastBurnModule)
}

func TestBurnFromSelfBurnByNonAdmin(t *testing.T) {
	k, ctx, _ := setupTokenFactoryKeeper(t)

	denom, err := k.CreateDenom(ctx, testCreator, "selfburn")
	require.NoError(t, err)

	coin := sdk.NewInt64Coin(denom, 100)
	err = k.BurnFrom(ctx, testCreator2, coin, testCreator2)
	require.NoError(t, err)
}

func TestBurnFromUnauthorizedOtherAccount(t *testing.T) {
	k, ctx, _ := setupTokenFactoryKeeper(t)

	denom, err := k.CreateDenom(ctx, testCreator, "noburn")
	require.NoError(t, err)

	coin := sdk.NewInt64Coin(denom, 100)
	err = k.BurnFrom(ctx, testCreator2, coin, testCreator)
	require.Error(t, err)
	require.Contains(t, err.Error(), "cannot burn")
}

// ---- SetBeforeSendHook tests -----------------------------------------------

func TestSetBeforeSendHook(t *testing.T) {
	k, ctx, _ := setupTokenFactoryKeeper(t)

	denom, err := k.CreateDenom(ctx, testCreator, "hooked")
	require.NoError(t, err)

	contractAddr := "claw1contractaddress"
	err = k.SetBeforeSendHook(ctx, testCreator, denom, contractAddr)
	require.NoError(t, err)

	// Verify hook is stored
	stored, err := k.BeforeSendHooks.Get(ctx, denom)
	require.NoError(t, err)
	require.Equal(t, contractAddr, stored)
}

func TestSetBeforeSendHookUnauthorized(t *testing.T) {
	k, ctx, _ := setupTokenFactoryKeeper(t)

	denom, err := k.CreateDenom(ctx, testCreator, "hookfail")
	require.NoError(t, err)

	err = k.SetBeforeSendHook(ctx, testCreator2, denom, "claw1somecontract")
	require.Error(t, err)
	require.Contains(t, err.Error(), "not the admin")
}
