package tokenfactory

import (
	"context"
	"encoding/json"
	"fmt"

	"cosmossdk.io/core/appmodule"
	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/module"
	"github.com/grpc-ecosystem/grpc-gateway/runtime"
	"google.golang.org/grpc"

	"clawchain/x/tokenfactory/keeper"
	"clawchain/x/tokenfactory/types"
)

var (
	_ module.AppModuleBasic = (*AppModule)(nil)
	_ module.AppModule      = (*AppModule)(nil)
	_ module.HasGenesis     = (*AppModule)(nil)

	_ appmodule.AppModule = (*AppModule)(nil)
)

// AppModule implements the AppModule interface for the tokenfactory module.
type AppModule struct {
	cdc    codec.Codec
	keeper keeper.Keeper
}

func NewAppModule(
	cdc codec.Codec,
	keeper keeper.Keeper,
) AppModule {
	return AppModule{
		cdc:    cdc,
		keeper: keeper,
	}
}

// IsAppModule implements the appmodule.AppModule interface.
func (AppModule) IsAppModule() {}

// Name returns the name of the module as a string.
func (AppModule) Name() string {
	return types.ModuleName
}

// RegisterLegacyAminoCodec registers the amino codec.
func (AppModule) RegisterLegacyAminoCodec(*codec.LegacyAmino) {}

// RegisterGRPCGatewayRoutes registers the gRPC Gateway routes for the module.
// The tokenfactory module has no gRPC queries, so this is a no-op.
func (AppModule) RegisterGRPCGatewayRoutes(_ client.Context, _ *runtime.ServeMux) {}

// RegisterInterfaces registers the module's interface types and their concrete
// implementations. This is critical for wasmd's UnpackAny to resolve the
// Osmosis tokenfactory message types.
func (AppModule) RegisterInterfaces(registrar codectypes.InterfaceRegistry) {
	types.RegisterInterfaces(registrar)
}

// RegisterServices registers the module's gRPC services.
// We register a custom message handler instead of a protoc-generated service
// since our messages use Osmosis type URLs.
func (am AppModule) RegisterServices(registrar grpc.ServiceRegistrar) error {
	// The tokenfactory messages are dispatched via Stargate message routing
	// (type URL resolution), not via a gRPC service descriptor.
	// The MsgServer is invoked by the Cosmos SDK's baseapp router after
	// UnpackAny resolves our registered type URLs.
	//
	// Register directly on the gRPC ServiceRegistrar (the baseapp MsgServiceRouter
	// in depinject apps). The previous code type-asserted to module.Configurator,
	// which is NOT the type the runtime passes here, so the assertion silently
	// failed and NO message handlers were registered — every tokenfactory tx was
	// rejected with "no message handler found".
	registrar.RegisterService(&_TokenFactory_serviceDesc, keeper.NewMsgServerImpl(am.keeper))
	return nil
}

// _TokenFactory_serviceDesc is a hand-crafted gRPC service descriptor that
// maps the Osmosis tokenfactory type URLs to our MsgServer methods.
var _TokenFactory_serviceDesc = grpc.ServiceDesc{
	ServiceName: "osmosis.tokenfactory.v1beta1.Msg",
	HandlerType: (*TokenFactoryMsgServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "CreateDenom",
			Handler:    _TokenFactory_CreateDenom_Handler,
		},
		{
			MethodName: "Mint",
			Handler:    _TokenFactory_Mint_Handler,
		},
		{
			MethodName: "Burn",
			Handler:    _TokenFactory_Burn_Handler,
		},
		{
			MethodName: "SetBeforeSendHook",
			Handler:    _TokenFactory_SetBeforeSendHook_Handler,
		},
	},
	Streams: []grpc.StreamDesc{},
}

// TokenFactoryMsgServer defines the server API for the tokenfactory module.
type TokenFactoryMsgServer interface {
	CreateDenom(context.Context, *types.MsgCreateDenom) (*types.MsgCreateDenomResponse, error)
	Mint(context.Context, *types.MsgMint) (*types.MsgMintResponse, error)
	Burn(context.Context, *types.MsgBurn) (*types.MsgBurnResponse, error)
	SetBeforeSendHook(context.Context, *types.MsgSetBeforeSendHook) (*types.MsgSetBeforeSendHookResponse, error)
}

func _TokenFactory_CreateDenom_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(types.MsgCreateDenom)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(TokenFactoryMsgServer).CreateDenom(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/osmosis.tokenfactory.v1beta1.Msg/CreateDenom",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(TokenFactoryMsgServer).CreateDenom(ctx, req.(*types.MsgCreateDenom))
	}
	return interceptor(ctx, in, info, handler)
}

func _TokenFactory_Mint_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(types.MsgMint)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(TokenFactoryMsgServer).Mint(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/osmosis.tokenfactory.v1beta1.Msg/Mint",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(TokenFactoryMsgServer).Mint(ctx, req.(*types.MsgMint))
	}
	return interceptor(ctx, in, info, handler)
}

func _TokenFactory_Burn_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(types.MsgBurn)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(TokenFactoryMsgServer).Burn(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/osmosis.tokenfactory.v1beta1.Msg/Burn",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(TokenFactoryMsgServer).Burn(ctx, req.(*types.MsgBurn))
	}
	return interceptor(ctx, in, info, handler)
}

func _TokenFactory_SetBeforeSendHook_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(types.MsgSetBeforeSendHook)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(TokenFactoryMsgServer).SetBeforeSendHook(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/osmosis.tokenfactory.v1beta1.Msg/SetBeforeSendHook",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(TokenFactoryMsgServer).SetBeforeSendHook(ctx, req.(*types.MsgSetBeforeSendHook))
	}
	return interceptor(ctx, in, info, handler)
}

// DefaultGenesis returns a default GenesisState for the module.
func (am AppModule) DefaultGenesis(codec.JSONCodec) json.RawMessage {
	return json.RawMessage(`{}`)
}

// ValidateGenesis validates the GenesisState.
func (am AppModule) ValidateGenesis(_ codec.JSONCodec, _ client.TxEncodingConfig, bz json.RawMessage) error {
	var genState types.GenesisState
	if len(bz) > 0 && string(bz) != "{}" && string(bz) != "null" {
		if err := json.Unmarshal(bz, &genState); err != nil {
			return fmt.Errorf("failed to unmarshal %s genesis state: %w", types.ModuleName, err)
		}
	}
	return genState.Validate()
}

// InitGenesis performs the module's genesis initialization.
func (am AppModule) InitGenesis(ctx sdk.Context, _ codec.JSONCodec, gs json.RawMessage) {
	var genState types.GenesisState
	if len(gs) > 0 && string(gs) != "{}" && string(gs) != "null" {
		if err := json.Unmarshal(gs, &genState); err != nil {
			panic(fmt.Errorf("failed to unmarshal %s genesis state: %w", types.ModuleName, err))
		}
	}

	if err := am.keeper.InitGenesis(ctx, genState); err != nil {
		panic(fmt.Errorf("failed to initialize %s genesis state: %w", types.ModuleName, err))
	}
}

// ExportGenesis returns the module's exported genesis state.
func (am AppModule) ExportGenesis(ctx sdk.Context, _ codec.JSONCodec) json.RawMessage {
	genState, err := am.keeper.ExportGenesis(ctx)
	if err != nil {
		panic(fmt.Errorf("failed to export %s genesis state: %w", types.ModuleName, err))
	}

	bz, err := json.Marshal(genState)
	if err != nil {
		panic(fmt.Errorf("failed to marshal %s genesis state: %w", types.ModuleName, err))
	}

	return bz
}

// ConsensusVersion is a sequence number for state-breaking changes.
func (AppModule) ConsensusVersion() uint64 { return 1 }
