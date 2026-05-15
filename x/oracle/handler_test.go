package oracle_test

import (
	"fmt"
	"testing"

	"clawchain/x/oracle/keeper"
	"clawchain/x/oracle/types"
	"github.com/cometbft/cometbft/crypto/secp256k1"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"
)

func TestOracleFilters(t *testing.T) {
	input, h := setup(t)

	// Case 1: non-oracle message being sent fails
	/* TODO: check how to do in sdk 0.50
	bankMsg := banktypes.MsgSend{}
	_, err := h(input.Ctx, &bankMsg)
	require.Error(t, err)
	*/

	// Case 2: Normal MsgAggregateExchangeRatePrevote submission goes through
	salt := "1"

	hash := types.GetAggregateVoteHash(salt, randomExchangeRate.String()+"uusd", keeper.ValAddrs[0])
	prevoteMsg := types.NewMsgAggregateExchangeRatePrevote(hash, keeper.Addrs[0], keeper.ValAddrs[0])
	_, err := h.AggregateExchangeRatePrevote(sdk.WrapSDKContext(input.Ctx), prevoteMsg)
	require.NoError(t, err)

	// Case 3: Normal MsgAggregateExchangeRateVote submission goes through keeper.Addrs
	voteMsg := types.NewMsgAggregateExchangeRateVote(salt, randomExchangeRate.String()+"uusd", keeper.Addrs[0], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx.WithBlockHeight(1)), voteMsg)
	require.NoError(t, err)

	// Case 4: a non-validator sending an oracle message fails
	nonValidatorPub := secp256k1.GenPrivKey().PubKey()
	nonValidatorAddr := nonValidatorPub.Address()
	salt = "2"
	hash = types.GetAggregateVoteHash(salt, randomExchangeRate.String()+"uusd", sdk.ValAddress(nonValidatorAddr))

	prevoteMsg = types.NewMsgAggregateExchangeRatePrevote(hash, sdk.AccAddress(nonValidatorAddr), sdk.ValAddress(nonValidatorAddr))
	_, err = h.AggregateExchangeRatePrevote(sdk.WrapSDKContext(input.Ctx), prevoteMsg)
	require.Error(t, err)
}

func TestFeederDelegation(t *testing.T) {
	input, h := setup(t)

	salt := "1"
	hash := types.GetAggregateVoteHash(salt, randomExchangeRate.String()+"uusd", keeper.ValAddrs[0])

	// Case 1: empty message
	delegateFeedConsentMsg := types.MsgDelegateFeedConsent{}
	_, err := h.DelegateFeedConsent(sdk.WrapSDKContext(input.Ctx), &delegateFeedConsentMsg)
	require.Error(t, err)

	// Case 2: Normal Prevote - without delegation
	prevoteMsg := types.NewMsgAggregateExchangeRatePrevote(hash, keeper.Addrs[0], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRatePrevote(sdk.WrapSDKContext(input.Ctx), prevoteMsg)
	require.NoError(t, err)

	// Case 2.1: Normal Prevote - with delegation fails
	prevoteMsg = types.NewMsgAggregateExchangeRatePrevote(hash, keeper.Addrs[1], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRatePrevote(sdk.WrapSDKContext(input.Ctx), prevoteMsg)
	require.Error(t, err)

	// Case 2.2: Normal Vote - without delegation
	voteMsg := types.NewMsgAggregateExchangeRateVote(salt, randomExchangeRate.String()+"uusd", keeper.Addrs[0], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx.WithBlockHeight(1)), voteMsg)
	require.NoError(t, err)

	// Case 2.3: Normal Vote - with delegation fails
	voteMsg = types.NewMsgAggregateExchangeRateVote(salt, randomExchangeRate.String()+"uusd", keeper.Addrs[1], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx.WithBlockHeight(1)), voteMsg)
	require.Error(t, err)

	// Case 3: Normal MsgDelegateFeedConsent succeeds
	msg := types.NewMsgDelegateFeedConsent(keeper.ValAddrs[0], keeper.Addrs[1])
	_, err = h.DelegateFeedConsent(sdk.WrapSDKContext(input.Ctx), msg)
	require.NoError(t, err)

	// Case 4.1: Normal Prevote - without delegation fails
	prevoteMsg = types.NewMsgAggregateExchangeRatePrevote(hash, keeper.Addrs[2], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRatePrevote(sdk.WrapSDKContext(input.Ctx), prevoteMsg)
	require.Error(t, err)

	// Case 4.2: Normal Prevote - with delegation succeeds
	prevoteMsg = types.NewMsgAggregateExchangeRatePrevote(hash, keeper.Addrs[1], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRatePrevote(sdk.WrapSDKContext(input.Ctx), prevoteMsg)
	require.NoError(t, err)

	// Case 4.3: Normal Vote - without delegation fails
	voteMsg = types.NewMsgAggregateExchangeRateVote(salt, randomExchangeRate.String()+"uusd", keeper.Addrs[2], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx.WithBlockHeight(1)), voteMsg)
	require.Error(t, err)

	// Case 4.4: Normal Vote - with delegation succeeds
	voteMsg = types.NewMsgAggregateExchangeRateVote(salt, randomExchangeRate.String()+"uusd", keeper.Addrs[1], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx.WithBlockHeight(1)), voteMsg)
	require.NoError(t, err)
}

func TestAggregatePrevoteVote(t *testing.T) {
	input, h := setup(t)

	salt := "1"
	exchangeRatesStr := fmt.Sprintf("1000.23%s,0.29%s,0.27%s", "uatom", "uusd", "uusdt")
	otherExchangeRateStr := fmt.Sprintf("1000.12%s,0.29%s,0.27%s", "uatom", "uusd", "uusdc")
	unintendedExchageRateStr := fmt.Sprintf("1000.23%s,0.29%s,0.27%s", "uatom", "uusd", "ueth")
	invalidExchangeRateStr := fmt.Sprintf("1000.23%s,0.29%s,0.27", "uatom", "uusd")

	hash := types.GetAggregateVoteHash(salt, exchangeRatesStr, keeper.ValAddrs[0])

	aggregateExchangeRatePrevoteMsg := types.NewMsgAggregateExchangeRatePrevote(hash, keeper.Addrs[0], keeper.ValAddrs[0])
	_, err := h.AggregateExchangeRatePrevote(sdk.WrapSDKContext(input.Ctx), aggregateExchangeRatePrevoteMsg)
	require.NoError(t, err)

	// Unauthorized feeder
	aggregateExchangeRatePrevoteMsg = types.NewMsgAggregateExchangeRatePrevote(hash, keeper.Addrs[1], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRatePrevote(sdk.WrapSDKContext(input.Ctx), aggregateExchangeRatePrevoteMsg)
	require.Error(t, err)

	// Invalid reveal period
	aggregateExchangeRateVoteMsg := types.NewMsgAggregateExchangeRateVote(salt, exchangeRatesStr, keeper.Addrs[0], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx), aggregateExchangeRateVoteMsg)
	require.Error(t, err)

	// Invalid reveal period
	input.Ctx = input.Ctx.WithBlockHeight(2)
	aggregateExchangeRateVoteMsg = types.NewMsgAggregateExchangeRateVote(salt, exchangeRatesStr, keeper.Addrs[0], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx), aggregateExchangeRateVoteMsg)
	require.Error(t, err)

	// Other exchange rate with valid real period
	input.Ctx = input.Ctx.WithBlockHeight(1)
	aggregateExchangeRateVoteMsg = types.NewMsgAggregateExchangeRateVote(salt, otherExchangeRateStr, keeper.Addrs[0], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx), aggregateExchangeRateVoteMsg)
	require.Error(t, err)

	// Invalid exchange rate with valid real period
	input.Ctx = input.Ctx.WithBlockHeight(1)
	aggregateExchangeRateVoteMsg = types.NewMsgAggregateExchangeRateVote(salt, invalidExchangeRateStr, keeper.Addrs[0], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx), aggregateExchangeRateVoteMsg)
	require.Error(t, err)

	// Unauthorized feeder
	aggregateExchangeRateVoteMsg = types.NewMsgAggregateExchangeRateVote(salt, invalidExchangeRateStr, keeper.Addrs[1], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx), aggregateExchangeRateVoteMsg)
	require.Error(t, err)

	// Unintended denom vote
	aggregateExchangeRateVoteMsg = types.NewMsgAggregateExchangeRateVote(salt, unintendedExchageRateStr, keeper.Addrs[0], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx), aggregateExchangeRateVoteMsg)
	require.Error(t, err)

	// Valid exchange rate reveal submission
	input.Ctx = input.Ctx.WithBlockHeight(1)
	aggregateExchangeRateVoteMsg = types.NewMsgAggregateExchangeRateVote(salt, exchangeRatesStr, keeper.Addrs[0], keeper.ValAddrs[0])
	_, err = h.AggregateExchangeRateVote(sdk.WrapSDKContext(input.Ctx), aggregateExchangeRateVoteMsg)
	require.NoError(t, err)
}
