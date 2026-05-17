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

func (k msgServer) EndorseAgent(ctx context.Context, msg *types.MsgEndorseAgent) (*types.MsgEndorseAgentResponse, error) {
	reason := strings.TrimSpace(msg.Reason)

	if msg.Creator == msg.AgentAddress {
		return nil, errorsmod.Wrap(types.ErrSelfEndorsement, "self-endorsement is not allowed")
	}

	registered, err := k.agentKeeper.IsAgentRegistered(ctx, msg.Creator)
	if err != nil {
		return nil, err
	}
	if !registered {
		return nil, errorsmod.Wrap(types.ErrEndorserNotAgent, "endorser must be a registered agent")
	}

	endorsementID, err := k.EndorsementCount.Next(ctx)
	if err != nil {
		return nil, err
	}

	blockHeight := sdk.UnwrapSDKContext(ctx).BlockHeight()
	endorsement := types.Endorsement{
		Id:          endorsementID,
		Endorser:    msg.Creator,
		Endorsed:    msg.AgentAddress,
		Reason:      reason,
		BlockHeight: blockHeight,
	}
	if err := k.Endorsements.Set(ctx, endorsementID, endorsement); err != nil {
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
	rep.Endorsements++
	rep.LastUpdated = blockHeight
	if err := k.Reputations.Set(ctx, msg.AgentAddress, rep); err != nil {
		return nil, err
	}

	return &types.MsgEndorseAgentResponse{EndorsementId: endorsementID}, nil
}
