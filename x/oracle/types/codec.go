package types

import (
	"github.com/cosmos/cosmos-sdk/codec"
	cdctypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/msgservice"
)

// RegisterCodec registers the oracle module's types on the legacy amino codec.
func RegisterCodec(cdc *codec.LegacyAmino) {
	cdc.RegisterConcrete(&MsgDelegateFeeder{}, "clawchain/oracle/MsgDelegateFeeder", nil)
	cdc.RegisterConcrete(&MsgAggregateExchangeRatePrevote{}, "clawchain/oracle/MsgAggregateExchangeRatePrevote", nil)
	cdc.RegisterConcrete(&MsgAggregateExchangeRateVote{}, "clawchain/oracle/MsgAggregateExchangeRateVote", nil)
	cdc.RegisterConcrete(&MsgUpdateOracleParams{}, "clawchain/oracle/MsgUpdateOracleParams", nil)
}

// RegisterInterfaces registers the oracle module's interface types.
func RegisterInterfaces(registry cdctypes.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgDelegateFeeder{},
		&MsgAggregateExchangeRatePrevote{},
		&MsgAggregateExchangeRateVote{},
		&MsgUpdateOracleParams{},
	)
	msgservice.RegisterMsgServiceDesc(registry, &_Msg_serviceDesc)
}
