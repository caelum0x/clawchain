package types

type GenesisState struct {
	Models []ModelRecord `json:"models"`
}

func DefaultGenesis() *GenesisState {
	return &GenesisState{Models: []ModelRecord{}}
}

func (gs GenesisState) Validate() error {
	return nil
}
