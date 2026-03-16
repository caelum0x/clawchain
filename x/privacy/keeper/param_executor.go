package keeper

import (
	"context"
	"fmt"
	"strconv"
)

// UpdateParam applies a governance parameter change to the privacy module.
func (k Keeper) UpdateParam(ctx context.Context, paramKey string, newValue string) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return fmt.Errorf("failed to get privacy params: %w", err)
	}

	switch paramKey {
	case "max_privacy_tx_per_block":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MaxPrivacyTxPerBlock = v
	default:
		return fmt.Errorf("unknown privacy param key: %s", paramKey)
	}

	return k.Params.Set(ctx, params)
}
