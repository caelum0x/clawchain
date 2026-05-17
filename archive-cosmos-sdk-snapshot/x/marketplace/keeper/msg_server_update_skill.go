package keeper

import (
	"context"
	"fmt"
	"strconv"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

func (k msgServer) UpdateSkill(ctx context.Context, msg *types.MsgUpdateSkill) (*types.MsgUpdateSkillResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	skill, err := k.Skills.Get(ctx, msg.SkillId)
	if err != nil {
		return nil, errorsmod.Wrapf(types.ErrSkillNotFound, "skill %d not found", msg.SkillId)
	}
	if skill.Owner != msg.Creator {
		return nil, errorsmod.Wrap(types.ErrNotSkillOwner, "only skill owner can update skill")
	}

	if msg.Description == "" {
		return nil, errorsmod.Wrap(types.ErrEmptyDescription, "skill description cannot be empty")
	}
	price, err := strconv.ParseUint(msg.Price, 10, 64)
	if err != nil || price == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidPrice, "price must be a positive integer")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()
	blockTime := sdkCtx.BlockTime().Unix()

	skill.Version++
	skill.Description = msg.Description
	skill.Price = msg.Price
	skill.Category = msg.Category
	skill.Tags = append([]string(nil), msg.Tags...)
	skill.Dependencies = append([]uint64(nil), msg.Dependencies...)
	skill.BlockHeight = blockHeight
	skill.Timestamp = blockTime

	if err := k.Skills.Set(ctx, msg.SkillId, skill); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update skill")
	}

	versionEntry := types.SkillVersionEntry{
		SkillId:      msg.SkillId,
		Version:      skill.Version,
		Description:  skill.Description,
		Price:        skill.Price,
		UpdatedAt:    blockTime,
		Category:     skill.Category,
		Tags:         append([]string(nil), skill.Tags...),
		Dependencies: append([]uint64(nil), skill.Dependencies...),
	}
	versionKey := fmt.Sprintf("%d:%d", msg.SkillId, skill.Version)
	if err := k.SkillVersions.Set(ctx, versionKey, versionEntry); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store skill version")
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"update_skill",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("skill_id", strconv.FormatUint(msg.SkillId, 10)),
			sdk.NewAttribute("version", strconv.FormatUint(skill.Version, 10)),
		),
	)

	return &types.MsgUpdateSkillResponse{}, nil
}
