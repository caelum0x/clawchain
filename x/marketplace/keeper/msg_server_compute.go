package keeper

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/marketplace/types"
)

// ListComputeResource registers a new GPU compute resource on the marketplace.
func (k Keeper) ListComputeResource(ctx context.Context, owner string, resource types.ComputeResource) (uint64, error) {
	if _, err := k.addressCodec.StringToBytes(owner); err != nil {
		return 0, errorsmod.Wrap(types.ErrInvalidAddress, "invalid owner address")
	}
	if resource.Name == "" {
		return 0, errorsmod.Wrap(types.ErrEmptyName, "resource name cannot be empty")
	}
	if resource.GpuModel == "" || resource.GpuCount == 0 {
		return 0, errorsmod.Wrap(types.ErrInvalidGpuSpec, "gpu_model and gpu_count are required")
	}
	if resource.Endpoint == "" {
		return 0, errorsmod.Wrap(types.ErrEmptyEndpoint, "endpoint is required")
	}

	// Validate price
	price := new(big.Int)
	if _, ok := price.SetString(resource.PricePerHourUclaw, 10); !ok || price.Sign() <= 0 {
		return 0, errorsmod.Wrap(types.ErrInvalidPrice, "price_per_hour_uclaw must be a positive integer")
	}
	if resource.MinLeaseHours == 0 {
		resource.MinLeaseHours = 1
	}

	id, err := k.ComputeResourceCount.Next(ctx)
	if err != nil {
		return 0, err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	resource.Id = id
	resource.Owner = owner
	resource.Active = true
	resource.CurrentLessee = ""
	resource.LeaseExpiresAt = 0
	resource.TotalLeases = 0
	resource.TotalRevenue = "0"
	resource.BlockHeight = sdkCtx.BlockHeight()
	resource.Timestamp = sdkCtx.BlockTime().Unix()

	bz, err := json.Marshal(resource)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal compute resource: %w", err)
	}
	if err := k.ComputeResources.Set(ctx, id, string(bz)); err != nil {
		return 0, err
	}

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"list_compute_resource",
		sdk.NewAttribute("resource_id", fmt.Sprintf("%d", id)),
		sdk.NewAttribute("owner", owner),
		sdk.NewAttribute("gpu_model", resource.GpuModel),
		sdk.NewAttribute("gpu_count", fmt.Sprintf("%d", resource.GpuCount)),
		sdk.NewAttribute("price_per_hour", resource.PricePerHourUclaw),
	))

	return id, nil
}

// LeaseComputeResource creates a lease for a compute resource.
func (k Keeper) LeaseComputeResource(ctx context.Context, lessee string, resourceId uint64, hours uint32) (uint64, error) {
	lesseeAddr, err := k.addressCodec.StringToBytes(lessee)
	if err != nil {
		return 0, errorsmod.Wrap(types.ErrInvalidAddress, "invalid lessee address")
	}

	// Look up the resource
	resourceJSON, err := k.ComputeResources.Get(ctx, resourceId)
	if err != nil {
		return 0, errorsmod.Wrap(types.ErrComputeResourceNotFound, "resource not found")
	}
	var resource types.ComputeResource
	if err := json.Unmarshal([]byte(resourceJSON), &resource); err != nil {
		return 0, fmt.Errorf("failed to unmarshal compute resource: %w", err)
	}

	// Validate resource is available
	if !resource.Active {
		return 0, errorsmod.Wrap(types.ErrComputeResourceInactive, "resource is not active")
	}
	if resource.CurrentLessee != "" {
		return 0, errorsmod.Wrap(types.ErrComputeResourceLeased, "resource is currently leased")
	}
	if lessee == resource.Owner {
		return 0, errorsmod.Wrap(types.ErrSelfPurchase, "cannot lease your own resource")
	}

	// Validate lease hours
	if hours < resource.MinLeaseHours {
		return 0, errorsmod.Wrapf(types.ErrInvalidLeaseHours, "minimum lease is %d hours", resource.MinLeaseHours)
	}
	if resource.MaxLeaseHours > 0 && hours > resource.MaxLeaseHours {
		return 0, errorsmod.Wrapf(types.ErrInvalidLeaseHours, "maximum lease is %d hours", resource.MaxLeaseHours)
	}

	// Calculate total cost: price_per_hour * hours
	pricePerHour := new(big.Int)
	if _, ok := pricePerHour.SetString(resource.PricePerHourUclaw, 10); !ok {
		return 0, errorsmod.Wrap(types.ErrInvalidPrice, "invalid price in resource")
	}
	totalCost := new(big.Int).Mul(pricePerHour, big.NewInt(int64(hours)))
	totalCostStr := totalCost.String()

	// Transfer payment from lessee to module (escrow)
	coin, err := sdk.ParseCoinNormalized(totalCostStr + "uclaw")
	if err != nil {
		return 0, errorsmod.Wrap(types.ErrInvalidPrice, "failed to parse cost coin")
	}
	lesseeAccAddr := sdk.AccAddress(lesseeAddr)
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, lesseeAccAddr, types.ModuleName, sdk.NewCoins(coin)); err != nil {
		return 0, errorsmod.Wrap(types.ErrInsufficientFunds, "failed to lock lease payment")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()

	// Approximate blocks per hour (~600 blocks/hour at 6s block time)
	blocksPerHour := int64(600)
	leaseBlocks := int64(hours) * blocksPerHour

	// Create lease
	leaseId, err := k.ComputeLeaseCount.Next(ctx)
	if err != nil {
		return 0, err
	}

	lease := types.ComputeLease{
		Id:             leaseId,
		ResourceId:     resourceId,
		Lessee:         lessee,
		Provider:       resource.Owner,
		StartBlock:     blockHeight,
		EndBlock:       blockHeight + leaseBlocks,
		TotalCostUclaw: totalCostStr,
		Status:         "active",
	}

	leaseBz, err := json.Marshal(lease)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal compute lease: %w", err)
	}
	if err := k.ComputeLeases.Set(ctx, leaseId, string(leaseBz)); err != nil {
		return 0, err
	}

	// Update resource status
	resource.CurrentLessee = lessee
	resource.LeaseExpiresAt = blockHeight + leaseBlocks
	resource.TotalLeases++
	prevRevenue := new(big.Int)
	prevRevenue.SetString(resource.TotalRevenue, 10)
	newRevenue := new(big.Int).Add(prevRevenue, totalCost)
	resource.TotalRevenue = newRevenue.String()

	resBz, err := json.Marshal(resource)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal updated resource: %w", err)
	}
	if err := k.ComputeResources.Set(ctx, resourceId, string(resBz)); err != nil {
		return 0, err
	}

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"lease_compute_resource",
		sdk.NewAttribute("lease_id", fmt.Sprintf("%d", leaseId)),
		sdk.NewAttribute("resource_id", fmt.Sprintf("%d", resourceId)),
		sdk.NewAttribute("lessee", lessee),
		sdk.NewAttribute("provider", resource.Owner),
		sdk.NewAttribute("hours", fmt.Sprintf("%d", hours)),
		sdk.NewAttribute("total_cost_uclaw", totalCostStr),
		sdk.NewAttribute("end_block", fmt.Sprintf("%d", blockHeight+leaseBlocks)),
	))

	return leaseId, nil
}

// ReleaseComputeResource ends an active lease early. Can be called by the
// lessee (voluntary release) or the provider.
func (k Keeper) ReleaseComputeResource(ctx context.Context, leaseId uint64, caller string) error {
	leaseJSON, err := k.ComputeLeases.Get(ctx, leaseId)
	if err != nil {
		return errorsmod.Wrap(types.ErrLeaseNotFound, "lease not found")
	}
	var lease types.ComputeLease
	if err := json.Unmarshal([]byte(leaseJSON), &lease); err != nil {
		return fmt.Errorf("failed to unmarshal compute lease: %w", err)
	}

	if lease.Status != "active" {
		return errorsmod.Wrap(types.ErrLeaseNotActive, "lease is not active")
	}
	if caller != lease.Lessee && caller != lease.Provider {
		return errorsmod.Wrap(types.ErrNotLeaseParty, "only lessee or provider can release")
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()

	// Release payment from escrow to provider
	totalCost := new(big.Int)
	totalCost.SetString(lease.TotalCostUclaw, 10)
	if totalCost.Sign() > 0 {
		coin, err := sdk.ParseCoinNormalized(lease.TotalCostUclaw + "uclaw")
		if err == nil && coin.IsPositive() {
			providerAddr, pErr := sdk.AccAddressFromBech32(lease.Provider)
			if pErr == nil {
				_ = k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, providerAddr, sdk.NewCoins(coin))
			}
		}
	}

	// Update lease
	lease.Status = "completed"
	leaseBz, _ := json.Marshal(lease)
	if err := k.ComputeLeases.Set(ctx, leaseId, string(leaseBz)); err != nil {
		return err
	}

	// Clear resource lease
	resourceJSON, err := k.ComputeResources.Get(ctx, lease.ResourceId)
	if err == nil {
		var resource types.ComputeResource
		if json.Unmarshal([]byte(resourceJSON), &resource) == nil {
			resource.CurrentLessee = ""
			resource.LeaseExpiresAt = 0
			resBz, _ := json.Marshal(resource)
			_ = k.ComputeResources.Set(ctx, lease.ResourceId, string(resBz))
		}
	}

	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"release_compute_resource",
		sdk.NewAttribute("lease_id", fmt.Sprintf("%d", leaseId)),
		sdk.NewAttribute("resource_id", fmt.Sprintf("%d", lease.ResourceId)),
		sdk.NewAttribute("released_by", caller),
		sdk.NewAttribute("block_height", fmt.Sprintf("%d", blockHeight)),
	))

	return nil
}

// DelistComputeResource removes a compute resource listing.
func (k Keeper) DelistComputeResource(ctx context.Context, resourceId uint64, caller string) error {
	resourceJSON, err := k.ComputeResources.Get(ctx, resourceId)
	if err != nil {
		return errorsmod.Wrap(types.ErrComputeResourceNotFound, "resource not found")
	}
	var resource types.ComputeResource
	if err := json.Unmarshal([]byte(resourceJSON), &resource); err != nil {
		return fmt.Errorf("failed to unmarshal compute resource: %w", err)
	}

	if caller != resource.Owner {
		return errorsmod.Wrap(types.ErrNotResourceOwner, "only the owner can delist a resource")
	}
	if resource.CurrentLessee != "" {
		return errorsmod.Wrap(types.ErrResourceCurrentlyLeased, "cannot delist while resource is leased")
	}

	resource.Active = false
	resBz, _ := json.Marshal(resource)
	if err := k.ComputeResources.Set(ctx, resourceId, string(resBz)); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
		"delist_compute_resource",
		sdk.NewAttribute("resource_id", fmt.Sprintf("%d", resourceId)),
		sdk.NewAttribute("owner", caller),
	))

	return nil
}

// ExpireComputeLeases iterates active compute leases and expires those
// past their end_block. Payment is released to the provider.
func (k Keeper) ExpireComputeLeases(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	blockHeight := sdkCtx.BlockHeight()

	return k.ComputeLeases.Walk(ctx, nil, func(key uint64, leaseJSON string) (bool, error) {
		var lease types.ComputeLease
		if err := json.Unmarshal([]byte(leaseJSON), &lease); err != nil {
			return false, nil // skip malformed entries
		}
		if lease.Status != "active" {
			return false, nil
		}
		if blockHeight <= lease.EndBlock {
			return false, nil
		}

		// Lease expired: release payment to provider
		totalCost := new(big.Int)
		totalCost.SetString(lease.TotalCostUclaw, 10)
		if totalCost.Sign() > 0 {
			coin, err := sdk.ParseCoinNormalized(lease.TotalCostUclaw + "uclaw")
			if err == nil && coin.IsPositive() {
				providerAddr, pErr := sdk.AccAddressFromBech32(lease.Provider)
				if pErr == nil {
					_ = k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, providerAddr, sdk.NewCoins(coin))
				}
			}
		}

		lease.Status = "expired"
		leaseBz, _ := json.Marshal(lease)
		if err := k.ComputeLeases.Set(ctx, key, string(leaseBz)); err != nil {
			return false, err
		}

		// Clear resource lease status
		resourceJSON, err := k.ComputeResources.Get(ctx, lease.ResourceId)
		if err == nil {
			var resource types.ComputeResource
			if json.Unmarshal([]byte(resourceJSON), &resource) == nil {
				resource.CurrentLessee = ""
				resource.LeaseExpiresAt = 0
				resBz, _ := json.Marshal(resource)
				_ = k.ComputeResources.Set(ctx, lease.ResourceId, string(resBz))
			}
		}

		sdkCtx.EventManager().EmitEvent(sdk.NewEvent(
			"expire_compute_lease",
			sdk.NewAttribute("lease_id", fmt.Sprintf("%d", key)),
			sdk.NewAttribute("resource_id", fmt.Sprintf("%d", lease.ResourceId)),
			sdk.NewAttribute("provider", lease.Provider),
			sdk.NewAttribute("lessee", lease.Lessee),
		))

		return false, nil
	})
}
