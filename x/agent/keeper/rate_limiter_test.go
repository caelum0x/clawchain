//go:build integration

package keeper_test

import (
	"testing"

	"clawchain/x/agent/types"
)

// TestRateLimiter_IncrementAndLimit verifies that incrementing an action
// count up to the configured limit succeeds and that the next increment
// returns ErrRateLimitExceeded.
func TestRateLimiter_IncrementAndLimit(t *testing.T) {
	f := initFixture(t)

	addr := "cosmos1testaddr1"
	params, err := f.keeper.Params.Get(f.ctx)
	if err != nil {
		t.Fatalf("failed to get params: %v", err)
	}
	max := params.MaxActionsPerBlock
	if max == 0 {
		max = types.DefaultMaxActionsPerBlock
	}

	// Increment up to the limit — all should succeed.
	for i := uint64(0); i < max; i++ {
		if err := f.keeper.IncrementActionCount(f.ctx, addr); err != nil {
			t.Fatalf("increment %d/%d should succeed, got error: %v", i+1, max, err)
		}
	}

	// Verify the count matches the limit.
	got := f.keeper.GetActionCount(f.ctx, addr)
	if got != max {
		t.Fatalf("expected action count %d, got %d", max, got)
	}

	// The next increment must fail with ErrRateLimitExceeded.
	err = f.keeper.IncrementActionCount(f.ctx, addr)
	if err == nil {
		t.Fatal("expected ErrRateLimitExceeded after exceeding limit, got nil")
	}
	if !types.ErrRateLimitExceeded.Is(err) {
		t.Fatalf("expected ErrRateLimitExceeded, got: %v", err)
	}
}

// TestRateLimiter_Reset verifies that ResetBlockCounts clears all
// per-block counters back to zero.
func TestRateLimiter_Reset(t *testing.T) {
	f := initFixture(t)

	addr := "cosmos1testaddr2"

	// Increment a few times.
	for i := 0; i < 3; i++ {
		if err := f.keeper.IncrementActionCount(f.ctx, addr); err != nil {
			t.Fatalf("increment %d should succeed: %v", i+1, err)
		}
	}
	for i := 0; i < 2; i++ {
		if err := f.keeper.IncrementTaskCount(f.ctx, addr); err != nil {
			t.Fatalf("task increment %d should succeed: %v", i+1, err)
		}
	}

	if f.keeper.GetActionCount(f.ctx, addr) != 3 {
		t.Fatalf("expected action count 3, got %d", f.keeper.GetActionCount(f.ctx, addr))
	}
	if f.keeper.GetTaskCount(f.ctx, addr) != 2 {
		t.Fatalf("expected task count 2, got %d", f.keeper.GetTaskCount(f.ctx, addr))
	}

	// Reset and verify counts are zero.
	f.keeper.ResetBlockCounts(f.ctx)

	if f.keeper.GetActionCount(f.ctx, addr) != 0 {
		t.Fatalf("expected action count 0 after reset, got %d", f.keeper.GetActionCount(f.ctx, addr))
	}
	if f.keeper.GetTaskCount(f.ctx, addr) != 0 {
		t.Fatalf("expected task count 0 after reset, got %d", f.keeper.GetTaskCount(f.ctx, addr))
	}

	// Verify we can increment again after reset.
	if err := f.keeper.IncrementActionCount(f.ctx, addr); err != nil {
		t.Fatalf("increment after reset should succeed: %v", err)
	}
	if f.keeper.GetActionCount(f.ctx, addr) != 1 {
		t.Fatalf("expected action count 1 after re-increment, got %d", f.keeper.GetActionCount(f.ctx, addr))
	}
}

// TestRateLimiter_IndependentAddresses verifies that two different
// addresses have independent rate-limit counters.
func TestRateLimiter_IndependentAddresses(t *testing.T) {
	f := initFixture(t)

	addrA := "cosmos1addrA"
	addrB := "cosmos1addrB"

	params, err := f.keeper.Params.Get(f.ctx)
	if err != nil {
		t.Fatalf("failed to get params: %v", err)
	}
	max := params.MaxActionsPerBlock
	if max == 0 {
		max = types.DefaultMaxActionsPerBlock
	}

	// Fill addrA to its limit.
	for i := uint64(0); i < max; i++ {
		if err := f.keeper.IncrementActionCount(f.ctx, addrA); err != nil {
			t.Fatalf("addrA increment %d should succeed: %v", i+1, err)
		}
	}

	// addrA is now at the limit.
	err = f.keeper.IncrementActionCount(f.ctx, addrA)
	if err == nil {
		t.Fatal("addrA should be rate-limited")
	}

	// addrB should still be able to increment freely.
	if err := f.keeper.IncrementActionCount(f.ctx, addrB); err != nil {
		t.Fatalf("addrB increment should succeed (independent counter): %v", err)
	}
	if f.keeper.GetActionCount(f.ctx, addrB) != 1 {
		t.Fatalf("expected addrB action count 1, got %d", f.keeper.GetActionCount(f.ctx, addrB))
	}
	if f.keeper.GetActionCount(f.ctx, addrA) != max {
		t.Fatalf("expected addrA action count %d, got %d", max, f.keeper.GetActionCount(f.ctx, addrA))
	}
}

// TestRateLimiter_TaskLimit verifies that the task delegation limit is
// enforced independently from the action limit.
func TestRateLimiter_TaskLimit(t *testing.T) {
	f := initFixture(t)

	addr := "cosmos1taskaddr"

	params, err := f.keeper.Params.Get(f.ctx)
	if err != nil {
		t.Fatalf("failed to get params: %v", err)
	}
	maxTasks := params.MaxTasksPerBlock
	if maxTasks == 0 {
		maxTasks = types.DefaultMaxTasksPerBlock
	}
	maxActions := params.MaxActionsPerBlock
	if maxActions == 0 {
		maxActions = types.DefaultMaxActionsPerBlock
	}

	// Increment task count to the limit.
	for i := uint64(0); i < maxTasks; i++ {
		if err := f.keeper.IncrementTaskCount(f.ctx, addr); err != nil {
			t.Fatalf("task increment %d/%d should succeed: %v", i+1, maxTasks, err)
		}
	}

	// The next task increment must fail.
	err = f.keeper.IncrementTaskCount(f.ctx, addr)
	if err == nil {
		t.Fatal("expected ErrRateLimitExceeded for tasks, got nil")
	}
	if !types.ErrRateLimitExceeded.Is(err) {
		t.Fatalf("expected ErrRateLimitExceeded, got: %v", err)
	}

	// Action limit should still be available for the same address.
	if err := f.keeper.IncrementActionCount(f.ctx, addr); err != nil {
		t.Fatalf("action increment should succeed even though task limit hit: %v", err)
	}
	if f.keeper.GetActionCount(f.ctx, addr) != 1 {
		t.Fatalf("expected action count 1, got %d", f.keeper.GetActionCount(f.ctx, addr))
	}
}

// TestRateLimiter_ZeroMaxAllowsAll verifies that when the param is set to
// 0, the keeper falls back to the default limit (not unlimited).
func TestRateLimiter_ZeroMaxAllowsAll(t *testing.T) {
	f := initFixture(t)

	// Set MaxActionsPerBlock to 0 to trigger the default fallback.
	params, err := f.keeper.Params.Get(f.ctx)
	if err != nil {
		t.Fatalf("failed to get params: %v", err)
	}
	params.MaxActionsPerBlock = 0
	params.MaxTasksPerBlock = 0
	if err := f.keeper.Params.Set(f.ctx, params); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	addr := "cosmos1zeromax"

	// The keeper should fall back to DefaultMaxActionsPerBlock.
	for i := uint64(0); i < types.DefaultMaxActionsPerBlock; i++ {
		if err := f.keeper.IncrementActionCount(f.ctx, addr); err != nil {
			t.Fatalf("increment %d should succeed with default fallback: %v", i+1, err)
		}
	}

	// The next one should be rate-limited at the default.
	err = f.keeper.IncrementActionCount(f.ctx, addr)
	if err == nil {
		t.Fatal("expected ErrRateLimitExceeded at default limit, got nil")
	}
	if !types.ErrRateLimitExceeded.Is(err) {
		t.Fatalf("expected ErrRateLimitExceeded, got: %v", err)
	}

	// Same for tasks.
	addrTask := "cosmos1zerotask"
	for i := uint64(0); i < types.DefaultMaxTasksPerBlock; i++ {
		if err := f.keeper.IncrementTaskCount(f.ctx, addrTask); err != nil {
			t.Fatalf("task increment %d should succeed with default fallback: %v", i+1, err)
		}
	}
	err = f.keeper.IncrementTaskCount(f.ctx, addrTask)
	if err == nil {
		t.Fatal("expected ErrRateLimitExceeded for tasks at default limit, got nil")
	}
	if !types.ErrRateLimitExceeded.Is(err) {
		t.Fatalf("expected ErrRateLimitExceeded for tasks, got: %v", err)
	}
}

// TestRateLimiter_KeeperIntegration uses the full initFixture to get a
// real keeper and verifies IncrementActionCount works end-to-end with
// real params from the store.
func TestRateLimiter_KeeperIntegration(t *testing.T) {
	f := initFixture(t)

	// Verify params are loaded correctly.
	params, err := f.keeper.Params.Get(f.ctx)
	if err != nil {
		t.Fatalf("failed to get params: %v", err)
	}
	if params.MaxActionsPerBlock == 0 {
		t.Log("MaxActionsPerBlock is 0 in stored params; keeper will use DefaultMaxActionsPerBlock")
	}

	addr := "cosmos1integration"

	// First increment should succeed.
	if err := f.keeper.IncrementActionCount(f.ctx, addr); err != nil {
		t.Fatalf("first action increment should succeed: %v", err)
	}
	if f.keeper.GetActionCount(f.ctx, addr) != 1 {
		t.Fatalf("expected action count 1, got %d", f.keeper.GetActionCount(f.ctx, addr))
	}

	// First task increment should succeed.
	if err := f.keeper.IncrementTaskCount(f.ctx, addr); err != nil {
		t.Fatalf("first task increment should succeed: %v", err)
	}
	if f.keeper.GetTaskCount(f.ctx, addr) != 1 {
		t.Fatalf("expected task count 1, got %d", f.keeper.GetTaskCount(f.ctx, addr))
	}

	// Reset and verify counts are cleared.
	f.keeper.ResetBlockCounts(f.ctx)
	if f.keeper.GetActionCount(f.ctx, addr) != 0 {
		t.Fatalf("expected action count 0 after reset, got %d", f.keeper.GetActionCount(f.ctx, addr))
	}
	if f.keeper.GetTaskCount(f.ctx, addr) != 0 {
		t.Fatalf("expected task count 0 after reset, got %d", f.keeper.GetTaskCount(f.ctx, addr))
	}

	// Fill to the effective limit and verify enforcement.
	effectiveMax := params.MaxActionsPerBlock
	if effectiveMax == 0 {
		effectiveMax = types.DefaultMaxActionsPerBlock
	}
	for i := uint64(0); i < effectiveMax; i++ {
		if err := f.keeper.IncrementActionCount(f.ctx, addr); err != nil {
			t.Fatalf("increment %d/%d should succeed: %v", i+1, effectiveMax, err)
		}
	}
	err = f.keeper.IncrementActionCount(f.ctx, addr)
	if err == nil {
		t.Fatal("expected ErrRateLimitExceeded at limit, got nil")
	}
	if !types.ErrRateLimitExceeded.Is(err) {
		t.Fatalf("expected ErrRateLimitExceeded, got: %v", err)
	}
}
