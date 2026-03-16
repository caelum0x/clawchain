package types

import (
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// RegisterInterfaces registers the tokenfactory message types with the Cosmos SDK
// interface registry. The type URLs are derived from XXX_MessageName() which returns
// the Osmosis tokenfactory names (e.g. "osmosis.tokenfactory.v1beta1.MsgCreateDenom").
// MsgTypeURL prepends "/" to get "/osmosis.tokenfactory.v1beta1.MsgCreateDenom" which
// is exactly what the Astroport DEX contracts send via Stargate messages.
func RegisterInterfaces(registrar codectypes.InterfaceRegistry) {
	registrar.RegisterImplementations((*sdk.Msg)(nil),
		&MsgCreateDenom{},
		&MsgMint{},
		&MsgBurn{},
		&MsgSetBeforeSendHook{},
	)
}
