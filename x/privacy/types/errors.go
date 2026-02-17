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
	ErrInvalidAddress       = errors.Register(ModuleName, 1109, "invalid address")
)
