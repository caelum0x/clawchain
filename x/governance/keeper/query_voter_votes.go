package keeper

import (
	"context"
	"encoding/json"
	"strings"

	"clawchain/x/governance/types"
)

// QueryVoterVotes returns all votes cast by a specific voter address across
// all proposals.
func (k Keeper) QueryVoterVotes(ctx context.Context, voter string) ([]types.Vote, error) {
	var votes []types.Vote

	iter, err := k.Votes.Iterate(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	// Vote keys are formatted as "proposalId:voter".
	// We scan all votes and filter by the voter address suffix.
	suffix := ":" + voter

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			continue
		}

		// Check if this vote belongs to the requested voter.
		if !strings.HasSuffix(kv.Key, suffix) {
			continue
		}

		var vote types.Vote
		if err := json.Unmarshal([]byte(kv.Value), &vote); err != nil {
			continue
		}

		votes = append(votes, vote)
	}

	return votes, nil
}
