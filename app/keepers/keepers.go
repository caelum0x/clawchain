// Package keepers contains helper functions for initializing and configuring
// module keepers for the ClawChain application.
package keepers

// KeeperInitOrder documents the required initialization order for ClawChain keepers.
// This is critical because some keepers depend on others:
//
//  1. Auth, Bank (core SDK) — via depinject; no manual init required.
//  2. Staking, Distribution, Slashing (PoS) — via depinject.
//  3. IBC Core, Transfer, ICA (host + controller) — manual init in app/ibc.go.
//  4. TokenFactory (before Wasm) — needed for LP token minting; manual init in
//     app/tokenfactory.go via initTokenFactoryKeeper(). Must register store key
//     before Wasm keeper is created so the message handler decorator can route
//     Osmosis-style tokenfactory messages from CosmWasm contracts.
//  5. Wasm (depends on TokenFactory decorator) — manual init in app/wasm.go via
//     initWasmKeeper(). The keeper receives a WithMessageHandlerDecorator that
//     intercepts /osmosis.tokenfactory.v1beta1.Msg* type URLs.
//  6. Custom modules (via depinject):
//     - Agent        (x/agent)        — minter + burner permissions
//     - Privacy      (x/privacy)      — requires Groth16 verifying keys loaded post-init
//     - Marketplace  (x/marketplace)  — burner permissions
//     - Messaging    (x/messaging)
//     - Reputation   (x/reputation)
//     - ModelRegistry(x/modelregistry) — burner permissions
//     - Oracle       (x/oracle)
//  7. Governance (x/governance) — depends on agent keeper for param execution;
//     all module param executors are registered post-depinject via
//     GovernanceKeeper.RegisterModuleParamExecutor().
//
// Circular dependency resolution:
//
//	Agent <-> Reputation: Agent needs reputation for scoring; Reputation needs
//	agent for identity. Resolved via app.AgentKeeper.SetReputationKeeper()
//	called after depinject.Inject() returns both keepers.
//
// Post-init wiring (in app.New):
//   - AgentKeeper.SetReputationKeeper(ReputationKeeper)
//   - GovernanceKeeper.RegisterModuleParamExecutor("agent", AgentKeeper)
//   - GovernanceKeeper.RegisterModuleParamExecutor("marketplace", MarketplaceKeeper)
//   - GovernanceKeeper.RegisterModuleParamExecutor("privacy", PrivacyKeeper)
//   - GovernanceKeeper.RegisterModuleParamExecutor("modelregistry", ModelRegistryKeeper)
//   - GovernanceKeeper.RegisterModuleParamExecutor("messaging", MessagingKeeper)
//   - GovernanceKeeper.RegisterModuleParamExecutor("reputation", ReputationKeeper)
//   - GovernanceKeeper.RegisterModuleParamExecutor("oracle", OracleKeeper)
//   - PrivacyKeeper.LoadVerifyingKeys(keysDir) for Groth16 ZK proofs

// ModuleAccountPermissions returns the complete set of module account
// permissions used by ClawChain. This is the canonical reference for which
// modules hold minter/burner capabilities.
//
// The actual permissions are defined in app/app_config.go (moduleAccPerms) and
// consumed by the auth module's depinject configuration. This function exists
// to provide a single place to document the security implications:
//
//   - Minters: mint, agent, ibctransfer, tokenfactory
//   - Burners: gov, marketplace, modelregistry, agent, ibctransfer, wasm,
//     tokenfactory, clawgovernance
//   - No permissions (receive-only): fee_collector, distribution, privacy,
//     nft, interchainaccounts
//
// The staking bonded/not-bonded pools have the special "staking" permission
// in addition to burner.
func ModuleAccountPermissions() map[string][]string {
	return map[string][]string{
		"fee_collector":        {},
		"distribution":         {},
		"mint":                 {"minter"},
		"bonded_tokens_pool":   {"burner", "staking"},
		"not_bonded_tokens_pool": {"burner", "staking"},
		"gov":                  {"burner"},
		"marketplace":          {"burner"},
		"modelregistry":        {"burner"},
		"agent":                {"burner", "minter"},
		"privacy":              {},
		"clawgovernance":       {"burner"},
		"nft":                  {},
		"transfer":             {"minter", "burner"},
		"interchainaccounts":   {},
		"wasm":                 {"burner"},
		"tokenfactory":         {"minter", "burner"},
	}
}

// BlockedModuleAccounts returns the module account names that are blocked
// from receiving funds via standard bank sends. This is a security measure
// to prevent accidental or malicious fund transfers to system accounts.
//
// Note: gov module is intentionally NOT blocked so that the community pool
// can receive deposits for governance proposals.
func BlockedModuleAccounts() []string {
	return []string{
		"fee_collector",
		"distribution",
		"mint",
		"bonded_tokens_pool",
		"not_bonded_tokens_pool",
		"nft",
	}
}
