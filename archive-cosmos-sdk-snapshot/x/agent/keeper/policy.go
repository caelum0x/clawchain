package keeper

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdkmath "cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// ---------------------------------------------------------------------------
// Rate-limit helpers (generic)
// ---------------------------------------------------------------------------

func rateLimitKey(address string, blockHeight int64) string {
	return fmt.Sprintf("%s:%d", address, blockHeight)
}

// enforceRateLimit is a generic per-agent per-block rate limiter that uses
// the given collection to track counts and the given max as the ceiling.
func enforceRateLimit(
	ctx context.Context,
	coll collections.Map[string, uint64],
	address string,
	max uint64,
	errMsg string,
) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	key := rateLimitKey(address, sdkCtx.BlockHeight())

	count, err := coll.Get(ctx, key)
	if err != nil {
		if !errors.Is(err, collections.ErrNotFound) {
			return errorsmod.Wrap(err, "failed to load rate counter")
		}
		count = 0
	}

	count++
	if count > max {
		return errorsmod.Wrapf(
			types.ErrRateLimitExceeded,
			"%s: agent %s exceeded per-block limit (%d)",
			errMsg, address, max,
		)
	}
	if err := coll.Set(ctx, key, count); err != nil {
		return errorsmod.Wrap(err, "failed to persist rate counter")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Per-message-type rate limiters
// ---------------------------------------------------------------------------

func (k Keeper) enforceActionRateLimit(ctx context.Context, address string) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return errorsmod.Wrap(err, "failed to load params for action rate limit")
	}
	max := params.MaxActionsPerBlock
	if max == 0 {
		max = types.DefaultMaxActionsPerBlock
	}
	return enforceRateLimit(ctx, k.AgentActionRate, address, max, "actions")
}

func (k Keeper) enforceIntentRateLimit(ctx context.Context, address string) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return errorsmod.Wrap(err, "failed to load params for intent rate limit")
	}
	max := params.MaxIntentsPerBlock
	if max == 0 {
		max = types.DefaultMaxIntentsPerBlock
	}
	return enforceRateLimit(ctx, k.IntentActionRate, address, max, "intents")
}

func (k Keeper) enforceTaskRateLimit(ctx context.Context, address string) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return errorsmod.Wrap(err, "failed to load params for task rate limit")
	}
	max := params.MaxTasksPerBlock
	if max == 0 {
		max = types.DefaultMaxTasksPerBlock
	}
	return enforceRateLimit(ctx, k.TaskActionRate, address, max, "tasks")
}

// ---------------------------------------------------------------------------
// Heartbeat interval enforcement
// ---------------------------------------------------------------------------

func (k Keeper) enforceHeartbeatInterval(ctx context.Context, address string) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return errorsmod.Wrap(err, "failed to load params for heartbeat interval")
	}
	minInterval := params.MinHeartbeatIntervalBlocks
	if minInterval == 0 {
		return nil // disabled
	}

	liveness, err := k.AgentLiveness.Get(ctx, address)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil // first heartbeat
		}
		return errorsmod.Wrap(err, "failed to load agent liveness")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	gap := uint64(sdkCtx.BlockHeight() - liveness.LastHeartbeatHeight)
	if gap < minInterval {
		return errorsmod.Wrapf(
			types.ErrHeartbeatTooFrequent,
			"agent %s must wait %d more blocks (interval=%d, elapsed=%d)",
			address, minInterval-gap, minInterval, gap,
		)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Payload size enforcement
// ---------------------------------------------------------------------------

func (k Keeper) enforcePayloadSize(ctx context.Context, fields ...string) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return errorsmod.Wrap(err, "failed to load params for payload size check")
	}
	max := params.MaxPayloadBytes
	if max == 0 {
		max = types.DefaultMaxPayloadBytes
	}
	for _, f := range fields {
		if uint64(len(f)) > max {
			return errorsmod.Wrapf(
				types.ErrPayloadTooLarge,
				"field length %d exceeds max_payload_bytes %d",
				len(f), max,
			)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Economic policy hooks
// ---------------------------------------------------------------------------

func parseDepositUclaw(raw string) (uint64, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0, errorsmod.Wrap(types.ErrInsufficientDeposit, "deposit amount missing")
	}
	amount, err := strconv.ParseUint(trimmed, 10, 64)
	if err != nil {
		return 0, errorsmod.Wrap(types.ErrInsufficientDeposit, "invalid deposit amount")
	}
	return amount, nil
}

func enforceHighImpactActionDeposit(depositAmount string, minRequired uint64, actionType string) error {
	if minRequired == 0 {
		minRequired = types.DefaultHighImpactMinDepositUClaw
	}

	// Treat transfer/coordinate as high-impact; query remains low-impact.
	if actionType != "transfer" && actionType != "coordinate" {
		return nil
	}

	deposit, err := parseDepositUclaw(depositAmount)
	if err != nil {
		return err
	}
	if deposit < minRequired {
		return errorsmod.Wrapf(
			types.ErrInsufficientDeposit,
			"high-impact action requires deposit >= %d uclaw",
			minRequired,
		)
	}
	return nil
}

func taskQualityTier(deadlineBlocks int64, expeditedMaxDeadline uint64) string {
	if deadlineBlocks <= 0 {
		return "base"
	}
	if uint64(deadlineBlocks) <= expeditedMaxDeadline {
		return "expedited"
	}
	return "standard"
}

func requiredTaskTierBudget(
	deadlineBlocks int64,
	minBudget uint64,
	standardMin uint64,
	expeditedMin uint64,
	expeditedMaxDeadline uint64,
) (tier string, required uint64) {
	tier = taskQualityTier(deadlineBlocks, expeditedMaxDeadline)
	switch tier {
	case "expedited":
		return tier, expeditedMin
	case "standard":
		return tier, standardMin
	default:
		return tier, minBudget
	}
}

// ---------------------------------------------------------------------------
// Task budget validation
// ---------------------------------------------------------------------------

func validateTaskBudget(
	budget string,
	deadlineBlocks int64,
	minTaskBudgetUclaw uint64,
	standardTaskMinBudgetUclaw uint64,
	expeditedTaskMinBudgetUclaw uint64,
	expeditedTaskMaxDeadlineBlocks uint64,
) (tier string, required uint64, err error) {
	trimmed := strings.TrimSpace(budget)
	amount, ok := sdkmath.NewIntFromString(trimmed)
	if !ok || !amount.IsPositive() {
		return "", 0, errorsmod.Wrap(types.ErrInvalidBudget, "budget must be a positive integer uclaw amount")
	}

	if minTaskBudgetUclaw == 0 {
		minTaskBudgetUclaw = types.DefaultMinTaskBudgetUClaw
	}
	if standardTaskMinBudgetUclaw == 0 {
		standardTaskMinBudgetUclaw = types.DefaultStandardTaskMinBudgetUClaw
	}
	if expeditedTaskMinBudgetUclaw == 0 {
		expeditedTaskMinBudgetUclaw = types.DefaultExpeditedTaskMinBudgetUClaw
	}
	if expeditedTaskMaxDeadlineBlocks == 0 {
		expeditedTaskMaxDeadlineBlocks = types.DefaultExpeditedTaskMaxDeadlineBlocks
	}

	tier, required = requiredTaskTierBudget(
		deadlineBlocks,
		minTaskBudgetUclaw,
		standardTaskMinBudgetUclaw,
		expeditedTaskMinBudgetUclaw,
		expeditedTaskMaxDeadlineBlocks,
	)

	min := sdkmath.NewIntFromUint64(required)
	if amount.LT(min) {
		return tier, required, errorsmod.Wrapf(types.ErrInvalidBudget, "%s tier task budget must be >= %d uclaw", tier, required)
	}

	return tier, required, nil
}
