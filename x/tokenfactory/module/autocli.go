package tokenfactory

// AutoCLIOptions is not implemented for the tokenfactory module because it uses
// hand-crafted Osmosis-compatible protobuf message types (osmosis.tokenfactory.v1beta1.*)
// rather than protobuf-generated gRPC service descriptors required by the autocli
// framework.
//
// Tokenfactory transactions (CreateDenom, Mint, Burn, SetBeforeSendHook) are
// dispatched via Cosmos SDK's baseapp Stargate message routing using the type
// URLs registered in types/msgs.go and the gRPC ServiceDesc in module.go.
//
// To interact with tokenfactory, use the clawchaind tx command with the
// appropriate message JSON or the clawd CLI wrapper.
