package keeper

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"clawchain/x/agent/types"

	"cosmossdk.io/collections"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

func (k msgServer) RegisterAgent(ctx context.Context, msg *types.MsgRegisterAgent) (*types.MsgRegisterAgentResponse, error) {
	// Validate the creator address.
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(types.ErrInvalidAddress, "invalid creator address")
	}

	// Validate required fields.
	if msg.Name == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidAgentName, "agent name cannot be empty")
	}
	if msg.Pubkey == "" {
		return nil, errorsmod.Wrap(types.ErrInvalidPubkey, "agent pubkey cannot be empty")
	}

	// Check if agent is already registered.
	_, err := k.Agents.Get(ctx, msg.Creator)
	if err == nil {
		return nil, errorsmod.Wrap(types.ErrAgentAlreadyExists, msg.Creator)
	}
	if !errors.Is(err, collections.ErrNotFound) {
		return nil, errorsmod.Wrap(err, "failed to check agent existence")
	}

	// Get current block height from the SDK context.
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()

	// Read deposit requirement from governance params.
	params, err := k.Params.Get(ctx)
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to load params")
	}
	minDeposit := params.MinAgentDepositUclaw
	depositAmount := fmt.Sprintf("%d", minDeposit)

	// Lock deposit into the agent module account.
	if minDeposit > 0 {
		senderAddr, _ := k.addressCodec.StringToBytes(msg.Creator)
		depositCoins := sdk.NewCoins(sdk.NewInt64Coin("uclaw", int64(minDeposit)))
		if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, senderAddr, types.ModuleName, depositCoins); err != nil {
			return nil, errorsmod.Wrapf(types.ErrInsufficientDeposit, "failed to lock deposit: %v", err)
		}
	}

	// Create the AgentInfo record.
	agentInfo := types.AgentInfo{
		Address:        msg.Creator,
		Pubkey:         msg.Pubkey,
		Endpoint:       msg.Endpoint,
		Name:           msg.Name,
		RegisteredAt:   blockHeight,
		Active:         true,
		SupportedTools: normalizeSupportedTools(msg.SupportedTools),
		PricingHint:    msg.PricingHint,
		Version:        msg.Version,
		DepositAmount:  depositAmount,
	}

	// Store in the Agents collection.
	if err := k.Agents.Set(ctx, msg.Creator, agentInfo); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store agent")
	}

	// Increment agent count.
	if _, err := k.AgentCount.Next(ctx); err != nil {
		return nil, errorsmod.Wrap(err, "failed to increment agent count")
	}

	// Emit event with agent details.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"agent_registered",
			sdk.NewAttribute("address", msg.Creator),
			sdk.NewAttribute("name", msg.Name),
			sdk.NewAttribute("pubkey", msg.Pubkey),
			sdk.NewAttribute("deposit_uclaw", depositAmount),
		),
	)

	return &types.MsgRegisterAgentResponse{}, nil
}

func normalizeSupportedTools(tools []string) []string {
	if len(tools) == 0 {
		return nil
	}
	uniq := make(map[string]struct{}, len(tools))
	out := make([]string, 0, len(tools))
	for _, tool := range tools {
		if tool == "" {
			continue
		}
		if _, exists := uniq[tool]; exists {
			continue
		}
		uniq[tool] = struct{}{}
		out = append(out, tool)
	}
	sort.Strings(out)
	return out
}
