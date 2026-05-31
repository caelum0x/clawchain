package app

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"cosmossdk.io/log"
	"cosmossdk.io/math"
	abci "github.com/cometbft/cometbft/abci/types"
	cmtproto "github.com/cometbft/cometbft/proto/tendermint/types"
	dbm "github.com/cosmos/cosmos-db"
	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client/flags"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	simtestutil "github.com/cosmos/cosmos-sdk/testutil/sims"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	"github.com/stretchr/testify/require"
)

const TestChainID = "clawchain-test-1"

// newTestApp creates a new App instance for tests. Construction must succeed:
// if app.New panics (e.g. a module is misconfigured in depinject wiring), that
// is a real defect — the chain would not boot — so the test fails loudly rather
// than skipping. (This previously recover()ed and t.Skip()ed, which silently
// hid the fact that the chain could not start.)
func newTestApp(t *testing.T, appOptions simtestutil.AppOptionsMap) (application *App) {
	t.Helper()

	db := dbm.NewMemDB()
	application = New(
		log.NewNopLogger(),
		db,
		nil,
		true,
		appOptions,
		baseapp.SetChainID(TestChainID),
	)
	return application
}

// Setup creates a new ClawChain app instance suitable for testing.
// If isCheckTx is true the app is initialised in CheckTx mode (no
// InitChain is called), which is useful for unit-testing message
// validation without setting up full genesis state.
func Setup(t *testing.T, isCheckTx bool) *App {
	t.Helper()

	appOptions := make(simtestutil.AppOptionsMap)
	appOptions[flags.FlagHome] = t.TempDir()

	application := newTestApp(t, appOptions)
	if application == nil {
		return nil
	}

	if !isCheckTx {
		// Provide a minimal genesis with one validator so InitChain succeeds.
		genesisState := application.DefaultGenesis()
		genesisState, err := addTestValidator(genesisState, application)
		require.NoError(t, err)

		stateBytes, err := json.MarshalIndent(genesisState, "", "  ")
		require.NoError(t, err)

		initResp, err := application.InitChain(&abci.RequestInitChain{
			ChainId:         TestChainID,
			Validators:      []abci.ValidatorUpdate{},
			ConsensusParams: simtestutil.DefaultConsensusParams,
			AppStateBytes:   stateBytes,
			Time:            time.Now(),
		})
		require.NoError(t, err)

		// Finalize the first block (ABCI 2.0) so the InitGenesis writes are
		// flushed into committed state, then commit. Skipping FinalizeBlock and
		// committing directly leaves collection-backed module params (agent,
		// mint, wasm, …) unpersisted and breaks genesis export.
		_, err = application.FinalizeBlock(&abci.RequestFinalizeBlock{
			Height: 1,
			Hash:   initResp.AppHash,
			Time:   time.Now(),
		})
		require.NoError(t, err)

		// Commit the initial block so queries work.
		_, err = application.Commit()
		require.NoError(t, err)
	}

	return application
}

// SetupWithGenesisAccounts creates a ClawChain app initialised with the
// given genesis accounts and balances. This is useful for tests that need
// funded accounts in genesis.
func SetupWithGenesisAccounts(t *testing.T, genAccs []authtypes.GenesisAccount, balances ...banktypes.Balance) *App {
	t.Helper()

	appOptions := make(simtestutil.AppOptionsMap)
	appOptions[flags.FlagHome] = t.TempDir()

	application := newTestApp(t, appOptions)
	if application == nil {
		return nil
	}

	genesisState := application.DefaultGenesis()

	// Add the provided genesis accounts to auth genesis.
	authGenesis := authtypes.DefaultGenesisState()
	accounts, err := authtypes.PackAccounts(genAccs)
	require.NoError(t, err)
	authGenesis.Accounts = accounts

	authGenBz, err := application.AppCodec().MarshalJSON(authGenesis)
	require.NoError(t, err)
	genesisState[authtypes.ModuleName] = authGenBz

	// Compute total supply from all balances and set bank genesis.
	totalSupply := sdk.NewCoins()
	for _, b := range balances {
		totalSupply = totalSupply.Add(b.Coins...)
	}

	bankGenesis := banktypes.DefaultGenesisState()
	bankGenesis.Balances = balances
	bankGenesis.Supply = totalSupply

	bankGenBz, err := application.AppCodec().MarshalJSON(bankGenesis)
	require.NoError(t, err)
	genesisState[banktypes.ModuleName] = bankGenBz

	// Add a default validator so InitChain does not fail.
	genesisState, err = addTestValidator(genesisState, application)
	require.NoError(t, err)

	stateBytes, err := json.MarshalIndent(genesisState, "", "  ")
	require.NoError(t, err)

	initResp, err := application.InitChain(&abci.RequestInitChain{
		ChainId:         TestChainID,
		Validators:      []abci.ValidatorUpdate{},
		ConsensusParams: simtestutil.DefaultConsensusParams,
		AppStateBytes:   stateBytes,
		Time:            time.Now(),
	})
	require.NoError(t, err)

	// Finalize block 1 so InitGenesis writes are flushed before committing
	// (see Setup for why direct InitChain→Commit leaves module params unpersisted).
	_, err = application.FinalizeBlock(&abci.RequestFinalizeBlock{
		Height: 1,
		Hash:   initResp.AppHash,
		Time:   time.Now(),
	})
	require.NoError(t, err)

	_, err = application.Commit()
	require.NoError(t, err)

	return application
}

// NewContextForTest returns a cached context at the current block height.
func NewContextForTest(app *App) sdk.Context {
	// Use the check state (isCheckTx=true): it reflects committed state and is
	// non-nil after Commit, whereas finalizeBlockState is cleared on Commit and
	// would nil-pointer here.
	return app.NewContextLegacy(true, cmtproto.Header{
		Height:  app.LastBlockHeight(),
		ChainID: TestChainID,
		Time:    time.Now(),
	})
}

// addTestValidator adds a single validator to the staking genesis so
// that InitChain succeeds without "validator set is empty" errors.
func addTestValidator(genesisState GenesisState, application *App) (GenesisState, error) {
	privKey := secp256k1.GenPrivKey()
	pubKey := privKey.PubKey()
	pkAny, err := codectypes.NewAnyWithValue(pubKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create Any from pubkey: %w", err)
	}

	validator := stakingtypes.Validator{
		OperatorAddress: sdk.ValAddress(pubKey.Address()).String(),
		ConsensusPubkey: pkAny,
		Jailed:          false,
		Status:          stakingtypes.Bonded,
		Tokens:          math.NewInt(1_000_000),
		DelegatorShares: math.LegacyOneDec(),
		Description:     stakingtypes.NewDescription("test-validator", "", "", "", ""),
		Commission: stakingtypes.NewCommission(
			math.LegacyNewDecWithPrec(1, 1),
			math.LegacyNewDecWithPrec(2, 1),
			math.LegacyNewDecWithPrec(1, 2),
		),
		MinSelfDelegation: math.OneInt(),
	}

	stakingGenesis := stakingtypes.DefaultGenesisState()
	stakingGenesis.Params.BondDenom = "uclaw"
	stakingGenesis.Validators = []stakingtypes.Validator{validator}

	stakingGenBz, err := application.AppCodec().MarshalJSON(stakingGenesis)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal staking genesis: %w", err)
	}
	genesisState[stakingtypes.ModuleName] = stakingGenBz

	// staking InitGenesis requires the bonded pool module account balance to
	// equal the bonded validators' tokens, otherwise it rejects the genesis as
	// malformed. Fund the bonded pool to match the validator above, merging into
	// any bank genesis already present (e.g. from SetupWithGenesisAccounts).
	bondedCoins := sdk.NewCoins(sdk.NewCoin("uclaw", validator.Tokens))
	bankGenesis := banktypes.DefaultGenesisState()
	if existing, ok := genesisState[banktypes.ModuleName]; ok {
		if err := application.AppCodec().UnmarshalJSON(existing, bankGenesis); err != nil {
			return nil, fmt.Errorf("failed to unmarshal bank genesis: %w", err)
		}
	}
	bankGenesis.Balances = append(bankGenesis.Balances, banktypes.Balance{
		Address: authtypes.NewModuleAddress(stakingtypes.BondedPoolName).String(),
		Coins:   bondedCoins,
	})
	bankGenesis.Supply = bankGenesis.Supply.Add(bondedCoins...)
	bankGenBz, err := application.AppCodec().MarshalJSON(bankGenesis)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal bank genesis: %w", err)
	}
	genesisState[banktypes.ModuleName] = bankGenBz

	return genesisState, nil
}
