package keeper

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"clawchain/x/modelregistry/types"
)

// QueryModels returns models filtered by optional criteria.
func (k Keeper) QueryModels(ctx context.Context, framework string, tags []string, onlyFree bool) ([]types.ModelRecord, error) {
	var result []types.ModelRecord

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
		if !model.Active {
			continue
		}
		// Filter by framework
		if framework != "" && !strings.EqualFold(model.Framework, framework) {
			continue
		}
		// Filter by free-only
		if onlyFree && model.AccessType != "free" {
			continue
		}
		// Filter by tags (if any tag matches)
		if len(tags) > 0 {
			matched := false
			for _, filterTag := range tags {
				for _, modelTag := range model.Tags {
					if strings.EqualFold(filterTag, modelTag) {
						matched = true
						break
					}
				}
				if matched {
					break
				}
			}
			if !matched {
				continue
			}
		}
		result = append(result, model)
	}

	return result, nil
}

// QueryModel returns a single model by ID.
func (k Keeper) QueryModel(ctx context.Context, modelId uint64) (*types.ModelRecord, error) {
	raw, err := k.Models.Get(ctx, modelId)
	if err != nil {
		return nil, types.ErrModelNotFound.Wrapf("model %d", modelId)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return nil, fmt.Errorf("failed to unmarshal model: %w", err)
	}
	return &model, nil
}

// QueryModelVersions returns all versions for a model.
func (k Keeper) QueryModelVersions(ctx context.Context, modelId uint64) ([]types.ModelVersion, error) {
	var versions []types.ModelVersion

	// Get the model to find current version count
	raw, err := k.Models.Get(ctx, modelId)
	if err != nil {
		return nil, types.ErrModelNotFound.Wrapf("model %d", modelId)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return nil, fmt.Errorf("failed to unmarshal model: %w", err)
	}

	for v := uint64(1); v <= model.CurrentVersion; v++ {
		key := fmt.Sprintf("%d/%d", modelId, v)
		vRaw, err := k.ModelVersions.Get(ctx, key)
		if err != nil {
			continue
		}
		var version types.ModelVersion
		if err := json.Unmarshal([]byte(vRaw), &version); err != nil {
			continue
		}
		versions = append(versions, version)
	}

	return versions, nil
}

// QueryModelAccess checks whether an address has access to a model.
func (k Keeper) QueryModelAccess(ctx context.Context, modelId uint64, address string) (*types.ModelAccess, error) {
	key := fmt.Sprintf("%d/%s", modelId, address)
	raw, err := k.ModelAccess.Get(ctx, key)
	if err != nil {
		return nil, types.ErrNoAccess
	}
	var access types.ModelAccess
	if err := json.Unmarshal([]byte(raw), &access); err != nil {
		return nil, fmt.Errorf("failed to unmarshal access: %w", err)
	}
	return &access, nil
}
