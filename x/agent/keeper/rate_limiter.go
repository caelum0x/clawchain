package keeper

import (
	"context"
	"sync"

	"clawchain/x/agent/types"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// blockRateLimiter tracks per-address action counts within a single block
// using an in-memory map that is reset in BeginBlocker. This avoids
// accumulating stale rate-limit entries in the persistent store.
type blockRateLimiter struct {
	mu            sync.Mutex
	actionCounts  map[string]uint64 // address → action count this block
	taskCounts    map[string]uint64 // address → task delegation count this block
}

func newBlockRateLimiter() *blockRateLimiter {
	return &blockRateLimiter{
		actionCounts: make(map[string]uint64),
		taskCounts:   make(map[string]uint64),
	}
}

// ResetBlockCounts clears all per-block rate limit counters.
// This MUST be called in BeginBlocker at the start of each block.
func (rl *blockRateLimiter) ResetBlockCounts() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.actionCounts = make(map[string]uint64)
	rl.taskCounts = make(map[string]uint64)
}

// IncrementActionCount increments the action count for the given address
// and returns an error if the per-block limit is exceeded.
func (rl *blockRateLimiter) IncrementActionCount(address string, max uint64) error {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	count := rl.actionCounts[address] + 1
	if count > max {
		return errorsmod.Wrapf(
			types.ErrRateLimitExceeded,
			"actions: agent %s exceeded per-block limit (%d)",
			address, max,
		)
	}
	rl.actionCounts[address] = count
	return nil
}

// IncrementTaskCount increments the task delegation count for the given
// address and returns an error if the per-block limit is exceeded.
func (rl *blockRateLimiter) IncrementTaskCount(address string, max uint64) error {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	count := rl.taskCounts[address] + 1
	if count > max {
		return errorsmod.Wrapf(
			types.ErrRateLimitExceeded,
			"tasks: agent %s exceeded per-block limit (%d)",
			address, max,
		)
	}
	rl.taskCounts[address] = count
	return nil
}

// GetActionCount returns the current block's action count for an address.
func (rl *blockRateLimiter) GetActionCount(address string) uint64 {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	return rl.actionCounts[address]
}

// GetTaskCount returns the current block's task delegation count for an address.
func (rl *blockRateLimiter) GetTaskCount(address string) uint64 {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	return rl.taskCounts[address]
}

// ---------------------------------------------------------------------------
// Keeper-level wrappers
// ---------------------------------------------------------------------------

// ResetBlockCounts resets all per-block rate limit counters. Called in
// BeginBlocker at the start of each block.
func (k Keeper) ResetBlockCounts(_ context.Context) {
	if k.rateLimiter != nil {
		k.rateLimiter.ResetBlockCounts()
	}
}

// IncrementActionCount increments the per-block action counter for the
// given address and returns ErrRateLimitExceeded if the limit is hit.
func (k Keeper) IncrementActionCount(ctx context.Context, address string) error {
	if k.rateLimiter == nil {
		return nil
	}
	params, err := k.Params.Get(ctx)
	if err != nil {
		return errorsmod.Wrap(err, "failed to load params for action rate limit")
	}
	max := params.MaxActionsPerBlock
	if max == 0 {
		max = types.DefaultMaxActionsPerBlock
	}
	return k.rateLimiter.IncrementActionCount(address, max)
}

// IncrementTaskCount increments the per-block task delegation counter for
// the given address and returns ErrRateLimitExceeded if the limit is hit.
func (k Keeper) IncrementTaskCount(ctx context.Context, address string) error {
	if k.rateLimiter == nil {
		return nil
	}
	params, err := k.Params.Get(ctx)
	if err != nil {
		return errorsmod.Wrap(err, "failed to load params for task rate limit")
	}
	max := params.MaxTasksPerBlock
	if max == 0 {
		max = types.DefaultMaxTasksPerBlock
	}
	return k.rateLimiter.IncrementTaskCount(address, max)
}

// GetActionCount returns the current block's action count for the address.
func (k Keeper) GetActionCount(_ context.Context, address string) uint64 {
	if k.rateLimiter == nil {
		return 0
	}
	return k.rateLimiter.GetActionCount(address)
}

// GetTaskCount returns the current block's task count for the address.
func (k Keeper) GetTaskCount(_ context.Context, address string) uint64 {
	if k.rateLimiter == nil {
		return 0
	}
	return k.rateLimiter.GetTaskCount(address)
}

// ---------------------------------------------------------------------------
// Backward-compatible wrappers used by policy.go's enforceActionRateLimit
// and enforceTaskRateLimit. These call the in-memory rate limiter instead
// of (or in addition to) the collections-based counters.
// ---------------------------------------------------------------------------

// checkActionRateLimit checks the in-memory per-block action rate limit.
// Returns nil if within limits or if the rate limiter is not initialised.
func (k Keeper) checkActionRateLimit(ctx context.Context, address string) error {
	return k.IncrementActionCount(ctx, address)
}

// checkTaskRateLimit checks the in-memory per-block task rate limit.
func (k Keeper) checkTaskRateLimit(ctx context.Context, address string) error {
	return k.IncrementTaskCount(ctx, address)
}

// sdkContext is a helper that unwraps the SDK context.
func sdkContext(ctx context.Context) sdk.Context {
	return sdk.UnwrapSDKContext(ctx)
}
