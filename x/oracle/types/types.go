package types

// ExchangeRate represents a price for a denom pair.
type ExchangeRate struct {
	DenomPair   string `json:"denom_pair"`
	Price       string `json:"price"`
	BlockHeight int64  `json:"block_height"`
	Timestamp   int64  `json:"timestamp"`
}

// PriceHistoryEntry represents a historical price entry.
type PriceHistoryEntry struct {
	Price          string `json:"price"`
	BlockHeight    int64  `json:"block_height"`
	Timestamp      int64  `json:"timestamp"`
	DurationBlocks uint64 `json:"duration_blocks,omitempty"`
}

// AggregateExchangeRatePrevote represents a hashed vote submitted before the reveal.
type AggregateExchangeRatePrevote struct {
	Hash        string `json:"hash"`
	Voter       string `json:"voter"`
	SubmitBlock uint64 `json:"submit_block"`
}

// AggregateExchangeRateVote represents a revealed vote with exchange rates.
type AggregateExchangeRateVote struct {
	ExchangeRates string `json:"exchange_rates"`
	Voter         string `json:"voter"`
}

// TWAPEntry represents a time-weighted average price entry.
type TWAPEntry struct {
	DenomPair        string `json:"denom_pair"`
	Twap             string `json:"twap"`
	LastUpdatedBlock int64  `json:"last_updated_block"`
	WindowSize       uint64 `json:"window_size"`
}
