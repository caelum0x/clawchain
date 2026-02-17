package types

// DONTCOVER

import (
	"cosmossdk.io/errors"
)

// x/agent module sentinel errors
var (
	ErrInvalidSigner       = errors.Register(ModuleName, 1100, "expected gov account as only signer for proposal message")
	ErrAgentAlreadyExists  = errors.Register(ModuleName, 1101, "agent already registered")
	ErrAgentNotFound       = errors.Register(ModuleName, 1102, "agent not found")
	ErrUnsupportedAction   = errors.Register(ModuleName, 1103, "unsupported action type")
	ErrInvalidAddress      = errors.Register(ModuleName, 1104, "invalid address")
	ErrInvalidAgentName    = errors.Register(ModuleName, 1105, "invalid agent name")
	ErrInvalidPubkey       = errors.Register(ModuleName, 1106, "invalid pubkey")
)
