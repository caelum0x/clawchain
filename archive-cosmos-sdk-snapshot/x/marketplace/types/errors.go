package types

import (
	"cosmossdk.io/errors"
)

var (
	ErrInvalidSigner     = errors.Register(ModuleName, 1200, "expected gov account as only signer for proposal message")
	ErrInvalidAddress    = errors.Register(ModuleName, 1201, "invalid address")
	ErrSkillNotFound     = errors.Register(ModuleName, 1202, "skill not found")
	ErrNotSkillOwner     = errors.Register(ModuleName, 1203, "not the skill owner")
	ErrSkillInactive     = errors.Register(ModuleName, 1204, "skill is inactive")
	ErrSelfPurchase      = errors.Register(ModuleName, 1205, "cannot purchase own skill")
	ErrEmptyName         = errors.Register(ModuleName, 1206, "skill name cannot be empty")
	ErrEmptyDescription  = errors.Register(ModuleName, 1207, "skill description cannot be empty")
	ErrInvalidPrice      = errors.Register(ModuleName, 1208, "invalid skill price")
	ErrTooManySkills     = errors.Register(ModuleName, 1209, "maximum skills per agent exceeded")
	ErrInsufficientFunds = errors.Register(ModuleName, 1210, "insufficient funds to purchase skill")
	ErrEscrowNotFound    = errors.Register(ModuleName, 1211, "escrow not found")
	ErrDisputeNotFound   = errors.Register(ModuleName, 1212, "dispute not found")
	ErrNotEscrowParty    = errors.Register(ModuleName, 1213, "not an escrow party")
	ErrEscrowNotActive   = errors.Register(ModuleName, 1214, "escrow is not active")
	ErrEscrowExpired     = errors.Register(ModuleName, 1215, "escrow has expired")
	ErrInvalidDeadline   = errors.Register(ModuleName, 1216, "invalid escrow deadline")
	ErrInvalidMilestones = errors.Register(ModuleName, 1217, "invalid escrow milestones")
	ErrMilestoneComplete = errors.Register(ModuleName, 1218, "all milestones already completed")
	ErrDisputeOpen       = errors.Register(ModuleName, 1219, "dispute already open")
	ErrInvalidResolution = errors.Register(ModuleName, 1220, "invalid dispute resolution target")
	ErrEmptyReason       = errors.Register(ModuleName, 1221, "reason cannot be empty")
)
