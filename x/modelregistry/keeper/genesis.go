package keeper

import (
	"context"
	"encoding/json"
	"fmt"

	"clawchain/x/modelregistry/types"
)

func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	// Initialize default params.
	if err := k.Params.Set(ctx, types.DefaultModelRegistryParams()); err != nil {
		return fmt.Errorf("failed to set modelregistry params: %w", err)
	}

	for _, model := range genState.Models {
		bz, err := json.Marshal(model)
		if err != nil {
			return fmt.Errorf("failed to marshal model %d: %w", model.Id, err)
		}
		if err := k.Models.Set(ctx, model.Id, string(bz)); err != nil {
			return err
		}
	}
	return nil
}

func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	genesis := types.DefaultGenesis()

	iter, err := k.Models.Iterate(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to iterate models: %w", err)
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		raw, err := iter.Value()
		if err != nil {
			continue
		}
		var model types.ModelRecord
		if err := json.Unmarshal([]byte(raw), &model); err != nil {
			continue
		}
		genesis.Models = append(genesis.Models, model)
	}

	return genesis, nil
}
