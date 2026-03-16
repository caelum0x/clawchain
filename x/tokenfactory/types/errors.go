package types

import (
	"cosmossdk.io/errors"
)

// x/tokenfactory module sentinel errors
var (
	ErrUnauthorized       = errors.Register(ModuleName, 1200, "unauthorized: sender is not the denom admin")
	ErrDenomAlreadyExists = errors.Register(ModuleName, 1201, "denom already exists")
	ErrDenomNotFound      = errors.Register(ModuleName, 1202, "denom not found in tokenfactory registry")
	ErrInvalidDenom       = errors.Register(ModuleName, 1203, "invalid denom format")
	ErrInvalidSubdenom    = errors.Register(ModuleName, 1204, "invalid subdenom")
	ErrInvalidAddress     = errors.Register(ModuleName, 1205, "invalid address")
	ErrInvalidCoin        = errors.Register(ModuleName, 1206, "invalid coin")
)
