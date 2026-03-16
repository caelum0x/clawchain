package keeper

import (
	"context"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

func (k msgServer) CreateEscrow(ctx context.Context, msg *types.MsgCreateEscrow) (*types.MsgCreateEscrowResponse, error) {
	buyerAddr, err := k.addressCodec.StringToBytes(msg.Creator)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	skill, err := k.Skills.Get(ctx, msg.SkillId)
	if err != nil {
		return nil, errorsmod.Wrap(types.ErrSkillNotFound, "skill not found")
	}
	if !skill.Active {
		return nil, errorsmod.Wrap(types.ErrSkillInactive, "skill is inactive")
	}

	buyer := sdk.AccAddress(buyerAddr)
	if buyer.String() == skill.Owner {
		return nil, errorsmod.Wrap(types.ErrSelfPurchase, "cannot create escrow for own skill")
	}
	if msg.DeadlineBlocks <= 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidDeadline, "deadline_blocks must be > 0")
	}
	if msg.Milestones == 0 {
		return nil, errorsmod.Wrap(types.ErrInvalidMilestones, "milestones must be > 0")
	}

	totalCoin, err := sdk.ParseCoinNormalized(skill.Price + skill.Denom)
	if err != nil || !totalCoin.IsPositive() {
		return nil, errorsmod.Wrap(types.ErrInvalidPrice, "invalid skill price/denom coin")
	}
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, buyer, types.ModuleName, sdk.NewCoins(totalCoin)); err != nil {
		return nil, errorsmod.Wrap(types.ErrInsufficientFunds, "failed to lock escrow funds")
	}

	escrowID, err := k.EscrowCount.Next(ctx)
	if err != nil {
		return nil, err
	}

	blockHeight := sdk.UnwrapSDKContext(ctx).BlockHeight()
	escrow := types.EscrowAgreement{
		Id:                 escrowID,
		SkillId:            msg.SkillId,
		Buyer:              buyer.String(),
		Seller:             skill.Owner,
		Amount:             skill.Price,
		Denom:              skill.Denom,
		Status:             "active",
		Description:        msg.Description,
		DeadlineBlock:      blockHeight + msg.DeadlineBlocks,
		CreatedAt:          blockHeight,
		CompletedAt:        0,
		Milestones:         msg.Milestones,
		MilestonesComplete: 0,
	}

	if err := k.Escrows.Set(ctx, escrowID, escrow); err != nil {
		return nil, err
	}

	return &types.MsgCreateEscrowResponse{EscrowId: escrowID}, nil
}
