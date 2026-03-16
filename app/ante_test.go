package app

import (
	"context"
	"testing"
	"time"

	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	storetypes "cosmossdk.io/store/types"
	circuitkeeper "cosmossdk.io/x/circuit/keeper"
	txsigning "cosmossdk.io/x/tx/signing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/x/auth/ante"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	stakingkeeper "github.com/cosmos/cosmos-sdk/x/staking/keeper"

	ibckeeper "github.com/cosmos/ibc-go/v10/modules/core/keeper"

	wasmkeeper "github.com/CosmWasm/wasmd/x/wasm/keeper"
	wasmtypes "github.com/CosmWasm/wasmd/x/wasm/types"

	"github.com/stretchr/testify/require"
)

// --- Mock implementations for ante handler validation tests ---

// mockAccountKeeper satisfies ante.AccountKeeper for constructor validation.
type mockAccountKeeper struct{}

func (m mockAccountKeeper) GetParams(_ context.Context) authtypes.Params { return authtypes.Params{} }
func (m mockAccountKeeper) GetAccount(_ context.Context, _ sdk.AccAddress) sdk.AccountI {
	return nil
}
func (m mockAccountKeeper) SetAccount(_ context.Context, _ sdk.AccountI)             {}
func (m mockAccountKeeper) GetModuleAddress(_ string) sdk.AccAddress                 { return nil }
func (m mockAccountKeeper) AddressCodec() address.Codec                              { return mockAddressCodec{} }
func (m mockAccountKeeper) UnorderedTransactionsEnabled() bool                       { return false }
func (m mockAccountKeeper) RemoveExpiredUnorderedNonces(_ sdk.Context) error         { return nil }
func (m mockAccountKeeper) TryAddUnorderedNonce(_ sdk.Context, _ []byte, _ time.Time) error {
	return nil
}

// mockAddressCodec satisfies the address.Codec interface.
type mockAddressCodec struct{}

func (m mockAddressCodec) StringToBytes(_ string) ([]byte, error)  { return nil, nil }
func (m mockAddressCodec) BytesToString(_ []byte) (string, error)  { return "", nil }

// mockBankKeeper satisfies authtypes.BankKeeper for constructor validation.
type mockBankKeeper struct{}

func (m mockBankKeeper) IsSendEnabledCoins(_ context.Context, _ ...sdk.Coin) error { return nil }
func (m mockBankKeeper) SendCoins(_ context.Context, _, _ sdk.AccAddress, _ sdk.Coins) error {
	return nil
}
func (m mockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, _ sdk.AccAddress, _ string, _ sdk.Coins) error {
	return nil
}

// mockKVStoreService satisfies corestoretypes.KVStoreService for constructor validation.
type mockKVStoreService struct{}

func (m mockKVStoreService) OpenKVStore(_ context.Context) corestore.KVStore { return nil }

// newValidHandlerOptions creates a HandlerOptions with all required fields populated
// using minimal stubs, suitable for testing NewAnteHandler validation logic.
func newValidHandlerOptions() HandlerOptions {
	gasLimit := storetypes.Gas(50_000_000)
	wasmConfig := &wasmtypes.NodeConfig{
		SimulationGasLimit: &gasLimit,
	}

	return HandlerOptions{
		HandlerOptions: ante.HandlerOptions{
			AccountKeeper:   mockAccountKeeper{},
			BankKeeper:      mockBankKeeper{},
			SignModeHandler: &txsigning.HandlerMap{},
		},
		IBCKeeper:             &ibckeeper.Keeper{},
		WasmConfig:            wasmConfig,
		WasmKeeper:            &wasmkeeper.Keeper{},
		TXCounterStoreService: mockKVStoreService{},
		CircuitKeeper:         &circuitkeeper.Keeper{},
		StakingKeeper:         &stakingkeeper.Keeper{},
	}
}

func TestNewAnteHandler_Success(t *testing.T) {
	opts := newValidHandlerOptions()
	handler, err := NewAnteHandler(opts)
	require.NoError(t, err)
	require.NotNil(t, handler)
}

func TestNewAnteHandler_MissingAccountKeeper(t *testing.T) {
	opts := newValidHandlerOptions()
	opts.AccountKeeper = nil
	handler, err := NewAnteHandler(opts)
	require.Error(t, err)
	require.Nil(t, handler)
	require.Contains(t, err.Error(), "account keeper is required")
}

func TestNewAnteHandler_MissingBankKeeper(t *testing.T) {
	opts := newValidHandlerOptions()
	opts.BankKeeper = nil
	handler, err := NewAnteHandler(opts)
	require.Error(t, err)
	require.Nil(t, handler)
	require.Contains(t, err.Error(), "bank keeper is required")
}

func TestNewAnteHandler_MissingSignModeHandler(t *testing.T) {
	opts := newValidHandlerOptions()
	opts.SignModeHandler = nil
	handler, err := NewAnteHandler(opts)
	require.Error(t, err)
	require.Nil(t, handler)
	require.Contains(t, err.Error(), "sign mode handler is required")
}

func TestNewAnteHandler_MissingIBCKeeper(t *testing.T) {
	opts := newValidHandlerOptions()
	opts.IBCKeeper = nil
	handler, err := NewAnteHandler(opts)
	require.Error(t, err)
	require.Nil(t, handler)
	require.Contains(t, err.Error(), "IBC keeper is required")
}

func TestNewAnteHandler_MissingWasmKeeper(t *testing.T) {
	opts := newValidHandlerOptions()
	opts.WasmKeeper = nil
	handler, err := NewAnteHandler(opts)
	require.Error(t, err)
	require.Nil(t, handler)
	require.Contains(t, err.Error(), "wasm keeper is required")
}

func TestNewAnteHandler_MissingWasmConfig(t *testing.T) {
	opts := newValidHandlerOptions()
	opts.WasmConfig = nil
	handler, err := NewAnteHandler(opts)
	require.Error(t, err)
	require.Nil(t, handler)
	require.Contains(t, err.Error(), "wasm config is required")
}

func TestNewAnteHandler_MissingTXCounterStoreService(t *testing.T) {
	opts := newValidHandlerOptions()
	opts.TXCounterStoreService = nil
	handler, err := NewAnteHandler(opts)
	require.Error(t, err)
	require.Nil(t, handler)
	require.Contains(t, err.Error(), "tx counter store service is required")
}

func TestNewAnteHandler_MissingCircuitKeeper(t *testing.T) {
	opts := newValidHandlerOptions()
	opts.CircuitKeeper = nil
	handler, err := NewAnteHandler(opts)
	require.Error(t, err)
	require.Nil(t, handler)
	require.Contains(t, err.Error(), "circuit keeper is required")
}

func TestNewAnteHandler_MissingStakingKeeper(t *testing.T) {
	opts := newValidHandlerOptions()
	opts.StakingKeeper = nil
	handler, err := NewAnteHandler(opts)
	require.Error(t, err)
	require.Nil(t, handler)
	require.Contains(t, err.Error(), "staking keeper is required")
}

func TestNewPostHandler_Success(t *testing.T) {
	opts := newValidHandlerOptions()
	_, err := NewPostHandler(opts)
	require.NoError(t, err)
	// Note: the default SDK post handler returns nil when no post decorators
	// are configured. This is expected behavior for the empty chain.
}
