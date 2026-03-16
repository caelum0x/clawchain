// Package genesis provides utilities for constructing and validating
// ClawChain genesis state.
package genesis

import (
	"encoding/json"
	"fmt"

	"github.com/cosmos/cosmos-sdk/codec"

	agentmoduletypes "clawchain/x/agent/types"
	clawchainmoduletypes "clawchain/x/clawchain/types"
	governancemoduletypes "clawchain/x/governance/types"
	marketplacemoduletypes "clawchain/x/marketplace/types"
	messagingmoduletypes "clawchain/x/messaging/types"
	modelregistrymoduletypes "clawchain/x/modelregistry/types"
	oraclemoduletypes "clawchain/x/oracle/types"
	privacymoduletypes "clawchain/x/privacy/types"
	reputationmoduletypes "clawchain/x/reputation/types"
	tokenfactorytypes "clawchain/x/tokenfactory/types"
)

// ClawChainModules lists all custom module names registered by ClawChain.
// This is the single source of truth for module enumeration in genesis utilities.
var ClawChainModules = []string{
	clawchainmoduletypes.ModuleName,
	privacymoduletypes.ModuleName,
	agentmoduletypes.ModuleName,
	messagingmoduletypes.ModuleName,
	marketplacemoduletypes.ModuleName,
	reputationmoduletypes.ModuleName,
	modelregistrymoduletypes.ModuleName,
	governancemoduletypes.ModuleName,
	oraclemoduletypes.ModuleName,
	tokenfactorytypes.ModuleName,
}

// DefaultGenesisState returns the default genesis state for all ClawChain
// custom modules. It marshals each module's DefaultGenesis into JSON and
// merges them into a single map. SDK core modules (auth, bank, staking, etc.)
// are handled by the runtime's DefaultGenesis and are NOT included here.
//
// Modules with protobuf-generated genesis types use codec.MarshalJSON;
// modules with plain Go structs use encoding/json.Marshal.
//
// Usage: merge the returned map with the SDK's DefaultGenesis before writing
// to the genesis.json file.
func DefaultGenesisState(cdc codec.Codec) map[string]json.RawMessage {
	genesis := make(map[string]json.RawMessage)

	// --- Protobuf-generated genesis types (use cdc.MarshalJSON) ---

	// Agent module (proto)
	agentGen := agentmoduletypes.DefaultGenesis()
	bz, err := cdc.MarshalJSON(agentGen)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal agent genesis: %v", err))
	}
	genesis[agentmoduletypes.ModuleName] = bz

	// Privacy module (proto)
	privacyGen := privacymoduletypes.DefaultGenesis()
	bz, err = cdc.MarshalJSON(privacyGen)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal privacy genesis: %v", err))
	}
	genesis[privacymoduletypes.ModuleName] = bz

	// Marketplace module (proto)
	marketplaceGen := marketplacemoduletypes.DefaultGenesis()
	bz, err = cdc.MarshalJSON(marketplaceGen)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal marketplace genesis: %v", err))
	}
	genesis[marketplacemoduletypes.ModuleName] = bz

	// Messaging module (proto)
	messagingGen := messagingmoduletypes.DefaultGenesis()
	bz, err = cdc.MarshalJSON(messagingGen)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal messaging genesis: %v", err))
	}
	genesis[messagingmoduletypes.ModuleName] = bz

	// Reputation module (proto)
	reputationGen := reputationmoduletypes.DefaultGenesis()
	bz, err = cdc.MarshalJSON(reputationGen)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal reputation genesis: %v", err))
	}
	genesis[reputationmoduletypes.ModuleName] = bz

	// Governance module (proto, aliased as GovGenesisState)
	governanceGen := governancemoduletypes.DefaultGenesis()
	bz, err = cdc.MarshalJSON(governanceGen)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal governance genesis: %v", err))
	}
	genesis[governancemoduletypes.ModuleName] = bz

	// Clawchain module (proto)
	clawchainGen := clawchainmoduletypes.DefaultGenesis()
	bz, err = cdc.MarshalJSON(clawchainGen)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal clawchain genesis: %v", err))
	}
	genesis[clawchainmoduletypes.ModuleName] = bz

	// --- Plain Go struct genesis types (use json.Marshal) ---

	// ModelRegistry module (plain struct)
	modelregistryGen := modelregistrymoduletypes.DefaultGenesis()
	bz, err = json.Marshal(modelregistryGen)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal modelregistry genesis: %v", err))
	}
	genesis[modelregistrymoduletypes.ModuleName] = bz

	// Oracle module (plain struct)
	oracleGen := oraclemoduletypes.DefaultGenesis()
	bz, err = json.Marshal(oracleGen)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal oracle genesis: %v", err))
	}
	genesis[oraclemoduletypes.ModuleName] = bz

	// TokenFactory module (plain struct)
	tokenfactoryGen := tokenfactorytypes.DefaultGenesis()
	bz, err = json.Marshal(tokenfactoryGen)
	if err != nil {
		panic(fmt.Sprintf("failed to marshal tokenfactory genesis: %v", err))
	}
	genesis[tokenfactorytypes.ModuleName] = bz

	return genesis
}

// ValidateGenesis validates the ClawChain custom module portions of the
// genesis state. It unmarshals each module's genesis JSON and calls the
// module's own Validate() method.
//
// Missing modules are not treated as errors because SDK core modules are
// not expected to be present in the input map. Only modules that ARE present
// and contain invalid data will cause an error.
func ValidateGenesis(cdc codec.Codec, state map[string]json.RawMessage) error {
	// --- Protobuf-generated genesis types (use cdc.UnmarshalJSON) ---

	// Validate agent genesis
	if raw, ok := state[agentmoduletypes.ModuleName]; ok {
		var gs agentmoduletypes.GenesisState
		if err := cdc.UnmarshalJSON(raw, &gs); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis: %w", agentmoduletypes.ModuleName, err)
		}
		if err := gs.Validate(); err != nil {
			return fmt.Errorf("invalid %s genesis: %w", agentmoduletypes.ModuleName, err)
		}
	}

	// Validate privacy genesis
	if raw, ok := state[privacymoduletypes.ModuleName]; ok {
		var gs privacymoduletypes.GenesisState
		if err := cdc.UnmarshalJSON(raw, &gs); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis: %w", privacymoduletypes.ModuleName, err)
		}
		if err := gs.Validate(); err != nil {
			return fmt.Errorf("invalid %s genesis: %w", privacymoduletypes.ModuleName, err)
		}
	}

	// Validate marketplace genesis
	if raw, ok := state[marketplacemoduletypes.ModuleName]; ok {
		var gs marketplacemoduletypes.GenesisState
		if err := cdc.UnmarshalJSON(raw, &gs); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis: %w", marketplacemoduletypes.ModuleName, err)
		}
		if err := gs.Validate(); err != nil {
			return fmt.Errorf("invalid %s genesis: %w", marketplacemoduletypes.ModuleName, err)
		}
	}

	// Validate messaging genesis
	if raw, ok := state[messagingmoduletypes.ModuleName]; ok {
		var gs messagingmoduletypes.GenesisState
		if err := cdc.UnmarshalJSON(raw, &gs); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis: %w", messagingmoduletypes.ModuleName, err)
		}
		if err := gs.Validate(); err != nil {
			return fmt.Errorf("invalid %s genesis: %w", messagingmoduletypes.ModuleName, err)
		}
	}

	// Validate reputation genesis
	if raw, ok := state[reputationmoduletypes.ModuleName]; ok {
		var gs reputationmoduletypes.GenesisState
		if err := cdc.UnmarshalJSON(raw, &gs); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis: %w", reputationmoduletypes.ModuleName, err)
		}
		if err := gs.Validate(); err != nil {
			return fmt.Errorf("invalid %s genesis: %w", reputationmoduletypes.ModuleName, err)
		}
	}

	// Validate governance genesis (uses standalone ValidateGenesis function)
	if raw, ok := state[governancemoduletypes.ModuleName]; ok {
		var gs governancemoduletypes.GenesisState
		if err := cdc.UnmarshalJSON(raw, &gs); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis: %w", governancemoduletypes.ModuleName, err)
		}
		if err := governancemoduletypes.ValidateGenesis(gs); err != nil {
			return fmt.Errorf("invalid %s genesis: %w", governancemoduletypes.ModuleName, err)
		}
	}

	// Validate clawchain genesis
	if raw, ok := state[clawchainmoduletypes.ModuleName]; ok {
		var gs clawchainmoduletypes.GenesisState
		if err := cdc.UnmarshalJSON(raw, &gs); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis: %w", clawchainmoduletypes.ModuleName, err)
		}
		if err := gs.Validate(); err != nil {
			return fmt.Errorf("invalid %s genesis: %w", clawchainmoduletypes.ModuleName, err)
		}
	}

	// --- Plain Go struct genesis types (use json.Unmarshal) ---

	// Validate modelregistry genesis
	if raw, ok := state[modelregistrymoduletypes.ModuleName]; ok {
		var gs modelregistrymoduletypes.GenesisState
		if err := json.Unmarshal(raw, &gs); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis: %w", modelregistrymoduletypes.ModuleName, err)
		}
		if err := gs.Validate(); err != nil {
			return fmt.Errorf("invalid %s genesis: %w", modelregistrymoduletypes.ModuleName, err)
		}
	}

	// Validate oracle genesis
	if raw, ok := state[oraclemoduletypes.ModuleName]; ok {
		var gs oraclemoduletypes.GenesisState
		if err := json.Unmarshal(raw, &gs); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis: %w", oraclemoduletypes.ModuleName, err)
		}
		if err := gs.Validate(); err != nil {
			return fmt.Errorf("invalid %s genesis: %w", oraclemoduletypes.ModuleName, err)
		}
	}

	// Validate tokenfactory genesis
	if raw, ok := state[tokenfactorytypes.ModuleName]; ok {
		var gs tokenfactorytypes.GenesisState
		if err := json.Unmarshal(raw, &gs); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis: %w", tokenfactorytypes.ModuleName, err)
		}
		if err := gs.Validate(); err != nil {
			return fmt.Errorf("invalid %s genesis: %w", tokenfactorytypes.ModuleName, err)
		}
	}

	return nil
}
