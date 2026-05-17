package keeper

import (
	"context"
	"fmt"
	"strconv"

	errorsmod "cosmossdk.io/errors"
	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

func (k msgServer) PurchaseSkill(ctx context.Context, msg *types.MsgPurchaseSkill) (*types.MsgPurchaseSkillResponse, error) {
	buyerAddr, err := k.addressCodec.StringToBytes(msg.Creator)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid buyer address")
	}

	skill, err := k.Skills.Get(ctx, msg.SkillId)
	if err != nil {
		return nil, errorsmod.Wrapf(types.ErrSkillNotFound, "skill %d not found", msg.SkillId)
	}

	if !skill.Active {
		return nil, errorsmod.Wrapf(types.ErrSkillInactive, "skill %d is not active", msg.SkillId)
	}

	if skill.Owner == msg.Creator {
		return nil, errorsmod.Wrap(types.ErrSelfPurchase, "cannot purchase your own skill")
	}

	sellerAddr, err := k.addressCodec.StringToBytes(skill.Owner)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid seller address")
	}

	price, err := strconv.ParseUint(skill.Price, 10, 64)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidPrice, "invalid stored price")
	}

	coins := sdk.NewCoins(sdk.NewCoin(skill.Denom, math.NewIntFromUint64(price)))
	if err := k.bankKeeper.SendCoins(ctx, buyerAddr, sellerAddr, coins); err != nil {
		return nil, errorsmod.Wrap(types.ErrInsufficientFunds, err.Error())
	}

	// Record purchase for reputation-gated ratings.
	purchaseKey := msg.Creator + "|" + skill.Owner
	if err := k.Purchases.Set(ctx, purchaseKey, true); err != nil {
		return nil, errorsmod.Wrap(err, "failed to record purchase")
	}

	skill.PurchaseCount++
	revenue, ok := math.NewIntFromString(skill.TotalRevenue)
	if !ok {
		return nil, errorsmod.Wrap(types.ErrInvalidPrice, "invalid total revenue state")
	}
	revenue = revenue.Add(math.NewIntFromUint64(price))
	skill.TotalRevenue = revenue.String()
	if err := k.Skills.Set(ctx, msg.SkillId, skill); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update skill purchase count")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Auto-create a task for the seller's agent to execute the skill.
	var taskID uint64
	if k.agentKeeper != nil {
		tid, err := k.agentKeeper.CreateTaskForSkillPurchase(
			ctx,
			msg.Creator,   // buyer
			skill.Owner,   // seller (assignee)
			msg.SkillId,
			skill.Name,
			skill.Price,
			skill.Denom,
		)
		if err != nil {
			// Log but don't fail the purchase.
			sdkCtx.Logger().Error("failed to create skill task", "error", err)
		} else {
			taskID = tid
		}
	}

	eventAttrs := []sdk.Attribute{
		sdk.NewAttribute("buyer", msg.Creator),
		sdk.NewAttribute("seller", skill.Owner),
		sdk.NewAttribute("skill_id", strconv.FormatUint(msg.SkillId, 10)),
		sdk.NewAttribute("price", skill.Price),
		sdk.NewAttribute("denom", skill.Denom),
	}
	if taskID > 0 {
		eventAttrs = append(eventAttrs, sdk.NewAttribute("task_id", fmt.Sprintf("%d", taskID)))
	}
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent("purchase_skill", eventAttrs...),
	)

	return &types.MsgPurchaseSkillResponse{}, nil
}
