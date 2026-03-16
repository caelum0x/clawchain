package keeper

import (
	"context"
	"encoding/json"
	"fmt"

	"clawchain/x/governance/types"
)

// InitGenesis initializes the module state from genesis.
func (k Keeper) InitGenesis(ctx context.Context, genState types.GenesisState) error {
	// Store proposals.
	for _, p := range genState.Proposals {
		data, err := json.Marshal(p)
		if err != nil {
			return fmt.Errorf("failed to marshal proposal %d: %w", p.ProposalId, err)
		}
		if err := k.Proposals.Set(ctx, p.ProposalId, string(data)); err != nil {
			return err
		}
	}

	// Store votes.
	for _, v := range genState.Votes {
		key := fmt.Sprintf("%d:%s", v.ProposalId, v.Voter)
		data, err := json.Marshal(v)
		if err != nil {
			return fmt.Errorf("failed to marshal vote: %w", err)
		}
		if err := k.Votes.Set(ctx, key, string(data)); err != nil {
			return err
		}
	}

	return nil
}

// ExportGenesis exports the module state to genesis.
func (k Keeper) ExportGenesis(ctx context.Context) (*types.GenesisState, error) {
	genesis := types.DefaultGenesis()

	proposals, err := k.GetProposals(ctx, "")
	if err != nil {
		return nil, err
	}
	genesis.Proposals = proposals

	// Export all votes.
	iter, err := k.Votes.Iterate(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			continue
		}
		var vote types.Vote
		if err := json.Unmarshal([]byte(kv.Value), &vote); err != nil {
			continue
		}
		genesis.Votes = append(genesis.Votes, vote)
	}

	return genesis, nil
}
