package types

// GenesisState defines the tokenfactory module's genesis state.
type GenesisState struct{}

// DefaultGenesis returns the default genesis state for the tokenfactory module.
func DefaultGenesis() *GenesisState {
	return &GenesisState{}
}

// Validate performs basic genesis state validation.
func (gs GenesisState) Validate() error {
	return nil
}
