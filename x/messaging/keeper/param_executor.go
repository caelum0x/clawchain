package keeper

import (
	"context"
	"fmt"
	"strconv"
)

// UpdateParam applies a governance parameter change to the messaging module.
func (k Keeper) UpdateParam(ctx context.Context, paramKey string, newValue string) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return fmt.Errorf("failed to get messaging params: %w", err)
	}

	switch paramKey {
	case "max_message_size":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MaxMessageSize = v
	case "message_ttl_blocks":
		v, err := strconv.ParseUint(newValue, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid value for %s: %w", paramKey, err)
		}
		params.MessageTtlBlocks = v
	default:
		return fmt.Errorf("unknown messaging param key: %s", paramKey)
	}

	if err := params.Validate(); err != nil {
		return fmt.Errorf("invalid params after update: %w", err)
	}

	return k.Params.Set(ctx, params)
}
