package types

const (
	// DefaultMaxActionsPerBlock is a spam-control limiter applied per agent
	// per block across high-impact coordination/task actions.
	DefaultMaxActionsPerBlock uint64 = 8

	// DefaultMinTaskBudgetUClaw is the minimum required budget for delegated tasks.
	// This acts as a base economic anti-spam/deposit hook for task creation.
	DefaultMinTaskBudgetUClaw uint64 = 1

	// DefaultMinHeartbeatIntervalBlocks is the minimum number of blocks
	// between heartbeats from the same agent (spam protection).
	DefaultMinHeartbeatIntervalBlocks uint64 = 10

	// DefaultMaxIntentsPerBlock is the maximum number of intents an agent
	// can submit per block.
	DefaultMaxIntentsPerBlock uint64 = 4

	// DefaultMaxTasksPerBlock is the maximum number of tasks an agent can
	// delegate per block.
	DefaultMaxTasksPerBlock uint64 = 4

	// DefaultMaxPayloadBytes is the maximum size in bytes for free-form
	// payload, description, metadata, and requirements fields.
	DefaultMaxPayloadBytes uint64 = 4096

	// DefaultMinAgentDepositUClaw is the minimum deposit in uclaw required
	// to register an agent (1 CLAW = 1_000_000 uclaw).
	DefaultMinAgentDepositUClaw uint64 = 1_000_000

	// DefaultDepositSlashPerPenaltyBps is the basis points of deposit
	// slashed per SLA penalty event (100 = 1%).
	DefaultDepositSlashPerPenaltyBps uint64 = 100

	// DefaultHighImpactMinDepositUClaw is the minimum locked deposit required
	// for high-impact actions (transfer/coordinate).
	DefaultHighImpactMinDepositUClaw uint64 = 1_000_000

	// DefaultStandardTaskMinBudgetUClaw is the minimum budget for tasks with
	// explicit non-expedited deadlines.
	DefaultStandardTaskMinBudgetUClaw uint64 = 10

	// DefaultExpeditedTaskMinBudgetUClaw is the minimum budget for short-deadline
	// expedited tasks.
	DefaultExpeditedTaskMinBudgetUClaw uint64 = 100

	// DefaultExpeditedTaskMaxDeadlineBlocks is the cutoff (in blocks) for
	// classifying a task as expedited.
	DefaultExpeditedTaskMaxDeadlineBlocks uint64 = 100
)
