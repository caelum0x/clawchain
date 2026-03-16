package types

import (
	"fmt"
)

// Proposal status constants.
const (
	ProposalStatusVoting    = "voting"
	ProposalStatusPassed    = "passed"
	ProposalStatusRejected  = "rejected"
	ProposalStatusExecuted  = "executed"
	ProposalStatusCancelled = "cancelled"
)

// Vote option constants.
const (
	VoteOptionYes        = "yes"
	VoteOptionNo         = "no"
	VoteOptionAbstain    = "abstain"
	VoteOptionNoWithVeto = "no_with_veto"
)

// DefaultVotingPeriodBlocks is the default voting period (~7 days at 6s blocks).
const DefaultVotingPeriodBlocks int64 = 50400

// DefaultMinDeposit is the default minimum deposit in uclaw.
const DefaultMinDepositUclaw int64 = 10_000_000 // 10 CLAW

// DefaultQuorumBps is the default quorum in basis points (33%).
const DefaultQuorumBps int64 = 3300

// DefaultThresholdBps is the default pass threshold in basis points (50%).
const DefaultThresholdBps int64 = 5000

// DefaultVetoThresholdBps is the veto threshold in basis points (33.4%).
// If no_with_veto votes exceed this percentage of total votes, the proposal is vetoed.
const DefaultVetoThresholdBps int64 = 3340

// AllowedModules is the set of modules whose parameters can be changed.
var AllowedModules = map[string]bool{
	"agent":         true,
	"marketplace":   true,
	"modelregistry": true,
	"privacy":       true,
	"messaging":     true,
	"reputation":    true,
}

// AllowedParams maps module names to their valid parameter keys.
// Keys must match the proto field names in each module's Params struct.
var AllowedParams = map[string][]string{
	"agent": {
		"max_heartbeat_gap_blocks",
		"max_actions_per_block",
		"min_heartbeat_interval_blocks",
		"max_intents_per_block",
		"max_tasks_per_block",
		"max_payload_bytes",
		"min_agent_deposit_uclaw",
		"deposit_slash_per_penalty_bps",
		"min_task_budget_uclaw",
		"high_impact_min_deposit_uclaw",
		"standard_task_min_budget_uclaw",
		"expedited_task_min_budget_uclaw",
		"expedited_task_max_deadline_blocks",
		"agent_reward_pool_fraction_bps",
		"min_reputation_for_reward_bps",
		"reward_distribution_interval_blocks",
	},
	"marketplace": {
		"max_skills_per_agent",
	},
	"modelregistry": {
		"min_deposit_uclaw",
		"max_models",
		"platform_fee_bps",
	},
	"privacy": {
		"max_privacy_tx_per_block",
	},
	"messaging": {
		"max_message_size",
	},
	"reputation": {
		"max_comment_length",
		"heartbeat_penalty_bps",
		"heartbeat_recovery_bps",
		"task_sla_on_time_reward_bps",
		"task_sla_late_penalty_bps",
		"task_sla_lateness_step_blocks",
	},
}

// ValidateProposal performs basic validation on a Proposal.
func ValidateProposal(p *Proposal) error {
	if p.Title == "" {
		return fmt.Errorf("proposal title cannot be empty")
	}
	if p.Description == "" {
		return fmt.Errorf("proposal description cannot be empty")
	}
	if p.Module == "" {
		return fmt.Errorf("target module cannot be empty")
	}
	if !AllowedModules[p.Module] {
		return fmt.Errorf("module %q is not a valid target module", p.Module)
	}
	if p.ParamKey == "" {
		return fmt.Errorf("param key cannot be empty")
	}
	if p.ProposedValue == "" {
		return fmt.Errorf("proposed value cannot be empty")
	}
	if p.Proposer == "" {
		return fmt.Errorf("proposer cannot be empty")
	}

	// Validate param key is allowed for the module.
	if !isValidParam(p.Module, p.ParamKey) {
		return fmt.Errorf("param %q is not valid for module %q", p.ParamKey, p.Module)
	}

	return nil
}

// ValidateVoteOption checks if the vote option is valid.
func ValidateVoteOption(option string) error {
	switch option {
	case VoteOptionYes, VoteOptionNo, VoteOptionAbstain, VoteOptionNoWithVeto:
		return nil
	default:
		return fmt.Errorf("invalid vote option %q, must be one of: yes, no, abstain, no_with_veto", option)
	}
}

func isValidParam(module, paramKey string) bool {
	params, ok := AllowedParams[module]
	if !ok {
		return false
	}
	for _, p := range params {
		if p == paramKey {
			return true
		}
	}
	return false
}
