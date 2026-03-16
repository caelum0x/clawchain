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

	// GPU compute marketplace errors
	ErrComputeResourceNotFound = errors.Register(ModuleName, 1230, "compute resource not found")
	ErrComputeResourceInactive = errors.Register(ModuleName, 1231, "compute resource is inactive")
	ErrComputeResourceLeased   = errors.Register(ModuleName, 1232, "compute resource is currently leased")
	ErrInvalidLeaseHours       = errors.Register(ModuleName, 1233, "invalid lease hours")
	ErrLeaseNotFound           = errors.Register(ModuleName, 1234, "compute lease not found")
	ErrNotLeaseParty           = errors.Register(ModuleName, 1235, "not a party to this lease")
	ErrLeaseNotActive          = errors.Register(ModuleName, 1236, "lease is not active")
	ErrNotResourceOwner        = errors.Register(ModuleName, 1237, "not the resource owner")
	ErrResourceCurrentlyLeased = errors.Register(ModuleName, 1238, "cannot delist resource with active lease")
	ErrInvalidGpuSpec          = errors.Register(ModuleName, 1239, "invalid GPU specification")
	ErrEmptyEndpoint           = errors.Register(ModuleName, 1240, "endpoint cannot be empty")

	// GPU compute job errors
	ErrJobNotFound          = errors.Register(ModuleName, 1250, "compute job not found")
	ErrInvalidJobStatus     = errors.Register(ModuleName, 1251, "invalid job status transition")
	ErrInvalidJobType       = errors.Register(ModuleName, 1252, "invalid job type")
	ErrChallengeNotFound    = errors.Register(ModuleName, 1253, "compute challenge not found for job")
	ErrInvalidComputeProof  = errors.Register(ModuleName, 1254, "invalid compute proof: challenge response mismatch")
)
