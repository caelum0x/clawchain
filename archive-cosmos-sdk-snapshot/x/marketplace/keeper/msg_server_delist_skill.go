package keeper

import (
	"context"
	"strconv"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

func (k msgServer) DelistSkill(ctx context.Context, msg *types.MsgDelistSkill) (*types.MsgDelistSkillResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	skill, err := k.Skills.Get(ctx, msg.SkillId)
	if err != nil {
		return nil, errorsmod.Wrapf(types.ErrSkillNotFound, "skill %d not found", msg.SkillId)
	}

	if skill.Owner != msg.Creator {
		return nil, errorsmod.Wrapf(types.ErrNotSkillOwner, "only the owner can delist skill %d", msg.SkillId)
	}

	skill.Active = false
	if err := k.Skills.Set(ctx, msg.SkillId, skill); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update skill")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"delist_skill",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("skill_id", strconv.FormatUint(msg.SkillId, 10)),
		),
	)

	return &types.MsgDelistSkillResponse{}, nil
}
