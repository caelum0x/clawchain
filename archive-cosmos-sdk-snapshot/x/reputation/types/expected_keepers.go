package types

import "context"

type AgentKeeper interface {
	IsAgentRegistered(ctx context.Context, address string) (bool, error)
	GetMaxHeartbeatGapBlocks(ctx context.Context) (int64, error)
	WalkHeartbeatStatuses(
		ctx context.Context,
		walkFn func(address string, lastHeartbeatHeight int64) (stop bool, err error),
	) error
	WalkCompletedTaskSLAEvents(
		ctx context.Context,
		afterTaskID uint64,
		walkFn func(taskID uint64, assignee string, onTime bool, latenessBlocks int64) (stop bool, err error),
	) error
	GetDepositSlashBps(ctx context.Context) (uint64, error)
	SlashAgentDeposit(ctx context.Context, address string, bps uint64) error
}

type MarketplaceKeeper interface {
	HasPurchased(ctx context.Context, buyer, seller string) (bool, error)
}
