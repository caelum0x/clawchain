package types

import "cosmossdk.io/collections"

const (
	// ModuleName defines the module name
	ModuleName = "clawgovernance"

	// StoreKey defines the primary module store key
	StoreKey = ModuleName

	// GovModuleName duplicates the gov module's name to avoid a dependency with x/gov.
	GovModuleName = "gov"
)

// ProposalsKey is the prefix for proposal records (Map[uint64, string]).
var ProposalsKey = collections.NewPrefix("p_clawgov")

// VotesKey is the prefix for vote records (Map[string, string]).
var VotesKey = collections.NewPrefix("v_clawgov")

// ProposalCountKey is the prefix for the proposal count sequence.
var ProposalCountKey = collections.NewPrefix("pc_clawgov")
