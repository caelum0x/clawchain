package keepers

import (
	wasmkeeper "github.com/CosmWasm/wasmd/x/wasm/keeper"
	wasmtypes "github.com/CosmWasm/wasmd/x/wasm/types"
)

// WasmConfig returns the default wasm keeper configuration for ClawChain.
// This provides sensible defaults for CosmWasm contract execution limits.
// In production the values are typically overridden by app.toml [wasm] section
// via wasm.ReadNodeConfig(appOpts), but these defaults serve as a baseline
// and are used in tests.
func WasmConfig() wasmtypes.NodeConfig {
	cfg := wasmtypes.DefaultNodeConfig()
	// ClawChain defaults: contracts can use up to 512MB of memory.
	// This is generous enough for DEX pair contracts and privacy circuits
	// while still protecting validators from OOM attacks.
	cfg.MemoryCacheSize = 512
	return cfg
}

// WasmCapabilities returns the set of capabilities that ClawChain's Wasm
// runtime supports. These are passed to wasmkeeper.NewKeeper and determine
// which host functions are available to CosmWasm contracts.
//
// "token_factory" is a ClawChain-specific capability that allows contracts
// to create and manage factory-denominated tokens via the tokenfactory module.
func WasmCapabilities() []string {
	return append(wasmkeeper.BuiltInCapabilities(), "token_factory")
}

// AllowedWasmContractLabels returns contract labels permitted on ClawChain.
// These labels are used for on-chain identification of pre-deployed system
// contracts and do not restrict what labels third-party deployers can use.
//
// System contract labels follow the "clawchain-<function>" naming convention
// so they can be easily identified in explorer UIs and governance proposals.
func AllowedWasmContractLabels() []string {
	return []string{
		"clawchain-dex-factory",
		"clawchain-dex-pair",
		"clawchain-dex-router",
		"clawchain-dex-staking",
		"clawchain-dex-maker",
		"clawchain-dex-vesting",
		"clawchain-dex-token",
		"clawchain-dex-whitelist",
		"clawchain-privacy-verifier",
		"clawchain-agent-registry",
		"clawchain-marketplace-escrow",
	}
}
