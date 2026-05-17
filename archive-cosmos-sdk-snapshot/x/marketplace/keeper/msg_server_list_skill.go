package keeper

import (
	"context"
	"strconv"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

func (k msgServer) ListSkill(ctx context.Context, msg *types.MsgListSkill) (*types.MsgListSkillResponse, error) {
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}
	if msg.Name == "" {
		return nil, errorsmod.Wrap(types.ErrEmptyName, "skill name cannot be empty")
	}
	if msg.Description == "" {
		return nil, errorsmod.Wrap(types.ErrEmptyDescription, "skill description cannot be empty")
	}
	price, err := strconv.ParseUint(msg.Price, 10, 64)
	if err != nil || price == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidPrice, "price must be a positive integer")
	}
	denom := msg.Denom
	if denom == "" {
		denom = "uclaw"
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()
	blockTime := sdkCtx.BlockTime().Unix()

	skillID, err := k.SkillCount.Next(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to generate skill ID")
	}

	record := types.SkillRecord{
		Id:            skillID,
		Owner:         msg.Creator,
		Name:          msg.Name,
		Description:   msg.Description,
		Price:         msg.Price,
		Denom:         denom,
		Active:        true,
		PurchaseCount: 0,
		Version:       1,
		Category:      "general",
		Tags:          []string{},
		Dependencies:  []uint64{},
		TotalRevenue:  "0",
		BlockHeight:   blockHeight,
		Timestamp:     blockTime,
	}

	if err := k.Skills.Set(ctx, skillID, record); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store skill")
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"list_skill",
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("skill_id", strconv.FormatUint(skillID, 10)),
			sdk.NewAttribute("name", msg.Name),
			sdk.NewAttribute("price", msg.Price),
			sdk.NewAttribute("denom", denom),
		),
	)

	return &types.MsgListSkillResponse{SkillId: skillID}, nil
}
