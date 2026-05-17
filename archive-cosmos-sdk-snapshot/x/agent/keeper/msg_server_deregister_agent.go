package keeper

import (
	"context"
	"errors"
	"strconv"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) DeregisterAgent(ctx context.Context, msg *types.MsgDeregisterAgent) (*types.MsgDeregisterAgentResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	agent, err := k.Agents.Get(ctx, msg.Creator)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return nil, errorsmod.Wrap(types.ErrAgentNotFound, msg.Creator)
		}
		return nil, errorsmod.Wrap(err, "failed to look up agent")
	}

	// Guardrail: prevent deregistration while active tasks exist.
	walkErr := k.Tasks.Walk(ctx, nil, func(_ uint64, task types.TaskRecord) (bool, error) {
		if (task.DelegatorAddress == msg.Creator || task.AssigneeAddress == msg.Creator) &&
			(task.Status == "pending" || task.Status == "accepted") {
			return true, types.ErrAgentHasActiveTasks
		}
		return false, nil
	})
	if walkErr != nil {
		if errors.Is(walkErr, types.ErrAgentHasActiveTasks) {
			return nil, errorsmod.Wrap(types.ErrAgentHasActiveTasks, "complete or cancel active tasks before deregistering")
		}
		return nil, errorsmod.Wrap(walkErr, "failed while checking active tasks")
	}

	// Return remaining deposit to the agent.
	depositAmount, _ := strconv.ParseInt(agent.DepositAmount, 10, 64)
	if depositAmount > 0 {
		recipientAddr, _ := k.addressCodec.StringToBytes(msg.Creator)
		refundCoins := sdk.NewCoins(sdk.NewInt64Coin("uclaw", depositAmount))
		if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, recipientAddr, refundCoins); err != nil {
			return nil, errorsmod.Wrap(err, "failed to refund deposit")
		}
	}

	// Remove agent from collections.
	if err := k.Agents.Remove(ctx, msg.Creator); err != nil {
		return nil, errorsmod.Wrap(err, "failed to remove agent")
	}
	// Best-effort cleanup of liveness and stats.
	_ = k.AgentLiveness.Remove(ctx, msg.Creator)
	_ = k.AgentStats.Remove(ctx, msg.Creator)

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"agent_deregistered",
			sdk.NewAttribute("address", msg.Creator),
			sdk.NewAttribute("deposit_refunded_uclaw", agent.DepositAmount),
		),
	)

	return &types.MsgDeregisterAgentResponse{}, nil
}
