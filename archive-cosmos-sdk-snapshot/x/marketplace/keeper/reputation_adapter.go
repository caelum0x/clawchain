package keeper

import (
	"context"
	"errors"

	"cosmossdk.io/collections"
)

// HasPurchased checks whether buyer has purchased from seller.
// Used by x/reputation for purchase-gated rating checks.
func (k Keeper) HasPurchased(ctx context.Context, buyer, seller string) (bool, error) {
	purchaseKey := buyer + "|" + seller
	has, err := k.Purchases.Get(ctx, purchaseKey)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	return has, nil
}
