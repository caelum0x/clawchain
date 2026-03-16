package keeper

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

// SubmitComputeJob submits a new GPU compute job.
func (k Keeper) SubmitComputeJob(ctx context.Context, submitter string, resourceId uint64, leaseId uint64, job types.ComputeJob) (uint64, error) {
	if _, err := k.addressCodec.StringToBytes(submitter); err != nil {
		return 0, errorsmod.Wrap(types.ErrInvalidAddress, "invalid submitter address")
	}

	// Verify the lease exists and is active
	leaseJSON, err := k.ComputeLeases.Get(ctx, leaseId)
	if err != nil {
		return 0, errorsmod.Wrap(types.ErrLeaseNotFound, "lease not found")
	}
	var lease types.ComputeLease
	if err := json.Unmarshal([]byte(leaseJSON), &lease); err != nil {
		return 0, fmt.Errorf("failed to unmarshal compute lease: %w", err)
	}
	if lease.Status != "active" {
		return 0, errorsmod.Wrap(types.ErrLeaseNotActive, "lease is not active")
	}
	if lease.Lessee != submitter {
		return 0, errorsmod.Wrap(types.ErrNotLeaseParty, "only the lessee can submit jobs")
	}
	if lease.ResourceId != resourceId {
		return 0, errorsmod.Wrap(types.ErrComputeResourceNotFound, "resource_id does not match lease")
	}

	// Verify the resource exists
	resourceJSON, err := k.ComputeResources.Get(ctx, resourceId)
	if err != nil {
		return 0, errorsmod.Wrap(types.ErrComputeResourceNotFound, "resource not found")
	}
	var resource types.ComputeResource
	if err := json.Unmarshal([]byte(resourceJSON), &resource); err != nil {
		return 0, fmt.Errorf("failed to unmarshal compute resource: %w", err)
	}

	// Validate job fields
	if job.Name == "" {
		return 0, errorsmod.Wrap(types.ErrEmptyName, "job name cannot be empty")
	}
	if job.JobType == "" {
		job.JobType = "general"
	}
	if job.ExecutionType == "" {
		job.ExecutionType = "docker"
	}

	// Allocate job ID
	jobId, err := k.ComputeJobCount.Next(ctx)
	if err != nil {
		return 0, err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockTime := sdkCtx.BlockTime().Unix()

	job.Id = jobId
	job.ResourceId = resourceId
	job.LeaseId = leaseId
	job.Submitter = submitter
	job.Provider = resource.Owner
	job.GpuType = resource.GpuModel
	job.GpuCount = resource.GpuCount
	job.Status = "pending"
	job.SubmittedAt = blockTime
	job.StartedAt = 0
	job.CompletedAt = 0

	bz, err := json.Marshal(job)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal compute job: %w", err)
	}
	if err := k.ComputeJobs.Set(ctx, jobId, string(bz)); err != nil {
		return 0, err
	}

	// Generate a challenge seed for proof-of-computation verification
	challenge, err := k.GenerateChallenge(ctx, jobId)
	if err != nil {
		return 0, fmt.Errorf("failed to generate compute challenge: %w", err)
	}

	// Update provider stats
	if err := k.incrementProviderJobCount(ctx, resource.Owner); err != nil {
		return 0, err
	}

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"submit_compute_job",
		sdk.NewAttribute("job_id", fmt.Sprintf("%d", jobId)),
		sdk.NewAttribute("resource_id", fmt.Sprintf("%d", resourceId)),
		sdk.NewAttribute("lease_id", fmt.Sprintf("%d", leaseId)),
		sdk.NewAttribute("submitter", submitter),
		sdk.NewAttribute("provider", resource.Owner),
		sdk.NewAttribute("job_type", job.JobType),
		sdk.NewAttribute("challenge_seed", challenge.ChallengeSeed),
	))

	return jobId, nil
}

// UpdateJobStatus updates the status of a compute job (provider only).
// When completing a job with a non-empty result, the caller must provide a
// valid challengeResponse = hex(sha256(resultHash + challengeSeed)).
func (k Keeper) UpdateJobStatus(ctx context.Context, jobId uint64, caller string, status string, result string, challengeResponse ...string) error {
	if _, err := k.addressCodec.StringToBytes(caller); err != nil {
		return errorsmod.Wrap(types.ErrInvalidAddress, "invalid caller address")
	}

	jobJSON, err := k.ComputeJobs.Get(ctx, jobId)
	if err != nil {
		return errorsmod.Wrap(types.ErrJobNotFound, "job not found")
	}
	var job types.ComputeJob
	if err := json.Unmarshal([]byte(jobJSON), &job); err != nil {
		return fmt.Errorf("failed to unmarshal compute job: %w", err)
	}

	// Only the provider can update job status
	if caller != job.Provider {
		return errorsmod.Wrap(types.ErrNotResourceOwner, "only the provider can update job status")
	}

	// Validate status transition
	validTransitions := map[string][]string{
		"pending": {"running", "cancelled", "failed"},
		"running": {"completed", "failed", "cancelled"},
	}
	allowed, ok := validTransitions[job.Status]
	if !ok {
		return errorsmod.Wrap(types.ErrInvalidJobStatus, "job is in a terminal state")
	}
	validStatus := false
	for _, s := range allowed {
		if s == status {
			validStatus = true
			break
		}
	}
	if !validStatus {
		return errorsmod.Wrapf(types.ErrInvalidJobStatus, "cannot transition from %s to %s", job.Status, status)
	}

	now := sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

	if status == "running" && job.StartedAt == 0 {
		job.StartedAt = now
	}
	if status == "completed" || status == "failed" || status == "cancelled" {
		job.CompletedAt = now
	}
	if status == "completed" {
		job.Result = result
		if result != "" {
			hash := sha256.Sum256([]byte(result))
			job.ResultHash = hex.EncodeToString(hash[:])

			// Verify the challenge response before accepting completion
			respStr := ""
			if len(challengeResponse) > 0 {
				respStr = challengeResponse[0]
			}

			valid, err := k.VerifyComputeProof(ctx, jobId, job.ResultHash, respStr)
			if err != nil {
				return errorsmod.Wrap(err, "challenge verification failed")
			}
			if !valid {
				return errorsmod.Wrap(types.ErrInvalidComputeProof, "challenge response does not match")
			}

			job.ChallengeResponse = respStr
		}
	}
	if status == "failed" {
		job.ErrorMessage = result
	}
	job.Status = status

	bz, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal compute job: %w", err)
	}
	if err := k.ComputeJobs.Set(ctx, jobId, string(bz)); err != nil {
		return err
	}

	// Update provider stats for completed/failed jobs
	if status == "completed" || status == "failed" {
		if err := k.updateProviderJobCompletion(ctx, job.Provider, status == "completed"); err != nil {
			return err
		}
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"update_job_status",
		sdk.NewAttribute("job_id", fmt.Sprintf("%d", jobId)),
		sdk.NewAttribute("status", status),
		sdk.NewAttribute("provider", job.Provider),
	))

	return nil
}

// UpdateGPUMetrics updates real-time GPU metrics for a resource (provider heartbeat).
func (k Keeper) UpdateGPUMetrics(ctx context.Context, resourceId uint64, caller string, metrics types.GPUMetrics) error {
	if _, err := k.addressCodec.StringToBytes(caller); err != nil {
		return errorsmod.Wrap(types.ErrInvalidAddress, "invalid caller address")
	}

	resourceJSON, err := k.ComputeResources.Get(ctx, resourceId)
	if err != nil {
		return errorsmod.Wrap(types.ErrComputeResourceNotFound, "resource not found")
	}
	var resource types.ComputeResource
	if err := json.Unmarshal([]byte(resourceJSON), &resource); err != nil {
		return fmt.Errorf("failed to unmarshal compute resource: %w", err)
	}

	if caller != resource.Owner {
		return errorsmod.Wrap(types.ErrNotResourceOwner, "only the resource owner can update metrics")
	}

	metrics.UpdatedAt = sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

	// Store metrics
	metricsBz, err := json.Marshal(metrics)
	if err != nil {
		return fmt.Errorf("failed to marshal GPU metrics: %w", err)
	}
	if err := k.GPUMetrics.Set(ctx, resourceId, string(metricsBz)); err != nil {
		return err
	}

	// Update resource with latest metrics
	resource.LastMetrics = &metrics
	if metrics.IsHealthy {
		if resource.CurrentLessee != "" {
			resource.ProviderStatus = "busy"
		} else {
			resource.ProviderStatus = "idle"
		}
	} else {
		resource.ProviderStatus = "offline"
	}

	resBz, err := json.Marshal(resource)
	if err != nil {
		return fmt.Errorf("failed to marshal compute resource: %w", err)
	}
	if err := k.ComputeResources.Set(ctx, resourceId, string(resBz)); err != nil {
		return err
	}

	// Update provider heartbeat timestamp
	if err := k.updateProviderHeartbeat(ctx, caller); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"update_gpu_metrics",
		sdk.NewAttribute("resource_id", fmt.Sprintf("%d", resourceId)),
		sdk.NewAttribute("provider", caller),
		sdk.NewAttribute("gpu_util", fmt.Sprintf("%d", metrics.UtilizationGPU)),
		sdk.NewAttribute("mem_util", fmt.Sprintf("%d", metrics.UtilizationMem)),
		sdk.NewAttribute("temperature", fmt.Sprintf("%d", metrics.Temperature)),
		sdk.NewAttribute("healthy", fmt.Sprintf("%t", metrics.IsHealthy)),
	))

	return nil
}

// QueryComputeJobs queries jobs by submitter, provider, or resource.
func (k Keeper) QueryComputeJobs(ctx context.Context, address string, resourceId uint64) ([]types.ComputeJob, error) {
	jobs := make([]types.ComputeJob, 0)
	err := k.ComputeJobs.Walk(ctx, nil, func(_ uint64, value string) (bool, error) {
		var job types.ComputeJob
		if err := json.Unmarshal([]byte(value), &job); err != nil {
			return false, nil // skip malformed entries
		}
		// Filter by address (submitter or provider) and/or resourceId
		matchAddr := address == "" || job.Submitter == address || job.Provider == address
		matchResource := resourceId == 0 || job.ResourceId == resourceId
		if matchAddr && matchResource {
			jobs = append(jobs, job)
		}
		return false, nil
	})
	if err != nil {
		return nil, err
	}
	return jobs, nil
}

// QueryProviderStats returns aggregate stats for a compute provider.
func (k Keeper) QueryProviderStats(ctx context.Context, address string) (*types.ProviderStats, error) {
	statsJSON, err := k.ProviderStats.Get(ctx, address)
	if err != nil {
		// Return default stats if no record exists yet
		return &types.ProviderStats{
			Address:      address,
			TotalRevenue: "0",
		}, nil
	}
	var stats types.ProviderStats
	if err := json.Unmarshal([]byte(statsJSON), &stats); err != nil {
		return nil, fmt.Errorf("failed to unmarshal provider stats: %w", err)
	}
	return &stats, nil
}

// incrementProviderJobCount increments total_jobs for the provider.
func (k Keeper) incrementProviderJobCount(ctx context.Context, provider string) error {
	stats, err := k.QueryProviderStats(ctx, provider)
	if err != nil {
		return err
	}
	stats.TotalJobs++

	bz, err := json.Marshal(stats)
	if err != nil {
		return fmt.Errorf("failed to marshal provider stats: %w", err)
	}
	return k.ProviderStats.Set(ctx, provider, string(bz))
}

// updateProviderJobCompletion updates completed/failed job counts.
func (k Keeper) updateProviderJobCompletion(ctx context.Context, provider string, completed bool) error {
	stats, err := k.QueryProviderStats(ctx, provider)
	if err != nil {
		return err
	}
	if completed {
		stats.CompletedJobs++
	} else {
		stats.FailedJobs++
	}

	bz, err := json.Marshal(stats)
	if err != nil {
		return fmt.Errorf("failed to marshal provider stats: %w", err)
	}
	return k.ProviderStats.Set(ctx, provider, string(bz))
}

// updateProviderHeartbeat updates the provider's last heartbeat timestamp.
func (k Keeper) updateProviderHeartbeat(ctx context.Context, provider string) error {
	stats, err := k.QueryProviderStats(ctx, provider)
	if err != nil {
		return err
	}
	stats.LastHeartbeat = sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

	bz, err := json.Marshal(stats)
	if err != nil {
		return fmt.Errorf("failed to marshal provider stats: %w", err)
	}
	return k.ProviderStats.Set(ctx, provider, string(bz))
}

// SettleCompletedJobs iterates compute jobs that are "completed" and releases
// the lease escrow to the provider if not already settled. This is called from
// the EndBlocker to ensure providers get paid promptly after job completion.
func (k Keeper) SettleCompletedJobs(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	return k.ComputeJobs.Walk(ctx, nil, func(_ uint64, jobJSON string) (bool, error) {
		var job types.ComputeJob
		if err := json.Unmarshal([]byte(jobJSON), &job); err != nil {
			return false, nil // skip malformed entries
		}
		if job.Status != "completed" || job.CompletedAt == 0 {
			return false, nil
		}

		// Look up the associated lease
		leaseJSON, err := k.ComputeLeases.Get(ctx, job.LeaseId)
		if err != nil {
			return false, nil // skip if lease not found
		}
		var lease types.ComputeLease
		if err := json.Unmarshal([]byte(leaseJSON), &lease); err != nil {
			return false, nil // skip malformed entries
		}

		// Only settle leases that are still "active"
		if lease.Status != "active" {
			return false, nil
		}

		// Verify the compute proof is present before settling
		if job.ResultHash != "" && job.ChallengeResponse != "" {
			valid, vErr := k.VerifyComputeProof(ctx, job.Id, job.ResultHash, job.ChallengeResponse)
			if vErr != nil || !valid {
				return false, nil // skip jobs with invalid proofs
			}
		}

		// Release escrow: send funds from module to provider
		totalCost := new(big.Int)
		if _, ok := totalCost.SetString(lease.TotalCostUclaw, 10); !ok || totalCost.Sign() <= 0 {
			return false, nil
		}

		coin, err := sdk.ParseCoinNormalized(lease.TotalCostUclaw + "uclaw")
		if err != nil || !coin.IsPositive() {
			return false, nil
		}

		providerAddr, err := sdk.AccAddressFromBech32(lease.Provider)
		if err != nil {
			return false, nil
		}

		if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, providerAddr, sdk.NewCoins(coin)); err != nil {
			return false, errorsmod.Wrap(err, "failed to settle escrow to provider")
		}

		// Mark lease as settled
		lease.Status = "settled"
		leaseBz, err := json.Marshal(lease)
		if err != nil {
			return false, fmt.Errorf("failed to marshal settled lease: %w", err)
		}
		if err := k.ComputeLeases.Set(ctx, lease.Id, string(leaseBz)); err != nil {
			return false, err
		}

		// Clear resource lease status
		resourceJSON, rErr := k.ComputeResources.Get(ctx, lease.ResourceId)
		if rErr == nil {
			var resource types.ComputeResource
			if json.Unmarshal([]byte(resourceJSON), &resource) == nil {
				resource.CurrentLessee = ""
				resource.LeaseExpiresAt = 0
				resBz, _ := json.Marshal(resource)
				_ = k.ComputeResources.Set(ctx, lease.ResourceId, string(resBz))
			}
		}

		sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
			"settle_compute_job",
			sdk.NewAttribute("job_id", fmt.Sprintf("%d", job.Id)),
			sdk.NewAttribute("lease_id", fmt.Sprintf("%d", lease.Id)),
			sdk.NewAttribute("provider", lease.Provider),
			sdk.NewAttribute("amount", lease.TotalCostUclaw+"uclaw"),
		))

		return false, nil
	})
}
