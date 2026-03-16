package types

import errorsmod "cosmossdk.io/errors"

var (
	ErrInvalidSigner    = errorsmod.Register(ModuleName, 1100, "invalid authority signer")
	ErrSelfRating       = errorsmod.Register(ModuleName, 1101, "self-rating is not allowed")
	ErrSelfEndorsement  = errorsmod.Register(ModuleName, 1102, "self-endorsement is not allowed")
	ErrInvalidScore     = errorsmod.Register(ModuleName, 1103, "invalid rating score")
	ErrNoPurchase       = errorsmod.Register(ModuleName, 1104, "rating requires a prior purchase")
	ErrCommentTooLong   = errorsmod.Register(ModuleName, 1105, "comment exceeds maximum length")
	ErrEndorserNotAgent = errorsmod.Register(ModuleName, 1106, "endorser must be a registered agent")
)
