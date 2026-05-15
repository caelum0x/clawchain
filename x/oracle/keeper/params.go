package keeper

import (
	"context"
	"fmt"
	"strconv"

	"cosmossdk.io/math"
	"clawchain/x/oracle/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// VotePeriod returns the number of blocks during which voting takes place.
func (k Keeper) VotePeriod(ctx sdk.Context) (res uint64) {
	k.paramSpace.Get(ctx, types.KeyVotePeriod, &res)
	return res
}

// VoteThreshold returns the minimum percentage of votes that must be received for a ballot to pass.
func (k Keeper) VoteThreshold(ctx sdk.Context) (res math.LegacyDec) {
	k.paramSpace.Get(ctx, types.KeyVoteThreshold, &res)
	return res
}

// RewardBand returns the ratio of allowable exchange rate error that a validator can be rewared
func (k Keeper) RewardBand(ctx sdk.Context) (res math.LegacyDec) {
	k.paramSpace.Get(ctx, types.KeyRewardBand, &res)
	return res
}

// RewardDistributionWindow returns the number of vote periods during which seigiornage reward comes in and then is distributed.
func (k Keeper) RewardDistributionWindow(ctx sdk.Context) (res uint64) {
	k.paramSpace.Get(ctx, types.KeyRewardDistributionWindow, &res)
	return res
}

// Whitelist returns the denom list that can be activated
func (k Keeper) Whitelist(ctx sdk.Context) (res types.DenomList) {
	k.paramSpace.Get(ctx, types.KeyWhitelist, &res)
	return res
}

// SetWhitelist store new whitelist to param store
// this function is only for test purpose
func (k Keeper) SetWhitelist(ctx sdk.Context, whitelist types.DenomList) {
	k.paramSpace.Set(ctx, types.KeyWhitelist, whitelist)
}

// SlashFraction returns oracle voting penalty rate
func (k Keeper) SlashFraction(ctx sdk.Context) (res math.LegacyDec) {
	k.paramSpace.Get(ctx, types.KeySlashFraction, &res)
	return res
}

// SlashWindow returns # of vote period for oracle slashing
func (k Keeper) SlashWindow(ctx sdk.Context) (res uint64) {
	k.paramSpace.Get(ctx, types.KeySlashWindow, &res)
	return res
}

// MinValidPerWindow returns oracle slashing threshold
func (k Keeper) MinValidPerWindow(ctx sdk.Context) (res math.LegacyDec) {
	k.paramSpace.Get(ctx, types.KeyMinValidPerWindow, &res)
	return res
}

// GetParams returns the total set of oracle parameters.
func (k Keeper) GetParams(ctx sdk.Context) (params types.Params) {
	k.paramSpace.GetParamSetIfExists(ctx, &params)
	return params
}

// SetParams sets the total set of oracle parameters.
func (k Keeper) SetParams(ctx sdk.Context, params types.Params) {
	k.paramSpace.SetParamSet(ctx, &params)
}

// UpdateParam implements the governance ModuleParamExecutor interface.
// It applies a single parameter change by key.
func (k Keeper) UpdateParam(ctx context.Context, paramKey string, newValue string) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	params := k.GetParams(sdkCtx)

	switch paramKey {
	case "vote_period":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid vote_period value: %w", err)
		}
		params.VotePeriod = v
	case "vote_threshold":
		v, err := math.LegacyNewDecFromStr(newValue)
		if err != nil {
			return fmt.Errorf("invalid vote_threshold value: %w", err)
		}
		params.VoteThreshold = v
	case "reward_band":
		v, err := math.LegacyNewDecFromStr(newValue)
		if err != nil {
			return fmt.Errorf("invalid reward_band value: %w", err)
		}
		params.RewardBand = v
	case "reward_distribution_window":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid reward_distribution_window value: %w", err)
		}
		params.RewardDistributionWindow = v
	case "slash_fraction":
		v, err := math.LegacyNewDecFromStr(newValue)
		if err != nil {
			return fmt.Errorf("invalid slash_fraction value: %w", err)
		}
		params.SlashFraction = v
	case "slash_window":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid slash_window value: %w", err)
		}
		params.SlashWindow = v
	case "min_valid_per_window":
		v, err := math.LegacyNewDecFromStr(newValue)
		if err != nil {
			return fmt.Errorf("invalid min_valid_per_window value: %w", err)
		}
		params.MinValidPerWindow = v
	default:
		return fmt.Errorf("unknown oracle parameter: %s", paramKey)
	}

	if err := params.Validate(); err != nil {
		return fmt.Errorf("updated oracle params failed validation: %w", err)
	}
	k.SetParams(sdkCtx, params)
	return nil
}
