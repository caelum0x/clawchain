package keeper

import (
	"context"
	"fmt"

	types "clawchain/x/agent/types"
)

// RemoteAgents implements the gRPC query handler for QueryRemoteAgentsRequest.
func (q queryServer) RemoteAgents(ctx context.Context, req *types.QueryRemoteAgentsRequest) (*types.QueryRemoteAgentsResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("invalid request: nil")
	}

	results, err := q.k.QueryRemoteAgents(ctx)
	if err != nil {
		return nil, err
	}

	return &types.QueryRemoteAgentsResponse{
		Agents: results,
	}, nil
}

// QueryRemoteAgents returns all known remote agents from the RemoteAgents collection.
// Each entry is a JSON-encoded RemoteAgentInfo string keyed by "chainID:address".
func (k Keeper) QueryRemoteAgents(ctx context.Context) ([]string, error) {
	var results []string

	iter, err := k.RemoteAgents.Iterate(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		val, err := iter.Value()
		if err != nil {
			continue
		}
		results = append(results, val)
	}

	if results == nil {
		results = []string{}
	}

	return results, nil
}
