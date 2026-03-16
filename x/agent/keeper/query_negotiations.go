package keeper

import (
	"context"
	"encoding/json"

	"clawchain/x/agent/types"
)

// QueryNegotiation retrieves a single negotiation by ID.
func (k Keeper) QueryNegotiation(ctx context.Context, negotiationId uint64) (*types.Negotiation, error) {
	neg, err := k.getNegotiation(ctx, negotiationId)
	if err != nil {
		return nil, err
	}
	return &neg, nil
}

// QueryNegotiationsByAgent returns all negotiations where the given address
// is either the initiator or the counterparty.
func (k Keeper) QueryNegotiationsByAgent(ctx context.Context, address string) ([]types.Negotiation, error) {
	var results []types.Negotiation

	iter, err := k.Negotiations.Iterate(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			continue
		}

		var neg types.Negotiation
		if err := json.Unmarshal([]byte(kv.Value), &neg); err != nil {
			continue
		}

		if neg.Initiator == address || neg.Counterparty == address {
			results = append(results, neg)
		}
	}

	return results, nil
}
