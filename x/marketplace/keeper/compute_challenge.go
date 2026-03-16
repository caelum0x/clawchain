package keeper

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

// GenerateChallenge derives a deterministic challenge seed from the block's
// AppHash and the jobID, stores it, and returns the ComputeChallenge.
func (k Keeper) GenerateChallenge(ctx context.Context, jobID uint64) (types.ComputeChallenge, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Derive seed: sha256(AppHash || jobID-as-string)
	preimage := append(sdkCtx.BlockHeader().AppHash, []byte(fmt.Sprintf("%d", jobID))...)
	seedHash := sha256.Sum256(preimage)
	seedHex := hex.EncodeToString(seedHash[:])

	challenge := types.ComputeChallenge{
		JobId:         jobID,
		ChallengeSeed: seedHex,
		BlockHeight:   sdkCtx.BlockHeight(),
	}

	bz, err := json.Marshal(challenge)
	if err != nil {
		return types.ComputeChallenge{}, fmt.Errorf("failed to marshal compute challenge: %w", err)
	}
	if err := k.ComputeChallenges.Set(ctx, jobID, string(bz)); err != nil {
		return types.ComputeChallenge{}, err
	}

	return challenge, nil
}

// VerifyComputeProof looks up the stored challenge for jobID and checks that
// challengeResponse == hex(sha256(resultHash + challengeSeed)).
func (k Keeper) VerifyComputeProof(ctx context.Context, jobID uint64, resultHash string, challengeResponse string) (bool, error) {
	challengeJSON, err := k.ComputeChallenges.Get(ctx, jobID)
	if err != nil {
		return false, errorsmod.Wrapf(types.ErrChallengeNotFound, "job_id %d", jobID)
	}

	var challenge types.ComputeChallenge
	if err := json.Unmarshal([]byte(challengeJSON), &challenge); err != nil {
		return false, fmt.Errorf("failed to unmarshal compute challenge: %w", err)
	}

	// expected = hex(sha256(resultHash + challengeSeed))
	preimage := resultHash + challenge.ChallengeSeed
	expected := sha256.Sum256([]byte(preimage))
	expectedHex := hex.EncodeToString(expected[:])

	return expectedHex == challengeResponse, nil
}
