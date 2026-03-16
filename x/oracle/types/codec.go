package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
)

// RegisterCodec registers the oracle module's types on the legacy amino codec.
func RegisterCodec(_ *codec.LegacyAmino) {
	// No amino-registered messages for now.
}

// RegisterInterfaces registers the oracle module's interface types.
func RegisterInterfaces(_ codectypes.InterfaceRegistry) {
	// No gRPC msg/query services to register yet — oracle uses
	// hand-rolled REST/query handlers through the keeper directly.
}
