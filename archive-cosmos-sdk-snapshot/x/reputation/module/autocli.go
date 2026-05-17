package reputation

import autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"

func (am AppModule) AutoCLIOptions() *autocliv1.ModuleOptions {
	// Reputation currently uses hand-written protobuf stubs that don't expose
	// the full descriptor metadata required by AutoCLI service discovery.
	// Returning nil prevents startup panics in clawchaind while keeping module
	// functionality available through existing CLI/REST/gRPC paths.
	return nil
}
