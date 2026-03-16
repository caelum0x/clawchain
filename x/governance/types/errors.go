package types

// DONTCOVER

import (
	"cosmossdk.io/errors"
)

// x/governance module sentinel errors
var (
	ErrInvalidProposal     = errors.Register(ModuleName, 1400, "invalid proposal")
	ErrProposalNotFound    = errors.Register(ModuleName, 1401, "proposal not found")
	ErrVotingEnded         = errors.Register(ModuleName, 1402, "voting period has ended")
	ErrAlreadyVoted        = errors.Register(ModuleName, 1403, "voter has already voted on this proposal")
	ErrInsufficientDeposit = errors.Register(ModuleName, 1404, "insufficient deposit")
	ErrInvalidModule       = errors.Register(ModuleName, 1405, "invalid target module")
	ErrInvalidParam        = errors.Register(ModuleName, 1406, "invalid parameter key for the target module")
	ErrInvalidAddress      = errors.Register(ModuleName, 1407, "invalid address")
	ErrInvalidVoteOption   = errors.Register(ModuleName, 1408, "invalid vote option")
	ErrProposalNotVoting   = errors.Register(ModuleName, 1409, "proposal is not in voting status")
	ErrExecutionFailed      = errors.Register(ModuleName, 1410, "proposal execution failed")
	ErrUnauthorizedCancel   = errors.Register(ModuleName, 1411, "unauthorized cancel")
	ErrProposalNotCancellable = errors.Register(ModuleName, 1412, "proposal is not cancellable")
)
