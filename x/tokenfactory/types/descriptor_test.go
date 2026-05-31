package types_test

import (
	"testing"

	"github.com/cosmos/cosmos-sdk/codec/unknownproto"
	gogoproto "github.com/cosmos/gogoproto/proto"

	"clawchain/x/tokenfactory/types"
)

// descriptorIface mirrors the unexported interface the cosmos-sdk tx decoder
// asserts on: every Msg must expose Descriptor() so unknownproto can map field
// tags to types. Before descriptor.go existed, decoding these messages failed
// with "<T> does not have a Descriptor() method".
type descriptorIface interface {
	Descriptor() ([]byte, []int)
}

// TestMsgsHaveDescriptor asserts every tokenfactory Msg type exposes a
// Descriptor() method returning the shared gzipped FileDescriptorProto bytes.
func TestMsgsHaveDescriptor(t *testing.T) {
	msgs := []gogoproto.Message{
		&types.MsgCreateDenom{},
		&types.MsgCreateDenomResponse{},
		&types.MsgMint{},
		&types.MsgMintResponse{},
		&types.MsgBurn{},
		&types.MsgBurnResponse{},
		&types.MsgSetBeforeSendHook{},
		&types.MsgSetBeforeSendHookResponse{},
	}
	for _, m := range msgs {
		d, ok := m.(descriptorIface)
		if !ok {
			t.Fatalf("%T does not implement Descriptor()", m)
		}
		raw, path := d.Descriptor()
		if len(raw) == 0 {
			t.Fatalf("%T returned empty descriptor bytes", m)
		}
		if len(path) != 1 {
			t.Fatalf("%T returned unexpected message path %v", m, path)
		}
	}
}

// TestRejectUnknownFieldsAcceptsValidMsg exercises the exact decode-time check
// (codec/unknownproto.RejectUnknownFields) that rejected these messages before
// the descriptor was added. MsgMint is the strictest case because field 2 is a
// cosmos.base.v1beta1.Coin submessage, so the checker must resolve the nested
// descriptor too.
func TestRejectUnknownFieldsAcceptsValidMsg(t *testing.T) {
	msg := &types.MsgMint{
		Sender:        "claw1mintersender000000000000000000000000",
		Amount:        &types.ProtoCoin{Denom: "factory/claw1.../demo", Amount: "1000000"},
		MintToAddress: "claw1recipient0000000000000000000000000000",
	}
	bz, err := msg.Marshal()
	if err != nil {
		t.Fatalf("marshal MsgMint: %v", err)
	}

	// nil AnyResolver is fine: MsgMint contains no google.protobuf.Any fields.
	hasUnknownNonCriticals, err := unknownproto.RejectUnknownFields(bz, &types.MsgMint{}, false, nil)
	if err != nil {
		t.Fatalf("RejectUnknownFields rejected a valid MsgMint: %v", err)
	}
	if hasUnknownNonCriticals {
		t.Fatalf("valid MsgMint unexpectedly reported unknown non-critical fields")
	}
}
