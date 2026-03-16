package types

import "fmt"

// DefaultMaxHeartbeatGapBlocks is the default number of blocks an agent can
// go without a heartbeat before being auto-deactivated (≈20 min at 6s blocks).
const DefaultMaxHeartbeatGapBlocks int64 = 200

const DefaultAgentRewardPoolFractionBps uint64 = 1000    // 10% of inflation
const DefaultMinReputationForRewardBps uint64 = 5000     // 50% min uptime
const DefaultRewardDistributionIntervalBlocks uint64 = 100

// DefaultStaleTaskThresholdBlocks is the number of blocks after an agent's
// last heartbeat before its accepted tasks are considered stale.
const DefaultStaleTaskThresholdBlocks uint64 = 50

// DefaultTaskReassignThresholdBlocks is the number of blocks after an agent's
// last heartbeat before its accepted tasks are auto-reassigned (set back to pending).
const DefaultTaskReassignThresholdBlocks uint64 = 100

// NewParams creates a new Params instance.
func NewParams() Params {
	return Params{
		MaxHeartbeatGapBlocks:          DefaultMaxHeartbeatGapBlocks,
		MaxActionsPerBlock:             DefaultMaxActionsPerBlock,
		MinHeartbeatIntervalBlocks:     DefaultMinHeartbeatIntervalBlocks,
		MaxIntentsPerBlock:             DefaultMaxIntentsPerBlock,
		MaxTasksPerBlock:               DefaultMaxTasksPerBlock,
		MaxPayloadBytes:                DefaultMaxPayloadBytes,
		MinAgentDepositUclaw:           DefaultMinAgentDepositUClaw,
		DepositSlashPerPenaltyBps:      DefaultDepositSlashPerPenaltyBps,
		MinTaskBudgetUclaw:             DefaultMinTaskBudgetUClaw,
		HighImpactMinDepositUclaw:      DefaultHighImpactMinDepositUClaw,
		StandardTaskMinBudgetUclaw:     DefaultStandardTaskMinBudgetUClaw,
		ExpeditedTaskMinBudgetUclaw:      DefaultExpeditedTaskMinBudgetUClaw,
		ExpeditedTaskMaxDeadlineBlocks:   DefaultExpeditedTaskMaxDeadlineBlocks,
		AgentRewardPoolFractionBps:       DefaultAgentRewardPoolFractionBps,
		MinReputationForRewardBps:        DefaultMinReputationForRewardBps,
		RewardDistributionIntervalBlocks: DefaultRewardDistributionIntervalBlocks,
	}
}

// DefaultParams returns a default set of parameters.
func DefaultParams() Params {
	return NewParams()
}

// Validate validates the set of params.
func (p Params) Validate() error {
	if p.MaxHeartbeatGapBlocks < 0 {
		return fmt.Errorf("max_heartbeat_gap_blocks must be non-negative, got %d", p.MaxHeartbeatGapBlocks)
	}
	if p.MaxActionsPerBlock == 0 {
		return fmt.Errorf("max_actions_per_block must be positive")
	}
	if p.MaxTasksPerBlock == 0 {
		return fmt.Errorf("max_tasks_per_block must be positive")
	}
	if p.MaxPayloadBytes == 0 {
		return fmt.Errorf("max_payload_bytes must be positive")
	}
	if p.MinTaskBudgetUclaw == 0 {
		return fmt.Errorf("min_task_budget_uclaw must be positive")
	}
	return nil
}
