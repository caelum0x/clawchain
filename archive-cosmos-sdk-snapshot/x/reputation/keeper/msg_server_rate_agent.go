package keeper

import (
	"context"
	"errors"
	"strings"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/reputation/types"
)

func (k msgServer) RateAgent(ctx context.Context, msg *types.MsgRateAgent) (*types.MsgRateAgentResponse, error) {
	if msg.Creator == msg.AgentAddress {
		return nil, errorsmod.Wrap(types.ErrSelfRating, "self-rating is not allowed")
	}
	if msg.Score < 1 || msg.Score > 5 {
		return nil, errorsmod.Wrap(types.ErrInvalidScore, "score must be between 1 and 5")
	}

	comment := strings.TrimSpace(msg.Comment)

	params, err := k.Params.Get(ctx)
	if err != nil {
		return nil, err
	}
	if uint64(len(comment)) > params.MaxCommentLength {
		return nil, errorsmod.Wrap(types.ErrCommentTooLong, "comment exceeds max length")
	}

	hasPurchased, err := k.marketplaceKeeper.HasPurchased(ctx, msg.Creator, msg.AgentAddress)
	if err != nil {
		return nil, err
	}
	if !hasPurchased {
		return nil, errorsmod.Wrap(types.ErrNoPurchase, "rating requires a prior purchase")
	}

	ratingID, err := k.RatingCount.Next(ctx)
	if err != nil {
		return nil, err
	}

	blockHeight := sdk.UnwrapSDKContext(ctx).BlockHeight()
	rating := types.Rating{
		Id:          ratingID,
		Rater:       msg.Creator,
		RatedAgent:  msg.AgentAddress,
		SkillId:     msg.SkillId,
		Score:       msg.Score,
		Comment:     comment,
		BlockHeight: blockHeight,
	}
	if err := k.Ratings.Set(ctx, ratingID, rating); err != nil {
		return nil, err
	}

	rep, err := k.Reputations.Get(ctx, msg.AgentAddress)
	if err != nil {
		if !errors.Is(err, collections.ErrNotFound) {
			return nil, err
		}
		rep = types.ReputationRecord{
			AgentAddress:   msg.AgentAddress,
			UptimeScoreBps: 10000,
		}
	}
	rep.TotalRatings++
	rep.RatingSum += uint64(msg.Score)
	rep.AvgRatingBps = (rep.RatingSum * 100) / rep.TotalRatings
	rep.LastUpdated = blockHeight
	if err := k.Reputations.Set(ctx, msg.AgentAddress, rep); err != nil {
		return nil, err
	}

	return &types.MsgRateAgentResponse{RatingId: ratingID}, nil
}
