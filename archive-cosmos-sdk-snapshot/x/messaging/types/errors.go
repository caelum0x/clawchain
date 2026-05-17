package types

import (
	"cosmossdk.io/errors"
)

var (
	ErrInvalidSigner     = errors.Register(ModuleName, 1100, "expected gov account as only signer for proposal message")
	ErrInvalidAddress    = errors.Register(ModuleName, 1101, "invalid address")
	ErrMessageTooLarge   = errors.Register(ModuleName, 1102, "message ciphertext exceeds max size")
	ErrEmptyCiphertext   = errors.Register(ModuleName, 1103, "ciphertext cannot be empty")
	ErrEmptyNonce        = errors.Register(ModuleName, 1104, "nonce cannot be empty")
	ErrDuplicateNonce    = errors.Register(ModuleName, 1105, "duplicate nonce: message already sent")
	ErrMessageNotFound   = errors.Register(ModuleName, 1106, "message not found")
	ErrNotRecipient      = errors.Register(ModuleName, 1107, "only the recipient can acknowledge a message")
	ErrAlreadyAcked      = errors.Register(ModuleName, 1108, "message already acknowledged")
	ErrSelfMessage       = errors.Register(ModuleName, 1109, "cannot send message to self")
)
