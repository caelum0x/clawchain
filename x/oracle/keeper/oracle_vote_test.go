package keeper_test

import (
	"crypto/sha256"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPrevoteAndVote(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	salt := "testsalt"
	rates := "CLAW/USD:1.5,CLAW/ATOM:0.12"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+rates+testValidator)))

	// Prevote
	err := k.HandlePrevote(ctx, hash, testValidator, testValidator)
	require.NoError(t, err)

	// Vote (reveal)
	err = k.HandleVote(ctx, salt, rates, testValidator, testValidator)
	require.NoError(t, err)
}

func TestVoteWithoutPrevote(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	err := k.HandleVote(ctx, "salt", "CLAW/USD:1.5", testFeeder, testValidator)
	require.Error(t, err)
}

func TestVoteHashMismatch(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Prevote with one hash
	err := k.HandlePrevote(ctx, "correcthash", testValidator, testValidator)
	require.NoError(t, err)

	// Vote with different data (hash won't match)
	err = k.HandleVote(ctx, "wrongsalt", "CLAW/USD:999", testValidator, testValidator)
	require.Error(t, err)
}

func TestDelegateFeeder(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Delegate feeder
	err := k.HandleDelegateFeeder(ctx, testValidator, testFeeder)
	require.NoError(t, err)

	// Now feeder can prevote for validator
	salt := "salt123"
	rates := "CLAW/USD:2.0"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+rates+testValidator)))

	err = k.HandlePrevote(ctx, hash, testFeeder, testValidator)
	require.NoError(t, err)

	err = k.HandleVote(ctx, salt, rates, testFeeder, testValidator)
	require.NoError(t, err)
}

func TestUnauthorizedFeeder(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Feeder not delegated, should fail
	err := k.HandlePrevote(ctx, "somehash", testFeeder, testValidator)
	require.Error(t, err)
}

func TestEmptyPrevoteHash(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	err := k.HandlePrevote(ctx, "", testValidator, testValidator)
	require.Error(t, err)
}

func TestInvalidFeederDelegation(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	err := k.HandleDelegateFeeder(ctx, "", testFeeder)
	require.Error(t, err)

	err = k.HandleDelegateFeeder(ctx, testValidator, "")
	require.Error(t, err)
}
