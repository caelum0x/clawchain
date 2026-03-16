package types

// DONTCOVER

import (
	"cosmossdk.io/errors"
)

// x/privacy module sentinel errors
var (
	ErrInvalidSigner        = errors.Register(ModuleName, 1100, "expected gov account as only signer for proposal message")
	ErrNullifierAlreadyUsed = errors.Register(ModuleName, 1101, "nullifier has already been used (double-spend)")
	ErrInvalidMerkleRoot    = errors.Register(ModuleName, 1102, "merkle root is not recognized")
	ErrInvalidProof         = errors.Register(ModuleName, 1103, "zero-knowledge proof verification failed")
	ErrInsufficientFunds    = errors.Register(ModuleName, 1104, "insufficient funds for shielding")
	ErrInvalidCommitment    = errors.Register(ModuleName, 1105, "invalid commitment data")
	ErrMerkleTreeFull       = errors.Register(ModuleName, 1106, "merkle tree is full")
	ErrInvalidAmount        = errors.Register(ModuleName, 1107, "invalid amount")
	ErrDeserializeProof     = errors.Register(ModuleName, 1108, "failed to deserialize proof")
	ErrInvalidAddress        = errors.Register(ModuleName, 1109, "invalid address")
	ErrViewKeyAlreadyExists  = errors.Register(ModuleName, 1110, "view key already exists for this commitment")
	ErrViewKeyNotFound       = errors.Register(ModuleName, 1111, "view key not found")
	ErrInvalidViewKeyProof   = errors.Register(ModuleName, 1112, "view key proof verification failed")
	ErrInvalidBlinding       = errors.Register(ModuleName, 1113, "invalid blinding factor")
	ErrRateLimitExceeded     = errors.Register(ModuleName, 1114, "privacy transaction rate limit exceeded for this block")
	ErrBelowMinShieldAmount  = errors.Register(ModuleName, 1115, "amount below minimum shield threshold")
)
