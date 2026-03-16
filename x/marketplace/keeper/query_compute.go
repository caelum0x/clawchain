package keeper

import (
	"context"
	"encoding/json"

	"clawchain/x/marketplace/types"
)

// QueryComputeResources returns all compute resources, optionally filtered to only available ones.
func (k Keeper) QueryComputeResources(ctx context.Context, onlyAvailable bool) ([]types.ComputeResource, error) {
	resources := make([]types.ComputeResource, 0)
	err := k.ComputeResources.Walk(ctx, nil, func(_ uint64, value string) (bool, error) {
		var resource types.ComputeResource
		if err := json.Unmarshal([]byte(value), &resource); err != nil {
			return false, nil // skip malformed entries
		}
		if onlyAvailable {
			if !resource.Active || resource.CurrentLessee != "" {
				return false, nil
			}
		}
		resources = append(resources, resource)
		return false, nil
	})
	if err != nil {
		return nil, err
	}
	return resources, nil
}

// QueryComputeResource returns a single compute resource by ID.
func (k Keeper) QueryComputeResource(ctx context.Context, resourceId uint64) (*types.ComputeResource, error) {
	resourceJSON, err := k.ComputeResources.Get(ctx, resourceId)
	if err != nil {
		return nil, err
	}
	var resource types.ComputeResource
	if err := json.Unmarshal([]byte(resourceJSON), &resource); err != nil {
		return nil, err
	}
	return &resource, nil
}

// QueryComputeLeases returns compute leases for a given address (as lessee or provider).
// If address is empty, returns all leases.
func (k Keeper) QueryComputeLeases(ctx context.Context, address string) ([]types.ComputeLease, error) {
	leases := make([]types.ComputeLease, 0)
	err := k.ComputeLeases.Walk(ctx, nil, func(_ uint64, value string) (bool, error) {
		var lease types.ComputeLease
		if err := json.Unmarshal([]byte(value), &lease); err != nil {
			return false, nil // skip malformed entries
		}
		if address == "" || lease.Lessee == address || lease.Provider == address {
			leases = append(leases, lease)
		}
		return false, nil
	})
	if err != nil {
		return nil, err
	}
	return leases, nil
}
