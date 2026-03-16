package keeper

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"cosmossdk.io/collections"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/oracle/types"
)

// Keeper manages the oracle module state.
type Keeper struct {
	cdc          codec.Codec
	storeService corestore.KVStoreService
	authority    []byte

	stakingKeeper types.StakingKeeper
	bankKeeper    types.BankKeeper

	Schema            collections.Schema
	ExchangeRates     collections.Map[string, string]
	PriceHistory      collections.Map[string, string]
	Prevotes          collections.Map[string, string]
	Votes             collections.Map[string, string]
	FeederDelegations collections.Map[string, string]
	MissCounters      collections.Map[string, uint64]
	TWAPStore         collections.Map[string, string]
	Params            collections.Item[string]
}

// NewKeeper creates a new oracle keeper.
func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	authority []byte,
	stakingKeeper types.StakingKeeper,
	bankKeeper types.BankKeeper,
) Keeper {
	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		cdc:          cdc,
		storeService: storeService,
		authority:    authority,
		stakingKeeper: stakingKeeper,
		bankKeeper:    bankKeeper,

		ExchangeRates:     collections.NewMap(sb, types.ExchangeRatesCollPrefix, "exchange_rates", collections.StringKey, collections.StringValue),
		PriceHistory:      collections.NewMap(sb, types.PriceHistoryCollPrefix, "price_history", collections.StringKey, collections.StringValue),
		Prevotes:          collections.NewMap(sb, types.PrevotesCollPrefix, "prevotes", collections.StringKey, collections.StringValue),
		Votes:             collections.NewMap(sb, types.VotesCollPrefix, "votes", collections.StringKey, collections.StringValue),
		FeederDelegations: collections.NewMap(sb, types.FeederDelegationsCollPrefix, "feeder_delegations", collections.StringKey, collections.StringValue),
		MissCounters:      collections.NewMap(sb, types.MissCountersCollPrefix, "miss_counters", collections.StringKey, collections.Uint64Value),
		TWAPStore:         collections.NewMap(sb, types.TWAPCollPrefix, "twap", collections.StringKey, collections.StringValue),
		Params:            collections.NewItem(sb, types.ParamsCollPrefix, "params", collections.StringValue),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority() []byte {
	return k.authority
}

// HandlePrevote stores a prevote for a validator.
func (k Keeper) HandlePrevote(ctx context.Context, hash string, feeder string, validator string) error {
	if err := k.validateFeeder(ctx, feeder, validator); err != nil {
		return err
	}

	if hash == "" {
		return types.ErrInvalidPrevote
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	prevote := types.AggregateExchangeRatePrevote{
		Hash:        hash,
		Voter:       validator,
		SubmitBlock: uint64(sdkCtx.BlockHeight()),
	}

	prevoteJSON, _ := json.Marshal(prevote)
	return k.Prevotes.Set(ctx, validator, string(prevoteJSON))
}

// HandleVote processes a vote reveal and verifies it matches the prevote hash.
func (k Keeper) HandleVote(ctx context.Context, salt string, exchangeRates string, feeder string, validator string) error {
	if err := k.validateFeeder(ctx, feeder, validator); err != nil {
		return err
	}

	// Get prevote
	prevoteJSON, err := k.Prevotes.Get(ctx, validator)
	if err != nil {
		return types.ErrNoMatchingPrevote
	}

	var prevote types.AggregateExchangeRatePrevote
	if err := json.Unmarshal([]byte(prevoteJSON), &prevote); err != nil {
		return types.ErrNoMatchingPrevote
	}

	// Verify hash: SHA256(salt + exchange_rates + validator)
	expectedHash := fmt.Sprintf("%x", sha256Sum([]byte(salt+exchangeRates+validator)))
	if expectedHash != prevote.Hash {
		return types.ErrInvalidVote
	}

	// Store vote
	vote := types.AggregateExchangeRateVote{
		ExchangeRates: exchangeRates,
		Voter:         validator,
	}

	voteJSON, _ := json.Marshal(vote)
	if err := k.Votes.Set(ctx, validator, string(voteJSON)); err != nil {
		return err
	}

	// Clear prevote
	return k.Prevotes.Remove(ctx, validator)
}

// HandleDelegateFeeder registers a feeder delegation for a validator.
func (k Keeper) HandleDelegateFeeder(ctx context.Context, validator string, feeder string) error {
	if validator == "" || feeder == "" {
		return types.ErrInvalidFeederDelegation
	}
	return k.FeederDelegations.Set(ctx, validator, feeder)
}

// validateFeeder checks if the feeder is authorized for the given validator.
func (k Keeper) validateFeeder(ctx context.Context, feeder string, validator string) error {
	// If feeder == validator, always allowed
	if feeder == validator {
		return nil
	}

	// Check delegation
	delegated, err := k.FeederDelegations.Get(ctx, validator)
	if err != nil {
		return types.ErrUnauthorizedFeeder
	}
	if delegated != feeder {
		return types.ErrUnauthorizedFeeder
	}
	return nil
}

// GetParams returns the oracle module parameters.
func (k Keeper) GetParams(ctx context.Context) types.OracleParams {
	paramsJSON, err := k.Params.Get(ctx)
	if err != nil {
		return types.DefaultParams
	}
	var params types.OracleParams
	_ = json.Unmarshal([]byte(paramsJSON), &params)
	return params
}

// SetParams stores the oracle module parameters.
func (k Keeper) SetParams(ctx context.Context, params types.OracleParams) error {
	data, err := json.Marshal(params)
	if err != nil {
		return err
	}
	return k.Params.Set(ctx, string(data))
}

// GetExchangeRate retrieves the current exchange rate for a denom pair.
func (k Keeper) GetExchangeRate(ctx context.Context, denomPair string) (*types.ExchangeRate, error) {
	rateJSON, err := k.ExchangeRates.Get(ctx, denomPair)
	if err != nil {
		return nil, types.ErrPriceNotAvailable
	}
	var rate types.ExchangeRate
	if err := json.Unmarshal([]byte(rateJSON), &rate); err != nil {
		return nil, types.ErrPriceNotAvailable
	}
	return &rate, nil
}

// UpdateParam implements the ModuleParamExecutor interface for governance.
func (k Keeper) UpdateParam(ctx context.Context, paramKey string, newValue string) error {
	params := k.GetParams(ctx)

	switch paramKey {
	case "vote_period":
		val, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid vote_period value: %s", newValue)
		}
		params.VotePeriod = val
	case "vote_threshold":
		params.VoteThreshold = newValue
	case "reward_band":
		params.RewardBand = newValue
	case "slash_fraction":
		params.SlashFraction = newValue
	case "slash_window":
		val, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid slash_window value: %s", newValue)
		}
		params.SlashWindow = val
	case "min_valid_per_window":
		params.MinValidPerWindow = newValue
	default:
		return fmt.Errorf("unknown oracle param key: %s", paramKey)
	}

	return k.SetParams(ctx, params)
}

// EndBlocker runs at the end of each block. It aggregates votes at vote period
// boundaries, computes weighted median prices, updates TWAP, and tracks misses.
func (k Keeper) EndBlocker(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	params := k.GetParams(ctx)

	// Only aggregate at vote period boundaries
	if params.VotePeriod == 0 || uint64(sdkCtx.BlockHeight())%params.VotePeriod != 0 {
		return nil
	}

	// Collect all votes
	denomVotes := make(map[string][]voteEntry)
	votedValidators := make(map[string]bool)

	err := k.Votes.Walk(ctx, nil, func(validator string, voteJSON string) (bool, error) {
		var vote types.AggregateExchangeRateVote
		if err := json.Unmarshal([]byte(voteJSON), &vote); err != nil {
			return false, nil
		}

		votedValidators[validator] = true

		// Parse "CLAW/USD:1.5,CLAW/ATOM:0.12"
		pairs := strings.Split(vote.ExchangeRates, ",")
		for _, pair := range pairs {
			parts := strings.SplitN(pair, ":", 2)
			if len(parts) != 2 {
				continue
			}
			denom := parts[0]
			price, err := strconv.ParseFloat(parts[1], 64)
			if err != nil {
				continue
			}

			// Get validator power (default 1 if no staking)
			power := int64(1)

			denomVotes[denom] = append(denomVotes[denom], voteEntry{
				Validator: validator,
				Price:     price,
				Power:     power,
			})
		}

		return false, nil
	})
	if err != nil {
		return err
	}

	// Compute weighted median for each denom pair
	for denom, votes := range denomVotes {
		if !k.isDenomWhitelisted(params, denom) {
			continue
		}

		medianPrice := weightedMedian(votes)

		rate := types.ExchangeRate{
			DenomPair:   denom,
			Price:       fmt.Sprintf("%.6f", medianPrice),
			BlockHeight: sdkCtx.BlockHeight(),
			Timestamp:   sdkCtx.BlockTime().Unix(),
		}

		rateJSON, _ := json.Marshal(rate)
		_ = k.ExchangeRates.Set(ctx, denom, string(rateJSON))

		// Update TWAP
		k.updateTWAP(ctx, denom, medianPrice, sdkCtx.BlockHeight(), params.VotePeriod)

		// Append to price history
		k.appendPriceHistory(ctx, denom, rate)
	}

	// Track miss counters for validators who didn't vote
	if k.stakingKeeper != nil {
		validators, err := k.stakingKeeper.GetBondedValidatorsByPower(ctx)
		if err == nil {
			for _, val := range validators {
				valAddr := val.GetOperator()
				if !votedValidators[valAddr] {
					current, _ := k.MissCounters.Get(ctx, valAddr)
					_ = k.MissCounters.Set(ctx, valAddr, current+1)
				}
			}
		}
	}

	// Clear all votes for next period
	var keysToRemove []string
	_ = k.Votes.Walk(ctx, nil, func(key string, _ string) (bool, error) {
		keysToRemove = append(keysToRemove, key)
		return false, nil
	})
	for _, key := range keysToRemove {
		_ = k.Votes.Remove(ctx, key)
	}

	return nil
}

type voteEntry struct {
	Validator string
	Price     float64
	Power     int64
}

// weightedMedian: sort by price, accumulate power until >= total/2.
func weightedMedian(votes []voteEntry) float64 {
	if len(votes) == 0 {
		return 0
	}

	sort.Slice(votes, func(i, j int) bool {
		return votes[i].Price < votes[j].Price
	})

	var totalPower int64
	for _, v := range votes {
		totalPower += v.Power
	}

	var cumPower int64
	for _, v := range votes {
		cumPower += v.Power
		if cumPower*2 >= totalPower {
			return v.Price
		}
	}

	return votes[len(votes)-1].Price
}

func (k Keeper) isDenomWhitelisted(params types.OracleParams, denom string) bool {
	for _, w := range params.Whitelist {
		if w == denom {
			return true
		}
	}
	return false
}

func (k Keeper) updateTWAP(ctx context.Context, denom string, price float64, height int64, period uint64) {
	twapJSON, err := k.TWAPStore.Get(ctx, denom)
	if err != nil {
		// First entry
		entry := types.TWAPEntry{
			DenomPair:        denom,
			Twap:             fmt.Sprintf("%.6f", price),
			LastUpdatedBlock: height,
			WindowSize:       1,
		}
		data, _ := json.Marshal(entry)
		_ = k.TWAPStore.Set(ctx, denom, string(data))
		return
	}

	var entry types.TWAPEntry
	_ = json.Unmarshal([]byte(twapJSON), &entry)

	oldTwap, _ := strconv.ParseFloat(entry.Twap, 64)
	durationBlocks := float64(height - entry.LastUpdatedBlock)
	windowBlocks := float64(period * 10) // 10 vote periods

	// Time-weighted: new_twap = old_twap * (1 - weight) + price * weight
	weight := durationBlocks / windowBlocks
	if weight > 1 {
		weight = 1
	}
	newTwap := oldTwap*(1-weight) + price*weight

	entry.Twap = fmt.Sprintf("%.6f", newTwap)
	entry.LastUpdatedBlock = height
	entry.WindowSize++

	data, _ := json.Marshal(entry)
	_ = k.TWAPStore.Set(ctx, denom, string(data))
}

func (k Keeper) appendPriceHistory(ctx context.Context, denom string, rate types.ExchangeRate) {
	key := denom
	historyJSON, err := k.PriceHistory.Get(ctx, key)

	var history []types.PriceHistoryEntry
	if err == nil {
		_ = json.Unmarshal([]byte(historyJSON), &history)
	}

	history = append(history, types.PriceHistoryEntry{
		Price:       rate.Price,
		BlockHeight: rate.BlockHeight,
		Timestamp:   rate.Timestamp,
	})

	// Cap at 1000 entries
	if len(history) > 1000 {
		history = history[len(history)-1000:]
	}

	data, _ := json.Marshal(history)
	_ = k.PriceHistory.Set(ctx, key, string(data))
}

// QueryPrice returns the current exchange rate for a denom pair.
func (k Keeper) QueryPrice(ctx context.Context, denomPair string) (*types.ExchangeRate, error) {
	return k.GetExchangeRate(ctx, denomPair)
}

// QueryPrices returns all current exchange rates.
func (k Keeper) QueryPrices(ctx context.Context) ([]types.ExchangeRate, error) {
	var rates []types.ExchangeRate
	_ = k.ExchangeRates.Walk(ctx, nil, func(_ string, rateJSON string) (bool, error) {
		var rate types.ExchangeRate
		_ = json.Unmarshal([]byte(rateJSON), &rate)
		rates = append(rates, rate)
		return false, nil
	})
	return rates, nil
}

// QueryPriceHistory returns price history for a denom pair.
func (k Keeper) QueryPriceHistory(ctx context.Context, denomPair string, limit uint64) ([]types.PriceHistoryEntry, error) {
	historyJSON, err := k.PriceHistory.Get(ctx, denomPair)
	if err != nil {
		return nil, types.ErrPriceNotAvailable
	}

	var history []types.PriceHistoryEntry
	if err := json.Unmarshal([]byte(historyJSON), &history); err != nil {
		return nil, err
	}

	if limit > 0 && uint64(len(history)) > limit {
		history = history[uint64(len(history))-limit:]
	}

	return history, nil
}

// QueryMissCounter returns the miss counter for a validator.
func (k Keeper) QueryMissCounter(ctx context.Context, validator string) (uint64, error) {
	count, err := k.MissCounters.Get(ctx, validator)
	if err != nil {
		return 0, nil // no misses
	}
	return count, nil
}

// QueryFeederDelegation returns the feeder delegation for a validator.
func (k Keeper) QueryFeederDelegation(ctx context.Context, validator string) (string, error) {
	feeder, err := k.FeederDelegations.Get(ctx, validator)
	if err != nil {
		return "", nil // no delegation, validator feeds itself
	}
	return feeder, nil
}
