package keeper

import (
	"context"
	"strconv"

	"clawchain/x/messaging/types"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

// PruneExpiredMessages prunes messages that have exceeded their TTL.
func (k Keeper) PruneExpiredMessages(ctx context.Context) error {
	params, err := k.Params.Get(ctx)
	if err != nil {
		return nil // no params set yet — nothing to prune
	}

	ttl := params.MessageTtlBlocks
	if ttl == 0 {
		return nil // TTL disabled
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentHeight := sdkCtx.BlockHeight()
	cutoff := currentHeight - int64(ttl)
	if cutoff < 0 {
		return nil
	}

	type expiredMsg struct {
		id       uint64
		nonceKey string
	}
	var toDelete []expiredMsg
	err = k.Messages.Walk(ctx, nil, func(id uint64, msg types.MessageEntry) (bool, error) {
		if msg.BlockHeight > 0 && msg.BlockHeight <= cutoff {
			toDelete = append(toDelete, expiredMsg{
				id:       id,
				nonceKey: msg.Sender + "|" + msg.Nonce,
			})
		}
		return false, nil
	})
	if err != nil {
		return err
	}

	for _, em := range toDelete {
		if err := k.Messages.Remove(ctx, em.id); err != nil {
			return err
		}
		_ = k.MessageNonceIndex.Remove(ctx, em.nonceKey)
	}

	if count := len(toDelete); count > 0 {
		sdkCtx.EventManager().EmitEvent(
			sdk.NewEvent(
				"messages_expired",
				sdk.NewAttribute("count", strconv.Itoa(count)),
				sdk.NewAttribute("cutoff_height", strconv.FormatInt(cutoff, 10)),
			),
		)
	}

	return nil
}
