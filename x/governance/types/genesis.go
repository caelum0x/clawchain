package types

import "fmt"

// GenesisState is an alias for the pb-generated GovGenesisState.
type GenesisState = GovGenesisState

// DefaultGenesis returns a default GenesisState for the module.
func DefaultGenesis() *GenesisState {
	return &GenesisState{
		Proposals:     []Proposal{},
		Votes:         []Vote{},
		ProposalCount: 0,
	}
}

// Validate validates the GenesisState.
func ValidateGenesis(gs GenesisState) error {
	seen := make(map[uint64]bool)
	for _, p := range gs.Proposals {
		if seen[p.ProposalId] {
			return fmt.Errorf("duplicate proposal ID %d", p.ProposalId)
		}
		seen[p.ProposalId] = true
		if err := ValidateProposal(&p); err != nil {
			return fmt.Errorf("invalid proposal %d: %w", p.ProposalId, err)
		}
	}
	return nil
}
