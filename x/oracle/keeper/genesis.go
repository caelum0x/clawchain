package keeper

import (
	"context"
	"encoding/json"
	"fmt"

	"clawchain/x/oracle/types"
)

// InitGenesis initializes the oracle module state from genesis.
func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	// Store params.
	if err := k.SetParams(ctx, genState.Params); err != nil {
		return fmt.Errorf("failed to set oracle params: %w", err)
	}

	// Store exchange rates.
	for _, rate := range genState.ExchangeRates {
		data, err := json.Marshal(rate)
		if err != nil {
			return fmt.Errorf("failed to marshal exchange rate: %w", err)
		}
		if err := k.ExchangeRates.Set(ctx, rate.DenomPair, string(data)); err != nil {
			return err
		}
	}

	// Store feeder delegations.
	for validator, feeder := range genState.FeederDelegations {
		if err := k.FeederDelegations.Set(ctx, validator, feeder); err != nil {
			return err
		}
	}

	// Store miss counters.
	for validator, count := range genState.MissCounters {
		if err := k.MissCounters.Set(ctx, validator, count); err != nil {
			return err
		}
	}

	return nil
}

// ExportGenesis exports the oracle module state to genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	genesis := types.DefaultGenesis()

	genesis.Params = k.GetParams(ctx)

	// Export exchange rates.
	err := k.ExchangeRates.Walk(ctx, nil, func(_ string, rateJSON string) (bool, error) {
		var rate types.ExchangeRate
		if err := json.Unmarshal([]byte(rateJSON), &rate); err != nil {
			return false, nil
		}
		genesis.ExchangeRates = append(genesis.ExchangeRates, rate)
		return false, nil
	})
	if err != nil {
		return nil, err
	}

	// Export feeder delegations.
	err = k.FeederDelegations.Walk(ctx, nil, func(validator string, feeder string) (bool, error) {
		genesis.FeederDelegations[validator] = feeder
		return false, nil
	})
	if err != nil {
		return nil, err
	}

	// Export miss counters.
	err = k.MissCounters.Walk(ctx, nil, func(validator string, count uint64) (bool, error) {
		genesis.MissCounters[validator] = count
		return false, nil
	})
	if err != nil {
		return nil, err
	}

	return genesis, nil
}
