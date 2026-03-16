package keeper

import (
	"context"
	"encoding/json"
	"fmt"

	"clawchain/x/modelregistry/types"
)

// QueryInferenceJob returns a single inference job by ID.
func (k Keeper) QueryInferenceJob(ctx context.Context, jobID uint64) (*types.InferenceJob, error) {
	raw, err := k.InferenceJobs.Get(ctx, jobID)
	if err != nil {
		return nil, types.ErrInferenceJobNotFound.Wrapf("job %d", jobID)
	}
	var job types.InferenceJob
	if err := json.Unmarshal([]byte(raw), &job); err != nil {
		return nil, fmt.Errorf("failed to unmarshal inference job: %w", err)
	}
	return &job, nil
}

// QueryInferenceJobs returns inference jobs, optionally filtered by modelID and/or status.
func (k Keeper) QueryInferenceJobs(ctx context.Context, modelID uint64, status string) ([]types.InferenceJob, error) {
	var result []types.InferenceJob

	iter, err := k.InferenceJobs.Iterate(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to iterate inference jobs: %w", err)
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		raw, err := iter.Value()
		if err != nil {
			continue
		}
		var job types.InferenceJob
		if err := json.Unmarshal([]byte(raw), &job); err != nil {
			continue
		}
		// Filter by model ID
		if modelID > 0 && job.ModelId != modelID {
			continue
		}
		// Filter by status
		if status != "" && job.Status != status {
			continue
		}
		result = append(result, job)
	}

	return result, nil
}

// QueryInferenceProvider returns a single inference provider by address.
func (k Keeper) QueryInferenceProvider(ctx context.Context, address string) (*types.InferenceProvider, error) {
	raw, err := k.InferenceProviders.Get(ctx, address)
	if err != nil {
		return nil, types.ErrProviderNotFound.Wrapf("provider %s", address)
	}
	var provider types.InferenceProvider
	if err := json.Unmarshal([]byte(raw), &provider); err != nil {
		return nil, fmt.Errorf("failed to unmarshal inference provider: %w", err)
	}
	return &provider, nil
}

// QueryInferencePricing returns the inference pricing for a model.
func (k Keeper) QueryInferencePricing(ctx context.Context, modelID uint64) (*types.InferencePricing, error) {
	raw, err := k.InferencePricing.Get(ctx, modelID)
	if err != nil {
		return nil, types.ErrPricingNotSet.Wrapf("model %d", modelID)
	}
	var pricing types.InferencePricing
	if err := json.Unmarshal([]byte(raw), &pricing); err != nil {
		return nil, fmt.Errorf("failed to unmarshal inference pricing: %w", err)
	}
	return &pricing, nil
}

// QueryInferenceProviders returns all inference providers, optionally filtered by model ID.
func (k Keeper) QueryInferenceProviders(ctx context.Context, modelID uint64) ([]types.InferenceProvider, error) {
	var result []types.InferenceProvider

	iter, err := k.InferenceProviders.Iterate(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to iterate inference providers: %w", err)
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		raw, err := iter.Value()
		if err != nil {
			continue
		}
		var provider types.InferenceProvider
		if err := json.Unmarshal([]byte(raw), &provider); err != nil {
			continue
		}
		// Filter by model ID if specified
		if modelID > 0 {
			serves := false
			for _, mid := range provider.ModelIds {
				if mid == modelID {
					serves = true
					break
				}
			}
			if !serves {
				continue
			}
		}
		result = append(result, provider)
	}

	return result, nil
}
