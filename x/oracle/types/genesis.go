package types

import "fmt"

// GenesisState defines the oracle module's genesis state.
type GenesisState struct {
	Params             OracleParams      `json:"params"`
	ExchangeRates      []ExchangeRate    `json:"exchange_rates"`
	FeederDelegations  map[string]string `json:"feeder_delegations"`
	MissCounters       map[string]uint64 `json:"miss_counters"`
	PriceHistory       []PriceHistoryEntry `json:"price_history"`
}

// DefaultGenesis returns the default genesis state.
func DefaultGenesis() *GenesisState {
	return &GenesisState{
		Params:            DefaultParams,
		ExchangeRates:     []ExchangeRate{},
		FeederDelegations: map[string]string{},
		MissCounters:      map[string]uint64{},
		PriceHistory:      []PriceHistoryEntry{},
	}
}

// Validate validates the genesis state.
func (gs GenesisState) Validate() error {
	if gs.Params.VotePeriod == 0 {
		return fmt.Errorf("vote period must be positive")
	}
	if len(gs.Params.Whitelist) == 0 {
		return fmt.Errorf("whitelist must not be empty")
	}
	return nil
}
