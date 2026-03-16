package keeper

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/modelregistry/types"
)

// ValidFrameworks lists the supported model frameworks.
var ValidFrameworks = map[string]bool{
	"pytorch":    true,
	"tensorflow": true,
	"onnx":       true,
	"gguf":       true,
	"safetensors": true,
	"jax":        true,
	"other":      true,
}

// ValidAccessTypes lists the supported access types.
var ValidAccessTypes = map[string]bool{
	"free":         true,
	"per_query":    true,
	"subscription": true,
	"one_time":     true,
}

// RegisterModel creates a new model record in the registry.
func (k Keeper) RegisterModel(ctx context.Context, owner string, model types.ModelRecord) (uint64, error) {
	if _, err := sdk.AccAddressFromBech32(owner); err != nil {
		return 0, types.ErrInvalidAddress.Wrapf("invalid owner: %s", err)
	}
	if model.Name == "" {
		return 0, fmt.Errorf("model name cannot be empty")
	}
	if model.StorageUri == "" {
		return 0, types.ErrInvalidStorageUri.Wrap("storage URI cannot be empty")
	}
	if !ValidFrameworks[strings.ToLower(model.Framework)] {
		return 0, types.ErrInvalidFramework.Wrapf("unsupported framework: %s", model.Framework)
	}
	if !ValidAccessTypes[strings.ToLower(model.AccessType)] {
		return 0, types.ErrInvalidAccessType.Wrapf("unsupported access type: %s", model.AccessType)
	}

	id, err := k.ModelCount.Next(ctx)
	if err != nil {
		return 0, err
	}
	id++ // 1-based IDs

	now := sdk.UnwrapSDKContext(ctx).BlockTime().Unix()
	model.Id = id
	model.Owner = owner
	model.Active = true
	model.CurrentVersion = 1
	model.TotalDownloads = 0
	model.TotalRevenue = "0"
	model.Rating = 0
	model.RatingCount = 0
	model.CreatedAt = now
	model.UpdatedAt = now

	bz, err := json.Marshal(model)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal model: %w", err)
	}
	if err := k.Models.Set(ctx, id, string(bz)); err != nil {
		return 0, err
	}

	// Store initial version
	version := types.ModelVersion{
		Id:             1,
		ModelId:        id,
		Version:        1,
		StorageUri:     model.StorageUri,
		ChecksumSha256: model.ChecksumSha256,
		SizeBytes:      model.SizeBytes,
		Changelog:      "Initial release",
		CreatedAt:      now,
	}
	vbz, err := json.Marshal(version)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal version: %w", err)
	}
	versionKey := fmt.Sprintf("%d/%d", id, 1)
	if err := k.ModelVersions.Set(ctx, versionKey, string(vbz)); err != nil {
		return 0, err
	}

	return id, nil
}

// UpdateModel updates a model's metadata. Only the owner can update.
func (k Keeper) UpdateModel(ctx context.Context, modelId uint64, caller string, updates types.ModelRecord) error {
	raw, err := k.Models.Get(ctx, modelId)
	if err != nil {
		return types.ErrModelNotFound.Wrapf("model %d", modelId)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return fmt.Errorf("failed to unmarshal model: %w", err)
	}
	if model.Owner != caller {
		return types.ErrNotModelOwner
	}

	// Apply non-empty updates
	if updates.Name != "" {
		model.Name = updates.Name
	}
	if updates.Description != "" {
		model.Description = updates.Description
	}
	if updates.Framework != "" {
		if !ValidFrameworks[strings.ToLower(updates.Framework)] {
			return types.ErrInvalidFramework.Wrapf("unsupported framework: %s", updates.Framework)
		}
		model.Framework = updates.Framework
	}
	if updates.Architecture != "" {
		model.Architecture = updates.Architecture
	}
	if updates.ParameterCount != "" {
		model.ParameterCount = updates.ParameterCount
	}
	if updates.License != "" {
		model.License = updates.License
	}
	if len(updates.Tags) > 0 {
		model.Tags = updates.Tags
	}
	if updates.AccessType != "" {
		if !ValidAccessTypes[strings.ToLower(updates.AccessType)] {
			return types.ErrInvalidAccessType.Wrapf("unsupported access type: %s", updates.AccessType)
		}
		model.AccessType = updates.AccessType
	}
	if updates.PricePerQueryUclaw != "" {
		model.PricePerQueryUclaw = updates.PricePerQueryUclaw
	}
	if updates.PriceOneTimeUclaw != "" {
		model.PriceOneTimeUclaw = updates.PriceOneTimeUclaw
	}
	if updates.PriceSubscriptionUclaw != "" {
		model.PriceSubscriptionUclaw = updates.PriceSubscriptionUclaw
	}
	if updates.SubscriptionPeriodBlocks > 0 {
		model.SubscriptionPeriodBlocks = updates.SubscriptionPeriodBlocks
	}

	model.UpdatedAt = sdk.UnwrapSDKContext(ctx).BlockTime().Unix()
	bz, err := json.Marshal(model)
	if err != nil {
		return fmt.Errorf("failed to marshal model: %w", err)
	}
	return k.Models.Set(ctx, modelId, string(bz))
}

// PublishVersion publishes a new version of a model.
func (k Keeper) PublishVersion(ctx context.Context, modelId uint64, caller string, version types.ModelVersion) (uint64, error) {
	raw, err := k.Models.Get(ctx, modelId)
	if err != nil {
		return 0, types.ErrModelNotFound.Wrapf("model %d", modelId)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return 0, fmt.Errorf("failed to unmarshal model: %w", err)
	}
	if model.Owner != caller {
		return 0, types.ErrNotModelOwner
	}

	now := sdk.UnwrapSDKContext(ctx).BlockTime().Unix()
	newVer := model.CurrentVersion + 1
	version.Id = newVer
	version.ModelId = modelId
	version.Version = newVer
	version.CreatedAt = now

	vbz, err := json.Marshal(version)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal version: %w", err)
	}
	versionKey := fmt.Sprintf("%d/%d", modelId, newVer)
	if err := k.ModelVersions.Set(ctx, versionKey, string(vbz)); err != nil {
		return 0, err
	}

	// Update model record
	model.CurrentVersion = newVer
	model.StorageUri = version.StorageUri
	model.ChecksumSha256 = version.ChecksumSha256
	model.SizeBytes = version.SizeBytes
	model.UpdatedAt = now

	bz, err := json.Marshal(model)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal model: %w", err)
	}
	if err := k.Models.Set(ctx, modelId, string(bz)); err != nil {
		return 0, err
	}

	return newVer, nil
}

// DelistModel deactivates a model. Only the owner can delist.
func (k Keeper) DelistModel(ctx context.Context, modelId uint64, caller string) error {
	raw, err := k.Models.Get(ctx, modelId)
	if err != nil {
		return types.ErrModelNotFound.Wrapf("model %d", modelId)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return fmt.Errorf("failed to unmarshal model: %w", err)
	}
	if model.Owner != caller {
		return types.ErrNotModelOwner
	}

	model.Active = false
	model.UpdatedAt = sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

	bz, err := json.Marshal(model)
	if err != nil {
		return fmt.Errorf("failed to marshal model: %w", err)
	}
	return k.Models.Set(ctx, modelId, string(bz))
}

// PurchaseAccess grants access to a paid model by transferring the appropriate fee.
// For subscription models, subscriptionPeriods controls the duration (default 1).
func (k Keeper) PurchaseAccess(ctx context.Context, modelId uint64, buyer string, subscriptionPeriods uint64) error {
	raw, err := k.Models.Get(ctx, modelId)
	if err != nil {
		return types.ErrModelNotFound.Wrapf("model %d", modelId)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return fmt.Errorf("failed to unmarshal model: %w", err)
	}
	if !model.Active {
		return types.ErrModelInactive
	}
	if model.AccessType == "free" {
		// Free models don't require purchase – grant access
		return k.grantAccess(ctx, modelId, buyer, 0)
	}

	buyerAddr, err := sdk.AccAddressFromBech32(buyer)
	if err != nil {
		return types.ErrInvalidAddress.Wrapf("invalid buyer: %s", err)
	}
	ownerAddr, err := sdk.AccAddressFromBech32(model.Owner)
	if err != nil {
		return types.ErrInvalidAddress.Wrapf("invalid owner: %s", err)
	}

	// Determine price and expiry based on access type.
	var price math.Int
	var expiresAt int64

	switch model.AccessType {
	case "one_time":
		if model.PriceOneTimeUclaw == "" || model.PriceOneTimeUclaw == "0" {
			return k.grantAccess(ctx, modelId, buyer, 0)
		}
		amt, ok := math.NewIntFromString(model.PriceOneTimeUclaw)
		if !ok || !amt.IsPositive() {
			return fmt.Errorf("invalid price: %s", model.PriceOneTimeUclaw)
		}
		price = amt
		expiresAt = 0 // permanent
	case "per_query":
		// For per-query models, purchase grants access but doesn't charge upfront.
		return k.grantAccess(ctx, modelId, buyer, 0)
	case "subscription":
		if model.PriceSubscriptionUclaw == "" || model.PriceSubscriptionUclaw == "0" {
			return types.ErrNoSubscriptionPrice
		}
		periods := subscriptionPeriods
		if periods == 0 {
			periods = 1
		}
		subPrice, ok := math.NewIntFromString(model.PriceSubscriptionUclaw)
		if !ok || !subPrice.IsPositive() {
			return fmt.Errorf("invalid subscription price: %s", model.PriceSubscriptionUclaw)
		}
		price = subPrice.MulRaw(int64(periods))

		sdkCtx := sdk.UnwrapSDKContext(ctx)
		periodBlocks := model.SubscriptionPeriodBlocks
		if periodBlocks == 0 {
			periodBlocks = 43200 // ~3 days at 6s blocks default
		}
		// Check if buyer already has access and extend from current expiry.
		accessKey := fmt.Sprintf("%d/%s", modelId, buyer)
		if rawAccess, aErr := k.ModelAccess.Get(ctx, accessKey); aErr == nil {
			var existing types.ModelAccess
			if jErr := json.Unmarshal([]byte(rawAccess), &existing); jErr == nil && existing.ExpiresAt > sdkCtx.BlockHeight() {
				expiresAt = existing.ExpiresAt + int64(periodBlocks*periods)
			} else {
				expiresAt = sdkCtx.BlockHeight() + int64(periodBlocks*periods)
			}
		} else {
			expiresAt = sdkCtx.BlockHeight() + int64(periodBlocks*periods)
		}
	default:
		if model.PriceOneTimeUclaw != "" && model.PriceOneTimeUclaw != "0" {
			amt, ok := math.NewIntFromString(model.PriceOneTimeUclaw)
			if !ok || !amt.IsPositive() {
				return fmt.Errorf("invalid price: %s", model.PriceOneTimeUclaw)
			}
			price = amt
		}
	}

	if price.IsPositive() {
		coins := sdk.NewCoins(sdk.NewCoin("uclaw", price))
		if err := k.bankKeeper.SendCoins(ctx, buyerAddr, ownerAddr, coins); err != nil {
			return fmt.Errorf("payment failed: %w", err)
		}

		// Update revenue.
		rev, ok := math.NewIntFromString(model.TotalRevenue)
		if !ok {
			rev = math.ZeroInt()
		}
		rev = rev.Add(price)
		model.TotalRevenue = rev.String()
		model.TotalDownloads++
		model.UpdatedAt = sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

		bz, err := json.Marshal(model)
		if err != nil {
			return fmt.Errorf("failed to marshal model: %w", err)
		}
		if err := k.Models.Set(ctx, modelId, string(bz)); err != nil {
			return err
		}
	}

	return k.grantAccess(ctx, modelId, buyer, expiresAt)
}

// grantAccess writes an access record for a model/user pair.
// expiresAt is a block height; 0 means permanent access.
func (k Keeper) grantAccess(ctx context.Context, modelId uint64, address string, expiresAt int64) error {
	now := sdk.UnwrapSDKContext(ctx).BlockTime().Unix()
	access := types.ModelAccess{
		ModelId:    modelId,
		Address:    address,
		GrantedAt:  now,
		ExpiresAt:  expiresAt,
		QueryCount: 0,
	}
	bz, err := json.Marshal(access)
	if err != nil {
		return fmt.Errorf("failed to marshal access: %w", err)
	}
	key := fmt.Sprintf("%d/%s", modelId, address)
	return k.ModelAccess.Set(ctx, key, string(bz))
}

// RecordUsage records a query against a model and charges per-query fee if applicable.
func (k Keeper) RecordUsage(ctx context.Context, modelId uint64, user string) error {
	raw, err := k.Models.Get(ctx, modelId)
	if err != nil {
		return types.ErrModelNotFound.Wrapf("model %d", modelId)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return fmt.Errorf("failed to unmarshal model: %w", err)
	}
	if !model.Active {
		return types.ErrModelInactive
	}

	// Check access for paid models.
	if model.AccessType != "free" {
		accessKey := fmt.Sprintf("%d/%s", modelId, user)
		rawAccess, err := k.ModelAccess.Get(ctx, accessKey)
		if err != nil {
			return types.ErrNoAccess
		}
		// Check subscription expiry.
		var access types.ModelAccess
		if jErr := json.Unmarshal([]byte(rawAccess), &access); jErr == nil && access.ExpiresAt > 0 {
			sdkCtx := sdk.UnwrapSDKContext(ctx)
			if sdkCtx.BlockHeight() > access.ExpiresAt {
				return types.ErrSubscriptionExpired
			}
		}
	}

	now := sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

	// Charge per-query fee if applicable
	if model.AccessType == "per_query" && model.PricePerQueryUclaw != "" && model.PricePerQueryUclaw != "0" {
		userAddr, err := sdk.AccAddressFromBech32(user)
		if err != nil {
			return types.ErrInvalidAddress.Wrapf("invalid user: %s", err)
		}
		ownerAddr, err := sdk.AccAddressFromBech32(model.Owner)
		if err != nil {
			return types.ErrInvalidAddress.Wrapf("invalid owner: %s", err)
		}

		amt, ok := math.NewIntFromString(model.PricePerQueryUclaw)
		if ok && amt.IsPositive() {
			coins := sdk.NewCoins(sdk.NewCoin("uclaw", amt))
			if err := k.bankKeeper.SendCoins(ctx, userAddr, ownerAddr, coins); err != nil {
				return fmt.Errorf("per-query payment failed: %w", err)
			}

			rev, ok := math.NewIntFromString(model.TotalRevenue)
			if !ok {
				rev = math.ZeroInt()
			}
			rev = rev.Add(amt)
			model.TotalRevenue = rev.String()
		}
	}

	// Update usage record
	usageKey := fmt.Sprintf("%d/%s", modelId, user)
	var usage types.ModelUsageRecord
	rawUsage, err := k.ModelUsage.Get(ctx, usageKey)
	if err == nil {
		_ = json.Unmarshal([]byte(rawUsage), &usage)
	}
	usage.ModelId = modelId
	usage.User = user
	usage.QueryCount++
	usage.LastQueryAt = now

	ubz, err := json.Marshal(usage)
	if err != nil {
		return fmt.Errorf("failed to marshal usage: %w", err)
	}
	if err := k.ModelUsage.Set(ctx, usageKey, string(ubz)); err != nil {
		return err
	}

	// Update model download count
	model.TotalDownloads++
	model.UpdatedAt = now
	bz, err := json.Marshal(model)
	if err != nil {
		return fmt.Errorf("failed to marshal model: %w", err)
	}
	return k.Models.Set(ctx, modelId, string(bz))
}

// RateModel records a rating for a model. Rating is 0-500 (0.0-5.0 stars * 100).
func (k Keeper) RateModel(ctx context.Context, modelId uint64, rater string, rating uint32) error {
	if rating > 500 {
		return types.ErrInvalidRating.Wrapf("rating %d exceeds maximum 500", rating)
	}

	raw, err := k.Models.Get(ctx, modelId)
	if err != nil {
		return types.ErrModelNotFound.Wrapf("model %d", modelId)
	}
	var model types.ModelRecord
	if err := json.Unmarshal([]byte(raw), &model); err != nil {
		return fmt.Errorf("failed to unmarshal model: %w", err)
	}
	if model.Owner == rater {
		return types.ErrSelfRating
	}

	// Compute new average rating
	totalRating := uint64(model.Rating)*uint64(model.RatingCount) + uint64(rating)
	model.RatingCount++
	model.Rating = uint32(totalRating / uint64(model.RatingCount))
	model.UpdatedAt = sdk.UnwrapSDKContext(ctx).BlockTime().Unix()

	bz, err := json.Marshal(model)
	if err != nil {
		return fmt.Errorf("failed to marshal model: %w", err)
	}
	return k.Models.Set(ctx, modelId, string(bz))
}
