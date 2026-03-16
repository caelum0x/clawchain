package keeper

import (
	"context"
	"encoding/json"
	"fmt"
	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/modelregistry/types"
)

// RegisterInferenceProvider registers an address as an inference provider for specified models.
func (k Keeper) RegisterInferenceProvider(ctx context.Context, address string, modelIDs []uint64, maxConcurrent uint64, endpoint string) error {
	if _, err := sdk.AccAddressFromBech32(address); err != nil {
		return types.ErrInvalidAddress.Wrapf("invalid provider address: %s", err)
	}
	if len(modelIDs) == 0 {
		return fmt.Errorf("provider must serve at least one model")
	}
	if maxConcurrent == 0 {
		maxConcurrent = 1
	}

	// Verify all models exist
	for _, modelID := range modelIDs {
		_, err := k.Models.Get(ctx, modelID)
		if err != nil {
			return types.ErrModelNotFound.Wrapf("model %d", modelID)
		}
	}

	provider := types.InferenceProvider{
		Address:       address,
		ModelIds:      modelIDs,
		MaxConcurrent: maxConcurrent,
		ActiveJobs:    0,
		TotalJobs:     0,
		TotalEarnings: "0",
		AvgLatencyMs:  0,
		Endpoint:      endpoint,
		IsOnline:      true,
		// Store heartbeat as block height for deterministic state transitions.
		LastHeartbeat: sdk.UnwrapSDKContext(ctx).BlockHeight(),
	}

	bz, err := json.Marshal(provider)
	if err != nil {
		return fmt.Errorf("failed to marshal inference provider: %w", err)
	}
	if err := k.InferenceProviders.Set(ctx, address, string(bz)); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"register_inference_provider",
		sdk.NewAttribute("provider", address),
		sdk.NewAttribute("model_count", fmt.Sprintf("%d", len(modelIDs))),
		sdk.NewAttribute("max_concurrent", fmt.Sprintf("%d", maxConcurrent)),
		sdk.NewAttribute("endpoint", endpoint),
	))

	return nil
}

// SetInferencePricing sets the inference pricing for a model. Only the model owner can set pricing.
func (k Keeper) SetInferencePricing(ctx context.Context, modelID uint64, caller string, pricePerToken, pricePerQuery, minPayment math.Int, maxTokens uint64) error {
	raw, err := k.Models.Get(ctx, modelID)
	if err != nil {
		return types.ErrModelNotFound.Wrapf("model %d", modelID)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return fmt.Errorf("failed to unmarshal model: %w", err)
	}
	if model.Owner != caller {
		return types.ErrNotModelOwner
	}

	pricing := types.InferencePricing{
		ModelId:       modelID,
		PricePerToken: pricePerToken.String(),
		PricePerQuery: pricePerQuery.String(),
		MinPayment:    minPayment.String(),
		MaxTokens:     maxTokens,
	}

	bz, err := json.Marshal(pricing)
	if err != nil {
		return fmt.Errorf("failed to marshal inference pricing: %w", err)
	}
	if err := k.InferencePricing.Set(ctx, modelID, string(bz)); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"set_inference_pricing",
		sdk.NewAttribute("model_id", fmt.Sprintf("%d", modelID)),
		sdk.NewAttribute("price_per_token", pricePerToken.String()),
		sdk.NewAttribute("price_per_query", pricePerQuery.String()),
		sdk.NewAttribute("min_payment", minPayment.String()),
		sdk.NewAttribute("max_tokens", fmt.Sprintf("%d", maxTokens)),
	))

	return nil
}

// SubmitInferenceJob validates the model, checks pricing, escrows payment, and creates a job.
func (k Keeper) SubmitInferenceJob(ctx context.Context, modelID uint64, version uint64, requester string, input string, maxTokens uint64, temperature string, payment math.Int) (uint64, error) {
	requesterAddr, err := sdk.AccAddressFromBech32(requester)
	if err != nil {
		return 0, types.ErrInvalidAddress.Wrapf("invalid requester: %s", err)
	}

	// Verify model exists and is active
	raw, err := k.Models.Get(ctx, modelID)
	if err != nil {
		return 0, types.ErrModelNotFound.Wrapf("model %d", modelID)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return 0, fmt.Errorf("failed to unmarshal model: %w", err)
	}
	if !model.Active {
		return 0, types.ErrModelInactive
	}

	// Check pricing
	pricingRaw, err := k.InferencePricing.Get(ctx, modelID)
	if err != nil {
		return 0, types.ErrPricingNotSet.Wrapf("model %d", modelID)
	}
	var pricing types.InferencePricing
	if err := json.Unmarshal([]byte(pricingRaw), &pricing); err != nil {
		return 0, fmt.Errorf("failed to unmarshal pricing: %w", err)
	}

	// Validate payment meets minimum
	pricingMinPayment, ok := math.NewIntFromString(pricing.MinPayment)
	if !ok {
		pricingMinPayment = math.ZeroInt()
	}
	if payment.LT(pricingMinPayment) {
		return 0, types.ErrInsufficientPayment.Wrapf("payment %s < minimum %s", payment.String(), pricingMinPayment.String())
	}

	// Validate max tokens
	if maxTokens > pricing.MaxTokens && pricing.MaxTokens > 0 {
		maxTokens = pricing.MaxTokens
	}

	// Find an online provider for this model
	provider, err := k.findProviderForModel(ctx, modelID)
	if err != nil {
		return 0, err
	}

	// Escrow payment: transfer from requester to module account
	coins := sdk.NewCoins(sdk.NewCoin("uclaw", payment))
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, requesterAddr, types.ModuleName, coins); err != nil {
		return 0, fmt.Errorf("escrow payment failed: %w", err)
	}

	// Allocate job ID
	jobID, err := k.InferenceJobCount.Next(ctx)
	if err != nil {
		return 0, err
	}
	jobID++ // 1-based IDs

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentBlock := sdkCtx.BlockHeight()
	now := sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

	job := types.InferenceJob{
		JobId:        jobID,
		ModelId:      modelID,
		ModelVersion: version,
		Requester:    requester,
		Provider:     provider,
		Input:        input,
		Output:       "",
		Status:       types.InferenceStatusPending,
		MaxTokens:    maxTokens,
		Temperature:  temperature,
		Payment:      payment.String(),
		GasUsed:      0,
		CreatedAt:    now,
		StartedAt:    0,
		CompletedAt:  0,
		TimeoutBlock: currentBlock + types.DefaultInferenceTimeoutBlocks,
		ErrorMsg:     "",
	}

	bz, err := json.Marshal(job)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal inference job: %w", err)
	}
	if err := k.InferenceJobs.Set(ctx, jobID, string(bz)); err != nil {
		return 0, err
	}

	// Increment provider active jobs
	if err := k.incrementProviderActiveJobs(ctx, provider); err != nil {
		return 0, err
	}

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"submit_inference_job",
		sdk.NewAttribute("job_id", fmt.Sprintf("%d", jobID)),
		sdk.NewAttribute("model_id", fmt.Sprintf("%d", modelID)),
		sdk.NewAttribute("requester", requester),
		sdk.NewAttribute("provider", provider),
		sdk.NewAttribute("payment", payment.String()),
		sdk.NewAttribute("max_tokens", fmt.Sprintf("%d", maxTokens)),
	))

	return jobID, nil
}

// StartInferenceJob marks a job as running. Only the assigned provider can start it.
func (k Keeper) StartInferenceJob(ctx context.Context, jobID uint64, provider string) error {
	raw, err := k.InferenceJobs.Get(ctx, jobID)
	if err != nil {
		return types.ErrInferenceJobNotFound.Wrapf("job %d", jobID)
	}
	var job types.InferenceJob
	if err := json.Unmarshal([]byte(raw), &job); err != nil {
		return fmt.Errorf("failed to unmarshal inference job: %w", err)
	}

	if job.Provider != provider {
		return types.ErrNotJobProvider
	}
	if job.Status != types.InferenceStatusPending {
		return types.ErrInvalidJobTransition.Wrapf("cannot start job in %s status", job.Status)
	}

	job.Status = types.InferenceStatusRunning
	job.StartedAt = sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

	bz, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal inference job: %w", err)
	}
	if err := k.InferenceJobs.Set(ctx, jobID, string(bz)); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"start_inference_job",
		sdk.NewAttribute("job_id", fmt.Sprintf("%d", jobID)),
		sdk.NewAttribute("provider", provider),
	))

	return nil
}

// CompleteInferenceJob delivers the result, settles payment (pays provider, refunds excess).
func (k Keeper) CompleteInferenceJob(ctx context.Context, jobID uint64, provider string, output string, tokensUsed uint64) error {
	raw, err := k.InferenceJobs.Get(ctx, jobID)
	if err != nil {
		return types.ErrInferenceJobNotFound.Wrapf("job %d", jobID)
	}
	var job types.InferenceJob
	if err := json.Unmarshal([]byte(raw), &job); err != nil {
		return fmt.Errorf("failed to unmarshal inference job: %w", err)
	}

	if job.Provider != provider {
		return types.ErrNotJobProvider
	}
	if job.Status != types.InferenceStatusPending && job.Status != types.InferenceStatusRunning {
		return types.ErrJobAlreadyCompleted
	}

	// Get pricing to calculate actual cost
	pricingRaw, err := k.InferencePricing.Get(ctx, job.ModelId)
	if err != nil {
		return types.ErrPricingNotSet.Wrapf("model %d", job.ModelId)
	}
	var pricing types.InferencePricing
	if err := json.Unmarshal([]byte(pricingRaw), &pricing); err != nil {
		return fmt.Errorf("failed to unmarshal pricing: %w", err)
	}

	// Parse string prices to math.Int
	pricingPerToken, ok := math.NewIntFromString(pricing.PricePerToken)
	if !ok {
		pricingPerToken = math.ZeroInt()
	}
	pricingPerQuery, ok := math.NewIntFromString(pricing.PricePerQuery)
	if !ok {
		pricingPerQuery = math.ZeroInt()
	}
	jobPayment, ok := math.NewIntFromString(job.Payment)
	if !ok {
		jobPayment = math.ZeroInt()
	}

	// Calculate actual cost: max(perQuery, perToken * tokensUsed)
	tokenCost := pricingPerToken.MulRaw(int64(tokensUsed))
	actualCost := pricingPerQuery
	if tokenCost.GT(actualCost) {
		actualCost = tokenCost
	}
	// Don't charge more than escrowed
	if actualCost.GT(jobPayment) {
		actualCost = jobPayment
	}

	// Pay provider
	providerAddr, err := sdk.AccAddressFromBech32(provider)
	if err != nil {
		return types.ErrInvalidAddress.Wrapf("invalid provider: %s", err)
	}
	if actualCost.IsPositive() {
		providerCoins := sdk.NewCoins(sdk.NewCoin("uclaw", actualCost))
		if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, providerAddr, providerCoins); err != nil {
			return fmt.Errorf("provider payment failed: %w", err)
		}
	}

	// Refund excess to requester
	refund := jobPayment.Sub(actualCost)
	if refund.IsPositive() {
		requesterAddr, err := sdk.AccAddressFromBech32(job.Requester)
		if err != nil {
			return types.ErrInvalidAddress.Wrapf("invalid requester: %s", err)
		}
		refundCoins := sdk.NewCoins(sdk.NewCoin("uclaw", refund))
		if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, requesterAddr, refundCoins); err != nil {
			return fmt.Errorf("refund failed: %w", err)
		}
	}

	// Update job
	now := sdk.UnwrapSDKContext(ctx).BlockTime().Unix()
	job.Status = types.InferenceStatusCompleted
	job.Output = output
	job.GasUsed = tokensUsed
	job.CompletedAt = now

	bz, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal inference job: %w", err)
	}
	if err := k.InferenceJobs.Set(ctx, jobID, string(bz)); err != nil {
		return err
	}

	// Update provider stats
	if err := k.updateProviderCompletion(ctx, provider, actualCost, now-job.CreatedAt); err != nil {
		return err
	}

	// Update model revenue
	if err := k.addModelRevenue(ctx, job.ModelId, actualCost); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"complete_inference_job",
		sdk.NewAttribute("job_id", fmt.Sprintf("%d", jobID)),
		sdk.NewAttribute("provider", provider),
		sdk.NewAttribute("tokens_used", fmt.Sprintf("%d", tokensUsed)),
		sdk.NewAttribute("actual_cost", actualCost.String()),
		sdk.NewAttribute("refund", refund.String()),
	))

	return nil
}

// FailInferenceJob marks a job as failed and refunds the requester.
func (k Keeper) FailInferenceJob(ctx context.Context, jobID uint64, provider string, errorMsg string) error {
	raw, err := k.InferenceJobs.Get(ctx, jobID)
	if err != nil {
		return types.ErrInferenceJobNotFound.Wrapf("job %d", jobID)
	}
	var job types.InferenceJob
	if err := json.Unmarshal([]byte(raw), &job); err != nil {
		return fmt.Errorf("failed to unmarshal inference job: %w", err)
	}

	if job.Provider != provider {
		return types.ErrNotJobProvider
	}
	if job.Status != types.InferenceStatusPending && job.Status != types.InferenceStatusRunning {
		return types.ErrJobAlreadyCompleted
	}

	// Refund full payment to requester
	jobPayment, ok := math.NewIntFromString(job.Payment)
	if !ok {
		jobPayment = math.ZeroInt()
	}
	if jobPayment.IsPositive() {
		requesterAddr, err := sdk.AccAddressFromBech32(job.Requester)
		if err != nil {
			return types.ErrInvalidAddress.Wrapf("invalid requester: %s", err)
		}
		refundCoins := sdk.NewCoins(sdk.NewCoin("uclaw", jobPayment))
		if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, requesterAddr, refundCoins); err != nil {
			return fmt.Errorf("refund failed: %w", err)
		}
	}

	// Update job
	job.Status = types.InferenceStatusFailed
	job.ErrorMsg = errorMsg
	job.CompletedAt = sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

	bz, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal inference job: %w", err)
	}
	if err := k.InferenceJobs.Set(ctx, jobID, string(bz)); err != nil {
		return err
	}

	// Decrement provider active jobs
	if err := k.decrementProviderActiveJobs(ctx, provider); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"fail_inference_job",
		sdk.NewAttribute("job_id", fmt.Sprintf("%d", jobID)),
		sdk.NewAttribute("provider", provider),
		sdk.NewAttribute("error", errorMsg),
	))

	return nil
}

// ProviderHeartbeat updates the provider's online status and heartbeat height.
func (k Keeper) ProviderHeartbeat(ctx context.Context, address string) error {
	raw, err := k.InferenceProviders.Get(ctx, address)
	if err != nil {
		return types.ErrProviderNotFound.Wrapf("provider %s", address)
	}
	var provider types.InferenceProvider
	if err := json.Unmarshal([]byte(raw), &provider); err != nil {
		return fmt.Errorf("failed to unmarshal inference provider: %w", err)
	}

	provider.IsOnline = true
	provider.LastHeartbeat = sdk.UnwrapSDKContext(ctx).BlockHeight()

	bz, err := json.Marshal(provider)
	if err != nil {
		return fmt.Errorf("failed to marshal inference provider: %w", err)
	}
	return k.InferenceProviders.Set(ctx, address, string(bz))
}

// ExpireInferenceJobs refunds timed-out jobs. Called in EndBlock.
func (k Keeper) ExpireInferenceJobs(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentBlock := sdkCtx.BlockHeight()

	iter, err := k.InferenceJobs.Iterate(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to iterate inference jobs: %w", err)
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

		// Skip non-active jobs
		if job.Status != types.InferenceStatusPending && job.Status != types.InferenceStatusRunning {
			continue
		}

		// Check if job has timed out
		if currentBlock < job.TimeoutBlock {
			continue
		}

		// Refund payment to requester
		jobPayment, ok := math.NewIntFromString(job.Payment)
		if !ok {
			jobPayment = math.ZeroInt()
		}
		if jobPayment.IsPositive() {
			requesterAddr, err := sdk.AccAddressFromBech32(job.Requester)
			if err != nil {
				continue
			}
			refundCoins := sdk.NewCoins(sdk.NewCoin("uclaw", jobPayment))
			if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, requesterAddr, refundCoins); err != nil {
				continue
			}
		}

		// Mark as timed out
		job.Status = types.InferenceStatusTimeout
		job.CompletedAt = sdk.UnwrapSDKContext(ctx).BlockTime().Unix()
		job.ErrorMsg = "job timed out"

		bz, err := json.Marshal(job)
		if err != nil {
			continue
		}
		if err := k.InferenceJobs.Set(ctx, job.JobId, string(bz)); err != nil {
			continue
		}

		// Decrement provider active jobs
		_ = k.decrementProviderActiveJobs(ctx, job.Provider)

		sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
			"inference_job_timeout",
			sdk.NewAttribute("job_id", fmt.Sprintf("%d", job.JobId)),
			sdk.NewAttribute("requester", job.Requester),
			sdk.NewAttribute("provider", job.Provider),
			sdk.NewAttribute("refund", job.Payment),
		))
	}

	// Also mark providers offline if heartbeat is stale
	if err := k.expireProviderHeartbeats(ctx, currentBlock); err != nil {
		return err
	}

	return nil
}

// -- internal helpers -------------------------------------------------------

// findProviderForModel finds an online provider with capacity for the given model.
func (k Keeper) findProviderForModel(ctx context.Context, modelID uint64) (string, error) {
	// First try to find a dedicated inference provider
	iter, err := k.InferenceProviders.Iterate(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("failed to iterate providers: %w", err)
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
		if !provider.IsOnline {
			continue
		}
		if provider.ActiveJobs >= provider.MaxConcurrent {
			continue
		}
		for _, mid := range provider.ModelIds {
			if mid == modelID {
				return provider.Address, nil
			}
		}
	}

	// Fallback: use the model owner as provider
	raw, err := k.Models.Get(ctx, modelID)
	if err != nil {
		return "", types.ErrModelNotFound.Wrapf("model %d", modelID)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return "", fmt.Errorf("failed to unmarshal model: %w", err)
	}
	return model.Owner, nil
}

// incrementProviderActiveJobs increments the active job count for a provider.
func (k Keeper) incrementProviderActiveJobs(ctx context.Context, address string) error {
	raw, err := k.InferenceProviders.Get(ctx, address)
	if err != nil {
		// Provider not registered as inference provider; skip update
		return nil
	}
	var provider types.InferenceProvider
	if err := json.Unmarshal([]byte(raw), &provider); err != nil {
		return nil
	}
	provider.ActiveJobs++
	provider.TotalJobs++

	bz, err := json.Marshal(provider)
	if err != nil {
		return nil
	}
	return k.InferenceProviders.Set(ctx, address, string(bz))
}

// decrementProviderActiveJobs decrements the active job count for a provider.
func (k Keeper) decrementProviderActiveJobs(ctx context.Context, address string) error {
	raw, err := k.InferenceProviders.Get(ctx, address)
	if err != nil {
		return nil
	}
	var provider types.InferenceProvider
	if err := json.Unmarshal([]byte(raw), &provider); err != nil {
		return nil
	}
	if provider.ActiveJobs > 0 {
		provider.ActiveJobs--
	}

	bz, err := json.Marshal(provider)
	if err != nil {
		return nil
	}
	return k.InferenceProviders.Set(ctx, address, string(bz))
}

// updateProviderCompletion updates provider stats on job completion.
func (k Keeper) updateProviderCompletion(ctx context.Context, address string, earnings math.Int, latencySeconds int64) error {
	raw, err := k.InferenceProviders.Get(ctx, address)
	if err != nil {
		return nil
	}
	var provider types.InferenceProvider
	if err := json.Unmarshal([]byte(raw), &provider); err != nil {
		return nil
	}

	if provider.ActiveJobs > 0 {
		provider.ActiveJobs--
	}

	totalEarnings, ok := math.NewIntFromString(provider.TotalEarnings)
	if !ok {
		totalEarnings = math.ZeroInt()
	}
	totalEarnings = totalEarnings.Add(earnings)
	provider.TotalEarnings = totalEarnings.String()

	// Update average latency (rolling average)
	latencyMs := uint64(latencySeconds * 1000)
	if provider.AvgLatencyMs == 0 {
		provider.AvgLatencyMs = latencyMs
	} else {
		completedJobs := provider.TotalJobs
		if completedJobs == 0 {
			completedJobs = 1
		}
		provider.AvgLatencyMs = (provider.AvgLatencyMs*(completedJobs-1) + latencyMs) / completedJobs
	}

	bz, err := json.Marshal(provider)
	if err != nil {
		return nil
	}
	return k.InferenceProviders.Set(ctx, address, string(bz))
}

// addModelRevenue adds revenue to a model's total revenue.
func (k Keeper) addModelRevenue(ctx context.Context, modelID uint64, revenue math.Int) error {
	raw, err := k.Models.Get(ctx, modelID)
	if err != nil {
		return nil
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return nil
	}

	rev, ok := math.NewIntFromString(model.TotalRevenue)
	if !ok {
		rev = math.ZeroInt()
	}
	rev = rev.Add(revenue)
	model.TotalRevenue = rev.String()
	model.TotalDownloads++
	model.UpdatedAt = sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

	bz, err := json.Marshal(model)
	if err != nil {
		return nil
	}
	return k.Models.Set(ctx, modelID, string(bz))
}

// expireProviderHeartbeats marks providers as offline if their heartbeat is stale.
func (k Keeper) expireProviderHeartbeats(ctx context.Context, currentBlock int64) error {
	// Providers are offline after ProviderHeartbeatTimeout blocks.
	heartbeatCutoff := currentBlock - types.ProviderHeartbeatTimeout

	iter, err := k.InferenceProviders.Iterate(ctx, nil)
	if err != nil {
		return nil
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
		if provider.IsOnline && provider.LastHeartbeat < heartbeatCutoff {
			provider.IsOnline = false
			bz, err := json.Marshal(provider)
			if err != nil {
				continue
			}
			key, err := iter.Key()
			if err != nil {
				continue
			}
			_ = k.InferenceProviders.Set(ctx, key, string(bz))
		}
	}

	return nil
}
