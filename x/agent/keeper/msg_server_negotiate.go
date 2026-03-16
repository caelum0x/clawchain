package keeper

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// ProposeNegotiation creates a new negotiation with initial terms.
func (k Keeper) ProposeNegotiation(
	ctx context.Context,
	initiator, counterparty, description, requirements string,
	skillId uint64,
	budget string,
	deadlineBlocks int64,
	maxRounds uint32,
) (uint64, error) {
	// Validate initiator address.
	if _, err := k.addressCodec.StringToBytes(initiator); err != nil {
		return 0, errorsmod.Wrap(types.ErrInvalidAddress, "invalid initiator address")
	}

	// Validate counterparty address.
	if _, err := k.addressCodec.StringToBytes(counterparty); err != nil {
		return 0, errorsmod.Wrap(types.ErrInvalidAddress, "invalid counterparty address")
	}

	// Reject self-negotiation.
	if initiator == counterparty {
		return 0, errorsmod.Wrap(types.ErrSelfNegotiation, "cannot negotiate with yourself")
	}

	// Validate description is not empty.
	if description == "" {
		return 0, errorsmod.Wrap(types.ErrInvalidIntentPayload, "description cannot be empty")
	}

	// Check initiator is a registered active agent.
	initiatorAgent, err := k.Agents.Get(ctx, initiator)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return 0, errorsmod.Wrap(types.ErrAgentNotFound, initiator)
		}
		return 0, errorsmod.Wrap(err, "failed to look up initiator agent")
	}
	if !initiatorAgent.Active {
		return 0, errorsmod.Wrap(types.ErrAgentInactive, "initiator agent is inactive")
	}

	// Check counterparty is a registered active agent.
	counterpartyAgent, err := k.Agents.Get(ctx, counterparty)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return 0, errorsmod.Wrap(types.ErrAgentNotFound, counterparty)
		}
		return 0, errorsmod.Wrap(err, "failed to look up counterparty agent")
	}
	if !counterpartyAgent.Active {
		return 0, errorsmod.Wrap(types.ErrAgentInactive, "counterparty agent is inactive")
	}

	// Set defaults.
	if maxRounds == 0 {
		maxRounds = types.DefaultNegotiationMaxRounds
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentHeight := sdkCtx.BlockHeight()

	// Generate negotiation ID.
	negID, err := k.NegotiationCount.Next(ctx)
	if err != nil {
		return 0, errorsmod.Wrap(err, "failed to generate negotiation ID")
	}

	negotiation := types.Negotiation{
		Id:               negID,
		Initiator:        initiator,
		Counterparty:     counterparty,
		Description:      description,
		Requirements:     requirements,
		SkillId:          skillId,
		ProposedBudget:   budget,
		ProposedDeadline: deadlineBlocks,
		Status:           types.NegotiationStatusOpen,
		Round:            0,
		MaxRounds:        maxRounds,
		LastProposer:     initiator,
		CreatedAt:        currentHeight,
		UpdatedAt:        currentHeight,
		ExpiresAt:        currentHeight + types.DefaultNegotiationExpiryBlocks,
		History: []types.NegotiationRound{
			{
				Round:    0,
				Proposer: initiator,
				Budget:   budget,
				Deadline: deadlineBlocks,
				Height:   currentHeight,
			},
		},
	}

	data, err := json.Marshal(negotiation)
	if err != nil {
		return 0, errorsmod.Wrap(err, "failed to marshal negotiation")
	}

	if err := k.Negotiations.Set(ctx, negID, string(data)); err != nil {
		return 0, errorsmod.Wrap(err, "failed to store negotiation")
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"negotiation_proposed",
			sdk.NewAttribute("negotiation_id", fmt.Sprintf("%d", negID)),
			sdk.NewAttribute("initiator", initiator),
			sdk.NewAttribute("counterparty", counterparty),
			sdk.NewAttribute("budget", budget),
			sdk.NewAttribute("deadline_blocks", fmt.Sprintf("%d", deadlineBlocks)),
		),
	)

	return negID, nil
}

// CounterNegotiation submits a counter-proposal on an existing negotiation.
func (k Keeper) CounterNegotiation(
	ctx context.Context,
	negotiationId uint64,
	caller, newBudget string,
	newDeadline int64,
	message string,
) error {
	neg, err := k.getNegotiation(ctx, negotiationId)
	if err != nil {
		return err
	}

	// Validate negotiation is active (open or countered).
	if neg.Status != types.NegotiationStatusOpen && neg.Status != types.NegotiationStatusCountered {
		return errorsmod.Wrap(types.ErrNegotiationNotActive, "negotiation is not open or countered")
	}

	// Only the counterparty (the non-last-proposer) can counter.
	if caller == neg.LastProposer {
		return errorsmod.Wrap(types.ErrNotCounterparty, "cannot counter your own proposal; wait for the other party")
	}
	if caller != neg.Initiator && caller != neg.Counterparty {
		return errorsmod.Wrap(types.ErrNotNegotiationParty, "caller is not a party to this negotiation")
	}

	// Check round limit.
	if neg.Round+1 >= neg.MaxRounds {
		return errorsmod.Wrap(types.ErrNegotiationMaxRounds, "negotiation has reached the maximum number of rounds")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentHeight := sdkCtx.BlockHeight()

	neg.Round++
	neg.ProposedBudget = newBudget
	neg.ProposedDeadline = newDeadline
	neg.LastProposer = caller
	neg.Status = types.NegotiationStatusCountered
	neg.UpdatedAt = currentHeight
	// Reset expiry with each counter.
	neg.ExpiresAt = currentHeight + types.DefaultNegotiationExpiryBlocks

	neg.History = append(neg.History, types.NegotiationRound{
		Round:    neg.Round,
		Proposer: caller,
		Budget:   newBudget,
		Deadline: newDeadline,
		Message:  message,
		Height:   currentHeight,
	})

	if err := k.setNegotiation(ctx, neg); err != nil {
		return err
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"negotiation_countered",
			sdk.NewAttribute("negotiation_id", fmt.Sprintf("%d", negotiationId)),
			sdk.NewAttribute("round", fmt.Sprintf("%d", neg.Round)),
			sdk.NewAttribute("proposer", caller),
			sdk.NewAttribute("budget", newBudget),
			sdk.NewAttribute("deadline_blocks", fmt.Sprintf("%d", newDeadline)),
		),
	)

	return nil
}

// AcceptNegotiation accepts the current terms and creates a task.
func (k Keeper) AcceptNegotiation(ctx context.Context, negotiationId uint64, caller string) (uint64, error) {
	neg, err := k.getNegotiation(ctx, negotiationId)
	if err != nil {
		return 0, err
	}

	// Validate negotiation is active.
	if neg.Status != types.NegotiationStatusOpen && neg.Status != types.NegotiationStatusCountered {
		return 0, errorsmod.Wrap(types.ErrNegotiationNotActive, "negotiation is not open or countered")
	}

	// Only the counterparty (non-last-proposer) can accept.
	if caller == neg.LastProposer {
		return 0, errorsmod.Wrap(types.ErrNotCounterparty, "cannot accept your own proposal; wait for the other party")
	}
	if caller != neg.Initiator && caller != neg.Counterparty {
		return 0, errorsmod.Wrap(types.ErrNotNegotiationParty, "caller is not a party to this negotiation")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentHeight := sdkCtx.BlockHeight()

	neg.Status = types.NegotiationStatusAccepted
	neg.UpdatedAt = currentHeight

	if err := k.setNegotiation(ctx, neg); err != nil {
		return 0, err
	}

	// Create a task from the negotiated terms.
	// The initiator is the delegator, the counterparty is the assignee.
	taskID, err := k.TaskCount.Next(ctx)
	if err != nil {
		return 0, errorsmod.Wrap(err, "failed to generate task ID")
	}

	task := types.TaskRecord{
		TaskId:           taskID,
		DelegatorAddress: neg.Initiator,
		AssigneeAddress:  neg.Counterparty,
		Description:      neg.Description,
		Requirements:     neg.Requirements,
		SkillId:          neg.SkillId,
		Budget:           neg.ProposedBudget,
		DeadlineBlocks:   neg.ProposedDeadline,
		CreatedAt:        currentHeight,
		Status:           "pending",
	}

	if err := k.Tasks.Set(ctx, taskID, task); err != nil {
		return 0, errorsmod.Wrap(err, "failed to store task")
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"negotiation_accepted",
			sdk.NewAttribute("negotiation_id", fmt.Sprintf("%d", negotiationId)),
			sdk.NewAttribute("accepted_by", caller),
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", taskID)),
			sdk.NewAttribute("budget", neg.ProposedBudget),
			sdk.NewAttribute("deadline_blocks", fmt.Sprintf("%d", neg.ProposedDeadline)),
		),
	)

	return taskID, nil
}

// RejectNegotiation rejects the negotiation. Either party can reject.
func (k Keeper) RejectNegotiation(ctx context.Context, negotiationId uint64, caller string) error {
	neg, err := k.getNegotiation(ctx, negotiationId)
	if err != nil {
		return err
	}

	// Validate negotiation is active.
	if neg.Status != types.NegotiationStatusOpen && neg.Status != types.NegotiationStatusCountered {
		return errorsmod.Wrap(types.ErrNegotiationNotActive, "negotiation is not open or countered")
	}

	// Either party can reject.
	if caller != neg.Initiator && caller != neg.Counterparty {
		return errorsmod.Wrap(types.ErrNotNegotiationParty, "caller is not a party to this negotiation")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	neg.Status = types.NegotiationStatusRejected
	neg.UpdatedAt = sdkCtx.BlockHeight()

	if err := k.setNegotiation(ctx, neg); err != nil {
		return err
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"negotiation_rejected",
			sdk.NewAttribute("negotiation_id", fmt.Sprintf("%d", negotiationId)),
			sdk.NewAttribute("rejected_by", caller),
		),
	)

	return nil
}

// ExpireNegotiations is called from EndBlock to expire stale negotiations.
func (k Keeper) ExpireNegotiations(ctx context.Context, currentHeight int64) error {
	iter, err := k.Negotiations.Iterate(ctx, nil)
	if err != nil {
		return err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			return err
		}

		var neg types.Negotiation
		if err := json.Unmarshal([]byte(kv.Value), &neg); err != nil {
			continue // skip malformed entries
		}

		// Only expire active negotiations.
		if neg.Status != types.NegotiationStatusOpen && neg.Status != types.NegotiationStatusCountered {
			continue
		}

		shouldExpire := false
		if neg.ExpiresAt > 0 && neg.ExpiresAt <= currentHeight {
			shouldExpire = true
		}
		if neg.Round >= neg.MaxRounds {
			shouldExpire = true
		}

		if shouldExpire {
			neg.Status = types.NegotiationStatusExpired
			neg.UpdatedAt = currentHeight

			data, err := json.Marshal(neg)
			if err != nil {
				continue
			}
			if err := k.Negotiations.Set(ctx, kv.Key, string(data)); err != nil {
				return err
			}

			sdkCtx := sdk.UnwrapSDKContext(ctx)
			sdkCtx.EventManager().EmitEvent(
				sdk.NewEvent(
					"negotiation_expired",
					sdk.NewAttribute("negotiation_id", fmt.Sprintf("%d", neg.Id)),
					sdk.NewAttribute("round", fmt.Sprintf("%d", neg.Round)),
				),
			)
		}
	}

	return nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (k Keeper) getNegotiation(ctx context.Context, id uint64) (types.Negotiation, error) {
	data, err := k.Negotiations.Get(ctx, id)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return types.Negotiation{}, errorsmod.Wrap(types.ErrNegotiationNotFound, fmt.Sprintf("negotiation %d not found", id))
		}
		return types.Negotiation{}, errorsmod.Wrap(err, "failed to load negotiation")
	}

	var neg types.Negotiation
	if err := json.Unmarshal([]byte(data), &neg); err != nil {
		return types.Negotiation{}, errorsmod.Wrap(err, "failed to unmarshal negotiation")
	}
	return neg, nil
}

func (k Keeper) setNegotiation(ctx context.Context, neg types.Negotiation) error {
	data, err := json.Marshal(neg)
	if err != nil {
		return errorsmod.Wrap(err, "failed to marshal negotiation")
	}
	return k.Negotiations.Set(ctx, neg.Id, string(data))
}
