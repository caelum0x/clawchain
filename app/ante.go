package app

import (
	corestoretypes "cosmossdk.io/core/store"
	circuitante "cosmossdk.io/x/circuit/ante"
	circuitkeeper "cosmossdk.io/x/circuit/keeper"

	sdk "github.com/cosmos/cosmos-sdk/types"
	sdkerrors "github.com/cosmos/cosmos-sdk/types/errors"
	"github.com/cosmos/cosmos-sdk/x/auth/ante"
	"github.com/cosmos/cosmos-sdk/x/auth/posthandler"
	stakingkeeper "github.com/cosmos/cosmos-sdk/x/staking/keeper"

	ibcante "github.com/cosmos/ibc-go/v10/modules/core/ante"
	ibckeeper "github.com/cosmos/ibc-go/v10/modules/core/keeper"

	wasmkeeper "github.com/CosmWasm/wasmd/x/wasm/keeper"
	wasmtypes "github.com/CosmWasm/wasmd/x/wasm/types"

	errorsmod "cosmossdk.io/errors"
)

// HandlerOptions extends the SDK's AnteHandler options with additional keepers
// required by ClawChain's IBC, CosmWasm, and circuit breaker modules.
type HandlerOptions struct {
	ante.HandlerOptions

	IBCKeeper             *ibckeeper.Keeper
	WasmConfig            *wasmtypes.NodeConfig
	WasmKeeper            *wasmkeeper.Keeper
	TXCounterStoreService corestoretypes.KVStoreService
	CircuitKeeper         *circuitkeeper.Keeper
	StakingKeeper         *stakingkeeper.Keeper
}

// NewAnteHandler creates the full ante handler chain for ClawChain.
//
// The decorator ordering follows the established pattern for Cosmos SDK chains
// with IBC and CosmWasm support:
//
//  1. SetUpContextDecorator          - sets up the GasMeter on the context
//  2. WasmLimitSimulationGasDecorator - caps gas for wasm simulation calls
//  3. WasmCountTXDecorator           - tracks tx position in block for wasm
//  4. WasmGasRegisterDecorator       - injects wasm gas register into ctx
//  5. WasmTxContractsDecorator       - tracks per-tx contract access
//  6. CircuitBreakerDecorator         - blocks disabled message types
//  7. ExtensionOptionsDecorator       - rejects unknown extension options
//  8. ValidateBasicDecorator          - stateless tx validation
//  9. TxTimeoutHeightDecorator        - rejects txs past timeout height
//  10. ValidateMemoDecorator          - validates memo length
//  11. ConsumeGasForTxSizeDecorator   - charges gas proportional to tx size
//  12. DeductFeeDecorator             - deducts fees from first signer
//  13. SetPubKeyDecorator             - stores pubkeys on first tx
//  14. ValidateSigCountDecorator      - checks total signature count
//  15. SigGasConsumeDecorator         - charges gas for signature verification
//  16. SigVerificationDecorator       - verifies tx signatures
//  17. IncrementSequenceDecorator     - bumps account sequence numbers
//  18. IBCRedundantRelayDecorator     - rejects redundant IBC relay txs
func NewAnteHandler(options HandlerOptions) (sdk.AnteHandler, error) {
	if options.AccountKeeper == nil {
		return nil, errorsmod.Wrap(sdkerrors.ErrLogic, "account keeper is required for ante builder")
	}

	if options.BankKeeper == nil {
		return nil, errorsmod.Wrap(sdkerrors.ErrLogic, "bank keeper is required for ante builder")
	}

	if options.SignModeHandler == nil {
		return nil, errorsmod.Wrap(sdkerrors.ErrLogic, "sign mode handler is required for ante builder")
	}

	if options.IBCKeeper == nil {
		return nil, errorsmod.Wrap(sdkerrors.ErrLogic, "IBC keeper is required for ante builder")
	}

	if options.WasmKeeper == nil {
		return nil, errorsmod.Wrap(sdkerrors.ErrLogic, "wasm keeper is required for ante builder")
	}

	if options.WasmConfig == nil {
		return nil, errorsmod.Wrap(sdkerrors.ErrLogic, "wasm config is required for ante builder")
	}

	if options.TXCounterStoreService == nil {
		return nil, errorsmod.Wrap(sdkerrors.ErrLogic, "tx counter store service is required for ante builder")
	}

	if options.CircuitKeeper == nil {
		return nil, errorsmod.Wrap(sdkerrors.ErrLogic, "circuit keeper is required for ante builder")
	}

	if options.StakingKeeper == nil {
		return nil, errorsmod.Wrap(sdkerrors.ErrLogic, "staking keeper is required for ante builder")
	}

	anteDecorators := []sdk.AnteDecorator{
		// 1. Outermost: sets up the gas meter on the context.
		ante.NewSetUpContextDecorator(),

		// 2-5. CosmWasm ante decorators.
		wasmkeeper.NewLimitSimulationGasDecorator(options.WasmConfig.SimulationGasLimit),
		wasmkeeper.NewCountTXDecorator(options.TXCounterStoreService),
		wasmkeeper.NewGasRegisterDecorator(options.WasmKeeper.GetGasRegister()),
		wasmkeeper.NewTxContractsDecorator(),

		// 6. Circuit breaker: blocks disabled message types.
		circuitante.NewCircuitBreakerDecorator(options.CircuitKeeper),

		// 7-11. Standard Cosmos SDK ante decorators.
		ante.NewExtensionOptionsDecorator(options.ExtensionOptionChecker),
		ante.NewValidateBasicDecorator(),
		ante.NewTxTimeoutHeightDecorator(),
		ante.NewValidateMemoDecorator(options.AccountKeeper),
		ante.NewConsumeGasForTxSizeDecorator(options.AccountKeeper),

		// 12. Fee deduction with optional feegrant support.
		ante.NewDeductFeeDecorator(options.AccountKeeper, options.BankKeeper, options.FeegrantKeeper, options.TxFeeChecker),

		// 13-16. Signature handling.
		ante.NewSetPubKeyDecorator(options.AccountKeeper),
		ante.NewValidateSigCountDecorator(options.AccountKeeper),
		ante.NewSigGasConsumeDecorator(options.AccountKeeper, options.SigGasConsumer),
		ante.NewSigVerificationDecorator(options.AccountKeeper, options.SignModeHandler, options.SigVerifyOptions...),

		// 17. Sequence increment.
		ante.NewIncrementSequenceDecorator(options.AccountKeeper),

		// 18. IBC: rejects redundant relay transactions to save relayer fees.
		ibcante.NewRedundantRelayDecorator(options.IBCKeeper),
	}

	return sdk.ChainAnteDecorators(anteDecorators...), nil
}

// NewPostHandler returns the post handler chain for ClawChain.
// Currently uses the default SDK empty post handler chain. Additional
// post-processing decorators (e.g., tips, MEV) can be added here.
func NewPostHandler(_ HandlerOptions) (sdk.PostHandler, error) {
	return posthandler.NewPostHandler(posthandler.HandlerOptions{})
}
