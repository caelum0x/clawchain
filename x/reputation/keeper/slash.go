package keeper

import (
	"context"
	"errors"
	"fmt"

	"cosmossdk.io/collections"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// SlashReputation decrements an agent's uptime reputation score by `points`,
// saturating at a floor of 0 (never underflowing the uint64 score). It is
// safe to call for an unknown address: missing reputation is treated the same
// way GetReputation treats it (an implicit score of 0), so a slash of an
// unknown address simply floors at 0 and is effectively a no-op.
//
// The operation is idempotent in the sense that repeated slashes of an
// already-zero score leave the score at 0. A typed `slash_reputation` event is
// emitted with the address, points applied, and the resulting new score.
func (k Keeper) SlashReputation(ctx context.Context, agentAddress string, points uint64) error {
	rep, err := k.Reputations.Get(ctx, agentAddress)
	if err != nil {
		if !errors.Is(err, collections.ErrNotFound) {
			return fmt.Errorf("failed to load reputation for %s: %w", agentAddress, err)
		}
		// Unknown address: nothing stored means an implicit score of 0.
		// A slash floors at 0, so this is a no-op. Emit the event for
		// observability and return without writing an empty record.
		k.emitSlashEvent(ctx, agentAddress, points, 0)
		return nil
	}

	// Saturating subtraction: never underflow the uint64 score.
	newScore := uint64(0)
	if rep.UptimeScoreBps > points {
		newScore = rep.UptimeScoreBps - points
	}
	rep.UptimeScoreBps = newScore
	rep.LastUpdated = sdk.UnwrapSDKContext(ctx).BlockHeight()

	if err := k.Reputations.Set(ctx, agentAddress, rep); err != nil {
		return fmt.Errorf("failed to persist slashed reputation for %s: %w", agentAddress, err)
	}

	k.emitSlashEvent(ctx, agentAddress, points, newScore)
	return nil
}

// maxUptimeScoreBps is the ceiling for an agent's uptime reputation score
// (basis points). Restores saturate at this value so a restore can never push
// a score above the maximum a fresh record starts at.
const maxUptimeScoreBps uint64 = 10000

// RestoreReputation increments an agent's uptime reputation score by `points`,
// saturating at a ceiling of maxUptimeScoreBps (never exceeding the maximum). It
// is the symmetric counterpart to SlashReputation and is used to undo a slash
// when a dispute is rejected. It is safe to call for an unknown address: missing
// reputation is treated the same way GetReputation treats it (no stored record),
// so a restore of an unknown address is a no-op — no empty record is written.
//
// A typed `restore_reputation` event is emitted with the address, points
// applied, and the resulting new score.
func (k Keeper) RestoreReputation(ctx context.Context, agentAddress string, points uint64) error {
	rep, err := k.Reputations.Get(ctx, agentAddress)
	if err != nil {
		if !errors.Is(err, collections.ErrNotFound) {
			return fmt.Errorf("failed to load reputation for %s: %w", agentAddress, err)
		}
		// Unknown address: nothing stored. Mirror GetReputation's missing
		// handling and SlashReputation's no-op behaviour — do not create a
		// record. Emit the event for observability and return.
		k.emitRestoreEvent(ctx, agentAddress, points, 0)
		return nil
	}

	// Saturating addition: never exceed the ceiling.
	newScore := rep.UptimeScoreBps + points
	if newScore > maxUptimeScoreBps {
		newScore = maxUptimeScoreBps
	}
	rep.UptimeScoreBps = newScore
	rep.LastUpdated = sdk.UnwrapSDKContext(ctx).BlockHeight()

	if err := k.Reputations.Set(ctx, agentAddress, rep); err != nil {
		return fmt.Errorf("failed to persist restored reputation for %s: %w", agentAddress, err)
	}

	k.emitRestoreEvent(ctx, agentAddress, points, newScore)
	return nil
}

// emitRestoreEvent emits a typed restore_reputation event.
func (k Keeper) emitRestoreEvent(ctx context.Context, agentAddress string, points, newScore uint64) {
	sdk.UnwrapSDKContext(ctx).EventManager().EmitEvent(sdk.NewEvent(
		"restore_reputation",
		sdk.NewAttribute("address", agentAddress),
		sdk.NewAttribute("points", fmt.Sprintf("%d", points)),
		sdk.NewAttribute("new_score", fmt.Sprintf("%d", newScore)),
	))
}

// emitSlashEvent emits a typed slash_reputation event.
func (k Keeper) emitSlashEvent(ctx context.Context, agentAddress string, points, newScore uint64) {
	sdk.UnwrapSDKContext(ctx).EventManager().EmitEvent(sdk.NewEvent(
		"slash_reputation",
		sdk.NewAttribute("address", agentAddress),
		sdk.NewAttribute("points", fmt.Sprintf("%d", points)),
		sdk.NewAttribute("new_score", fmt.Sprintf("%d", newScore)),
	))
}
