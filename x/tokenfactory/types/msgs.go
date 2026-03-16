package types

import (
	"fmt"
	"io"
	"regexp"

	proto "github.com/cosmos/gogoproto/proto"

	sdk "github.com/cosmos/cosmos-sdk/types"
)

// Compile-time checks that our messages implement the required interfaces.
var (
	_ sdk.Msg       = &MsgCreateDenom{}
	_ proto.Message = &MsgCreateDenom{}

	_ sdk.Msg       = &MsgMint{}
	_ proto.Message = &MsgMint{}

	_ sdk.Msg       = &MsgBurn{}
	_ proto.Message = &MsgBurn{}

	_ sdk.Msg       = &MsgSetBeforeSendHook{}
	_ proto.Message = &MsgSetBeforeSendHook{}
)

// validSubdenom matches 1-128 characters: alphanumeric plus / and _ (Osmosis convention).
// Astroport uses subdenoms like "astroport/share" which include /.
var validSubdenom = regexp.MustCompile(`^[a-zA-Z0-9/_]{1,128}$`)

// FormatDenom returns the canonical factory denom: factory/{creator}/{subdenom}.
func FormatDenom(creator, subdenom string) string {
	return fmt.Sprintf("%s/%s/%s", DenomPrefix, creator, subdenom)
}

// =====================================================
// ProtoCoin mirrors cosmos.base.v1beta1.Coin in proto wire format.
// tag 1 = denom (string), tag 2 = amount (string).
// This is needed because MsgMint and MsgBurn embed a Coin submessage.
// =====================================================

type ProtoCoin struct {
	Denom  string
	Amount string
}

func (c *ProtoCoin) Size() int {
	n := 0
	if len(c.Denom) > 0 {
		n += 1 + sovTF(uint64(len(c.Denom))) + len(c.Denom)
	}
	if len(c.Amount) > 0 {
		n += 1 + sovTF(uint64(len(c.Amount))) + len(c.Amount)
	}
	return n
}

func (c *ProtoCoin) MarshalToSizedBuffer(dAtA []byte) (int, error) {
	i := len(dAtA)
	if len(c.Amount) > 0 {
		i -= len(c.Amount)
		copy(dAtA[i:], c.Amount)
		i = encodeVarintTF(dAtA, i, uint64(len(c.Amount)))
		i--
		dAtA[i] = 0x12 // field 2, wire type 2
	}
	if len(c.Denom) > 0 {
		i -= len(c.Denom)
		copy(dAtA[i:], c.Denom)
		i = encodeVarintTF(dAtA, i, uint64(len(c.Denom)))
		i--
		dAtA[i] = 0x0a // field 1, wire type 2
	}
	return len(dAtA) - i, nil
}

func (c *ProtoCoin) Unmarshal(dAtA []byte) error {
	l := len(dAtA)
	iNdEx := 0
	for iNdEx < l {
		preIndex := iNdEx
		var wire uint64
		for shift := uint(0); ; shift += 7 {
			if shift >= 64 {
				return errIntOverflow
			}
			if iNdEx >= l {
				return io.ErrUnexpectedEOF
			}
			b := dAtA[iNdEx]
			iNdEx++
			wire |= uint64(b&0x7F) << shift
			if b < 0x80 {
				break
			}
		}
		fieldNum := int32(wire >> 3)
		wireType := int(wire & 0x7)
		switch fieldNum {
		case 1: // denom
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field Denom", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			c.Denom = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		case 2: // amount
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field Amount", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			c.Amount = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		default:
			iNdEx = preIndex
			skippy, err := skipTF(dAtA[iNdEx:])
			if err != nil {
				return err
			}
			if skippy < 0 || (iNdEx+skippy) < 0 || (iNdEx+skippy) > l {
				return io.ErrUnexpectedEOF
			}
			iNdEx += skippy
		}
	}
	if iNdEx > l {
		return io.ErrUnexpectedEOF
	}
	return nil
}

// =====================================================
// MsgCreateDenom
// Proto: osmosis.tokenfactory.v1beta1.MsgCreateDenom
// Fields: tag 1 = sender (string), tag 2 = subdenom (string)
// =====================================================

type MsgCreateDenom struct {
	Sender   string `json:"sender"`
	Subdenom string `json:"subdenom"`
}

func (m *MsgCreateDenom) Reset()         { *m = MsgCreateDenom{} }
func (m *MsgCreateDenom) String() string { return proto.CompactTextString(m) }
func (m *MsgCreateDenom) ProtoMessage()  {}
func (m *MsgCreateDenom) XXX_MessageName() string {
	return "osmosis.tokenfactory.v1beta1.MsgCreateDenom"
}

func (m *MsgCreateDenom) Marshal() (dAtA []byte, err error) {
	size := m.Size()
	dAtA = make([]byte, size)
	n, err := m.MarshalToSizedBuffer(dAtA[:size])
	if err != nil {
		return nil, err
	}
	return dAtA[:n], nil
}

func (m *MsgCreateDenom) MarshalTo(dAtA []byte) (int, error) {
	size := m.Size()
	return m.MarshalToSizedBuffer(dAtA[:size])
}

func (m *MsgCreateDenom) MarshalToSizedBuffer(dAtA []byte) (int, error) {
	i := len(dAtA)
	if len(m.Subdenom) > 0 {
		i -= len(m.Subdenom)
		copy(dAtA[i:], m.Subdenom)
		i = encodeVarintTF(dAtA, i, uint64(len(m.Subdenom)))
		i--
		dAtA[i] = 0x12 // field 2, wire type 2
	}
	if len(m.Sender) > 0 {
		i -= len(m.Sender)
		copy(dAtA[i:], m.Sender)
		i = encodeVarintTF(dAtA, i, uint64(len(m.Sender)))
		i--
		dAtA[i] = 0x0a // field 1, wire type 2
	}
	return len(dAtA) - i, nil
}

func (m *MsgCreateDenom) Size() int {
	if m == nil {
		return 0
	}
	n := 0
	if len(m.Sender) > 0 {
		n += 1 + sovTF(uint64(len(m.Sender))) + len(m.Sender)
	}
	if len(m.Subdenom) > 0 {
		n += 1 + sovTF(uint64(len(m.Subdenom))) + len(m.Subdenom)
	}
	return n
}

func (m *MsgCreateDenom) Unmarshal(dAtA []byte) error {
	l := len(dAtA)
	iNdEx := 0
	for iNdEx < l {
		preIndex := iNdEx
		var wire uint64
		for shift := uint(0); ; shift += 7 {
			if shift >= 64 {
				return errIntOverflow
			}
			if iNdEx >= l {
				return io.ErrUnexpectedEOF
			}
			b := dAtA[iNdEx]
			iNdEx++
			wire |= uint64(b&0x7F) << shift
			if b < 0x80 {
				break
			}
		}
		fieldNum := int32(wire >> 3)
		wireType := int(wire & 0x7)
		switch fieldNum {
		case 1: // sender
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field Sender", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			m.Sender = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		case 2: // subdenom
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field Subdenom", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			m.Subdenom = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		default:
			iNdEx = preIndex
			skippy, err := skipTF(dAtA[iNdEx:])
			if err != nil {
				return err
			}
			if skippy < 0 || (iNdEx+skippy) < 0 || (iNdEx+skippy) > l {
				return io.ErrUnexpectedEOF
			}
			iNdEx += skippy
		}
	}
	if iNdEx > l {
		return io.ErrUnexpectedEOF
	}
	return nil
}

// =====================================================
// MsgCreateDenomResponse
// Proto: osmosis.tokenfactory.v1beta1.MsgCreateDenomResponse
// Fields: tag 1 = new_token_denom (string)
// =====================================================

type MsgCreateDenomResponse struct {
	NewTokenDenom string `json:"new_token_denom"`
}

func (m *MsgCreateDenomResponse) Reset()         { *m = MsgCreateDenomResponse{} }
func (m *MsgCreateDenomResponse) String() string { return proto.CompactTextString(m) }
func (m *MsgCreateDenomResponse) ProtoMessage()  {}
func (m *MsgCreateDenomResponse) XXX_MessageName() string {
	return "osmosis.tokenfactory.v1beta1.MsgCreateDenomResponse"
}

func (m *MsgCreateDenomResponse) Marshal() (dAtA []byte, err error) {
	size := m.Size()
	dAtA = make([]byte, size)
	n, err := m.MarshalToSizedBuffer(dAtA[:size])
	if err != nil {
		return nil, err
	}
	return dAtA[:n], nil
}

func (m *MsgCreateDenomResponse) MarshalTo(dAtA []byte) (int, error) {
	size := m.Size()
	return m.MarshalToSizedBuffer(dAtA[:size])
}

func (m *MsgCreateDenomResponse) MarshalToSizedBuffer(dAtA []byte) (int, error) {
	i := len(dAtA)
	if len(m.NewTokenDenom) > 0 {
		i -= len(m.NewTokenDenom)
		copy(dAtA[i:], m.NewTokenDenom)
		i = encodeVarintTF(dAtA, i, uint64(len(m.NewTokenDenom)))
		i--
		dAtA[i] = 0x0a // field 1, wire type 2
	}
	return len(dAtA) - i, nil
}

func (m *MsgCreateDenomResponse) Size() int {
	if m == nil {
		return 0
	}
	n := 0
	if len(m.NewTokenDenom) > 0 {
		n += 1 + sovTF(uint64(len(m.NewTokenDenom))) + len(m.NewTokenDenom)
	}
	return n
}

func (m *MsgCreateDenomResponse) Unmarshal(dAtA []byte) error {
	l := len(dAtA)
	iNdEx := 0
	for iNdEx < l {
		preIndex := iNdEx
		var wire uint64
		for shift := uint(0); ; shift += 7 {
			if shift >= 64 {
				return errIntOverflow
			}
			if iNdEx >= l {
				return io.ErrUnexpectedEOF
			}
			b := dAtA[iNdEx]
			iNdEx++
			wire |= uint64(b&0x7F) << shift
			if b < 0x80 {
				break
			}
		}
		fieldNum := int32(wire >> 3)
		wireType := int(wire & 0x7)
		switch fieldNum {
		case 1: // new_token_denom
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field NewTokenDenom", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			m.NewTokenDenom = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		default:
			iNdEx = preIndex
			skippy, err := skipTF(dAtA[iNdEx:])
			if err != nil {
				return err
			}
			if skippy < 0 || (iNdEx+skippy) < 0 || (iNdEx+skippy) > l {
				return io.ErrUnexpectedEOF
			}
			iNdEx += skippy
		}
	}
	if iNdEx > l {
		return io.ErrUnexpectedEOF
	}
	return nil
}

// =====================================================
// MsgMint
// Proto: osmosis.tokenfactory.v1beta1.MsgMint
// Fields: tag 1 = sender (string), tag 2 = amount (Coin message),
//
//	tag 3 = mint_to_address (string)
//
// =====================================================

type MsgMint struct {
	Sender         string     `json:"sender"`
	Amount         *ProtoCoin `json:"amount,omitempty"`
	MintToAddress  string     `json:"mint_to_address"`
}

func (m *MsgMint) Reset()                            { *m = MsgMint{} }
func (m *MsgMint) String() string                    { return proto.CompactTextString(m) }
func (m *MsgMint) ProtoMessage()                     {}
func (m *MsgMint) XXX_MessageName() string {
	return "osmosis.tokenfactory.v1beta1.MsgMint"
}

func (m *MsgMint) Marshal() (dAtA []byte, err error) {
	size := m.Size()
	dAtA = make([]byte, size)
	n, err := m.MarshalToSizedBuffer(dAtA[:size])
	if err != nil {
		return nil, err
	}
	return dAtA[:n], nil
}

func (m *MsgMint) MarshalTo(dAtA []byte) (int, error) {
	size := m.Size()
	return m.MarshalToSizedBuffer(dAtA[:size])
}

func (m *MsgMint) MarshalToSizedBuffer(dAtA []byte) (int, error) {
	i := len(dAtA)
	if len(m.MintToAddress) > 0 {
		i -= len(m.MintToAddress)
		copy(dAtA[i:], m.MintToAddress)
		i = encodeVarintTF(dAtA, i, uint64(len(m.MintToAddress)))
		i--
		dAtA[i] = 0x1a // field 3, wire type 2
	}
	if m.Amount != nil {
		{
			size, err := m.Amount.MarshalToSizedBuffer(dAtA[:i])
			if err != nil {
				return 0, err
			}
			i -= size
			i = encodeVarintTF(dAtA, i, uint64(size))
		}
		i--
		dAtA[i] = 0x12 // field 2, wire type 2
	}
	if len(m.Sender) > 0 {
		i -= len(m.Sender)
		copy(dAtA[i:], m.Sender)
		i = encodeVarintTF(dAtA, i, uint64(len(m.Sender)))
		i--
		dAtA[i] = 0x0a // field 1, wire type 2
	}
	return len(dAtA) - i, nil
}

func (m *MsgMint) Size() int {
	if m == nil {
		return 0
	}
	n := 0
	if len(m.Sender) > 0 {
		n += 1 + sovTF(uint64(len(m.Sender))) + len(m.Sender)
	}
	if m.Amount != nil {
		s := m.Amount.Size()
		n += 1 + sovTF(uint64(s)) + s
	}
	if len(m.MintToAddress) > 0 {
		n += 1 + sovTF(uint64(len(m.MintToAddress))) + len(m.MintToAddress)
	}
	return n
}

func (m *MsgMint) Unmarshal(dAtA []byte) error {
	l := len(dAtA)
	iNdEx := 0
	for iNdEx < l {
		preIndex := iNdEx
		var wire uint64
		for shift := uint(0); ; shift += 7 {
			if shift >= 64 {
				return errIntOverflow
			}
			if iNdEx >= l {
				return io.ErrUnexpectedEOF
			}
			b := dAtA[iNdEx]
			iNdEx++
			wire |= uint64(b&0x7F) << shift
			if b < 0x80 {
				break
			}
		}
		fieldNum := int32(wire >> 3)
		wireType := int(wire & 0x7)
		switch fieldNum {
		case 1: // sender
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field Sender", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			m.Sender = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		case 2: // amount (Coin submessage)
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field Amount", wireType)
			}
			var msgLen int
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				msgLen |= int(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			if msgLen < 0 || (iNdEx+msgLen) > l {
				return io.ErrUnexpectedEOF
			}
			if m.Amount == nil {
				m.Amount = &ProtoCoin{}
			}
			if err := m.Amount.Unmarshal(dAtA[iNdEx : iNdEx+msgLen]); err != nil {
				return err
			}
			iNdEx += msgLen
		case 3: // mint_to_address
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field MintToAddress", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			m.MintToAddress = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		default:
			iNdEx = preIndex
			skippy, err := skipTF(dAtA[iNdEx:])
			if err != nil {
				return err
			}
			if skippy < 0 || (iNdEx+skippy) < 0 || (iNdEx+skippy) > l {
				return io.ErrUnexpectedEOF
			}
			iNdEx += skippy
		}
	}
	if iNdEx > l {
		return io.ErrUnexpectedEOF
	}
	return nil
}

// MsgMintResponse is the response for MsgMint.
type MsgMintResponse struct{}

func (m *MsgMintResponse) Reset()         { *m = MsgMintResponse{} }
func (m *MsgMintResponse) String() string { return "MsgMintResponse{}" }
func (m *MsgMintResponse) ProtoMessage()  {}
func (m *MsgMintResponse) XXX_MessageName() string {
	return "osmosis.tokenfactory.v1beta1.MsgMintResponse"
}
func (m *MsgMintResponse) Marshal() ([]byte, error)    { return []byte{}, nil }
func (m *MsgMintResponse) MarshalTo(dAtA []byte) (int, error) { return 0, nil }
func (m *MsgMintResponse) Size() int                   { return 0 }
func (m *MsgMintResponse) Unmarshal([]byte) error       { return nil }

// =====================================================
// MsgBurn
// Proto: osmosis.tokenfactory.v1beta1.MsgBurn
// Fields: tag 1 = sender (string), tag 2 = amount (Coin message),
//
//	tag 3 = burn_from_address (string)
//
// =====================================================

type MsgBurn struct {
	Sender          string     `json:"sender"`
	Amount          *ProtoCoin `json:"amount,omitempty"`
	BurnFromAddress string     `json:"burn_from_address"`
}

func (m *MsgBurn) Reset()                            { *m = MsgBurn{} }
func (m *MsgBurn) String() string                    { return proto.CompactTextString(m) }
func (m *MsgBurn) ProtoMessage()                     {}
func (m *MsgBurn) XXX_MessageName() string {
	return "osmosis.tokenfactory.v1beta1.MsgBurn"
}

func (m *MsgBurn) Marshal() (dAtA []byte, err error) {
	size := m.Size()
	dAtA = make([]byte, size)
	n, err := m.MarshalToSizedBuffer(dAtA[:size])
	if err != nil {
		return nil, err
	}
	return dAtA[:n], nil
}

func (m *MsgBurn) MarshalTo(dAtA []byte) (int, error) {
	size := m.Size()
	return m.MarshalToSizedBuffer(dAtA[:size])
}

func (m *MsgBurn) MarshalToSizedBuffer(dAtA []byte) (int, error) {
	i := len(dAtA)
	if len(m.BurnFromAddress) > 0 {
		i -= len(m.BurnFromAddress)
		copy(dAtA[i:], m.BurnFromAddress)
		i = encodeVarintTF(dAtA, i, uint64(len(m.BurnFromAddress)))
		i--
		dAtA[i] = 0x1a // field 3, wire type 2
	}
	if m.Amount != nil {
		{
			size, err := m.Amount.MarshalToSizedBuffer(dAtA[:i])
			if err != nil {
				return 0, err
			}
			i -= size
			i = encodeVarintTF(dAtA, i, uint64(size))
		}
		i--
		dAtA[i] = 0x12 // field 2, wire type 2
	}
	if len(m.Sender) > 0 {
		i -= len(m.Sender)
		copy(dAtA[i:], m.Sender)
		i = encodeVarintTF(dAtA, i, uint64(len(m.Sender)))
		i--
		dAtA[i] = 0x0a // field 1, wire type 2
	}
	return len(dAtA) - i, nil
}

func (m *MsgBurn) Size() int {
	if m == nil {
		return 0
	}
	n := 0
	if len(m.Sender) > 0 {
		n += 1 + sovTF(uint64(len(m.Sender))) + len(m.Sender)
	}
	if m.Amount != nil {
		s := m.Amount.Size()
		n += 1 + sovTF(uint64(s)) + s
	}
	if len(m.BurnFromAddress) > 0 {
		n += 1 + sovTF(uint64(len(m.BurnFromAddress))) + len(m.BurnFromAddress)
	}
	return n
}

func (m *MsgBurn) Unmarshal(dAtA []byte) error {
	l := len(dAtA)
	iNdEx := 0
	for iNdEx < l {
		preIndex := iNdEx
		var wire uint64
		for shift := uint(0); ; shift += 7 {
			if shift >= 64 {
				return errIntOverflow
			}
			if iNdEx >= l {
				return io.ErrUnexpectedEOF
			}
			b := dAtA[iNdEx]
			iNdEx++
			wire |= uint64(b&0x7F) << shift
			if b < 0x80 {
				break
			}
		}
		fieldNum := int32(wire >> 3)
		wireType := int(wire & 0x7)
		switch fieldNum {
		case 1: // sender
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field Sender", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			m.Sender = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		case 2: // amount (Coin submessage)
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field Amount", wireType)
			}
			var msgLen int
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				msgLen |= int(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			if msgLen < 0 || (iNdEx+msgLen) > l {
				return io.ErrUnexpectedEOF
			}
			if m.Amount == nil {
				m.Amount = &ProtoCoin{}
			}
			if err := m.Amount.Unmarshal(dAtA[iNdEx : iNdEx+msgLen]); err != nil {
				return err
			}
			iNdEx += msgLen
		case 3: // burn_from_address
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field BurnFromAddress", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			m.BurnFromAddress = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		default:
			iNdEx = preIndex
			skippy, err := skipTF(dAtA[iNdEx:])
			if err != nil {
				return err
			}
			if skippy < 0 || (iNdEx+skippy) < 0 || (iNdEx+skippy) > l {
				return io.ErrUnexpectedEOF
			}
			iNdEx += skippy
		}
	}
	if iNdEx > l {
		return io.ErrUnexpectedEOF
	}
	return nil
}

// MsgBurnResponse is the response for MsgBurn.
type MsgBurnResponse struct{}

func (m *MsgBurnResponse) Reset()         { *m = MsgBurnResponse{} }
func (m *MsgBurnResponse) String() string { return "MsgBurnResponse{}" }
func (m *MsgBurnResponse) ProtoMessage()  {}
func (m *MsgBurnResponse) XXX_MessageName() string {
	return "osmosis.tokenfactory.v1beta1.MsgBurnResponse"
}
func (m *MsgBurnResponse) Marshal() ([]byte, error)    { return []byte{}, nil }
func (m *MsgBurnResponse) MarshalTo(dAtA []byte) (int, error) { return 0, nil }
func (m *MsgBurnResponse) Size() int                   { return 0 }
func (m *MsgBurnResponse) Unmarshal([]byte) error       { return nil }

// =====================================================
// MsgSetBeforeSendHook
// Proto: osmosis.tokenfactory.v1beta1.MsgSetBeforeSendHook
// Fields: tag 1 = sender (string), tag 2 = denom (string),
//
//	tag 3 = cosmwasm_address (string)
//
// =====================================================

type MsgSetBeforeSendHook struct {
	Sender          string `json:"sender"`
	Denom           string `json:"denom"`
	CosmwasmAddress string `json:"cosmwasm_address"`
}

func (m *MsgSetBeforeSendHook) Reset()         { *m = MsgSetBeforeSendHook{} }
func (m *MsgSetBeforeSendHook) String() string { return proto.CompactTextString(m) }
func (m *MsgSetBeforeSendHook) ProtoMessage()  {}
func (m *MsgSetBeforeSendHook) XXX_MessageName() string {
	return "osmosis.tokenfactory.v1beta1.MsgSetBeforeSendHook"
}

func (m *MsgSetBeforeSendHook) Marshal() (dAtA []byte, err error) {
	size := m.Size()
	dAtA = make([]byte, size)
	n, err := m.MarshalToSizedBuffer(dAtA[:size])
	if err != nil {
		return nil, err
	}
	return dAtA[:n], nil
}

func (m *MsgSetBeforeSendHook) MarshalTo(dAtA []byte) (int, error) {
	size := m.Size()
	return m.MarshalToSizedBuffer(dAtA[:size])
}

func (m *MsgSetBeforeSendHook) MarshalToSizedBuffer(dAtA []byte) (int, error) {
	i := len(dAtA)
	if len(m.CosmwasmAddress) > 0 {
		i -= len(m.CosmwasmAddress)
		copy(dAtA[i:], m.CosmwasmAddress)
		i = encodeVarintTF(dAtA, i, uint64(len(m.CosmwasmAddress)))
		i--
		dAtA[i] = 0x1a // field 3, wire type 2
	}
	if len(m.Denom) > 0 {
		i -= len(m.Denom)
		copy(dAtA[i:], m.Denom)
		i = encodeVarintTF(dAtA, i, uint64(len(m.Denom)))
		i--
		dAtA[i] = 0x12 // field 2, wire type 2
	}
	if len(m.Sender) > 0 {
		i -= len(m.Sender)
		copy(dAtA[i:], m.Sender)
		i = encodeVarintTF(dAtA, i, uint64(len(m.Sender)))
		i--
		dAtA[i] = 0x0a // field 1, wire type 2
	}
	return len(dAtA) - i, nil
}

func (m *MsgSetBeforeSendHook) Size() int {
	if m == nil {
		return 0
	}
	n := 0
	if len(m.Sender) > 0 {
		n += 1 + sovTF(uint64(len(m.Sender))) + len(m.Sender)
	}
	if len(m.Denom) > 0 {
		n += 1 + sovTF(uint64(len(m.Denom))) + len(m.Denom)
	}
	if len(m.CosmwasmAddress) > 0 {
		n += 1 + sovTF(uint64(len(m.CosmwasmAddress))) + len(m.CosmwasmAddress)
	}
	return n
}

func (m *MsgSetBeforeSendHook) Unmarshal(dAtA []byte) error {
	l := len(dAtA)
	iNdEx := 0
	for iNdEx < l {
		preIndex := iNdEx
		var wire uint64
		for shift := uint(0); ; shift += 7 {
			if shift >= 64 {
				return errIntOverflow
			}
			if iNdEx >= l {
				return io.ErrUnexpectedEOF
			}
			b := dAtA[iNdEx]
			iNdEx++
			wire |= uint64(b&0x7F) << shift
			if b < 0x80 {
				break
			}
		}
		fieldNum := int32(wire >> 3)
		wireType := int(wire & 0x7)
		switch fieldNum {
		case 1: // sender
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field Sender", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			m.Sender = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		case 2: // denom
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field Denom", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			m.Denom = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		case 3: // cosmwasm_address
			if wireType != 2 {
				return fmt.Errorf("proto: wrong wireType = %d for field CosmwasmAddress", wireType)
			}
			var stringLen uint64
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return errIntOverflow
				}
				if iNdEx >= l {
					return io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				stringLen |= uint64(b&0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			postIndex := iNdEx + int(stringLen)
			if postIndex < 0 || postIndex > l {
				return io.ErrUnexpectedEOF
			}
			m.CosmwasmAddress = string(dAtA[iNdEx:postIndex])
			iNdEx = postIndex
		default:
			iNdEx = preIndex
			skippy, err := skipTF(dAtA[iNdEx:])
			if err != nil {
				return err
			}
			if skippy < 0 || (iNdEx+skippy) < 0 || (iNdEx+skippy) > l {
				return io.ErrUnexpectedEOF
			}
			iNdEx += skippy
		}
	}
	if iNdEx > l {
		return io.ErrUnexpectedEOF
	}
	return nil
}

// MsgSetBeforeSendHookResponse is the response for MsgSetBeforeSendHook.
type MsgSetBeforeSendHookResponse struct{}

func (m *MsgSetBeforeSendHookResponse) Reset()         { *m = MsgSetBeforeSendHookResponse{} }
func (m *MsgSetBeforeSendHookResponse) String() string { return "MsgSetBeforeSendHookResponse{}" }
func (m *MsgSetBeforeSendHookResponse) ProtoMessage()  {}
func (m *MsgSetBeforeSendHookResponse) XXX_MessageName() string {
	return "osmosis.tokenfactory.v1beta1.MsgSetBeforeSendHookResponse"
}
func (m *MsgSetBeforeSendHookResponse) Marshal() ([]byte, error)    { return []byte{}, nil }
func (m *MsgSetBeforeSendHookResponse) MarshalTo(dAtA []byte) (int, error) { return 0, nil }
func (m *MsgSetBeforeSendHookResponse) Size() int                   { return 0 }
func (m *MsgSetBeforeSendHookResponse) Unmarshal([]byte) error       { return nil }

// =====================================================
// Shared protobuf encoding/decoding helpers
// =====================================================

var errIntOverflow = fmt.Errorf("proto: integer overflow")

func sovTF(x uint64) int {
	n := 0
	for {
		n++
		x >>= 7
		if x == 0 {
			break
		}
	}
	return n
}

func encodeVarintTF(dAtA []byte, offset int, v uint64) int {
	offset -= sovTF(v)
	base := offset
	for v >= 1<<7 {
		dAtA[offset] = uint8(v&0x7f | 0x80)
		v >>= 7
		offset++
	}
	dAtA[offset] = uint8(v)
	return base
}

func skipTF(dAtA []byte) (n int, err error) {
	l := len(dAtA)
	iNdEx := 0
	depth := 0
	for iNdEx < l {
		var wire uint64
		for shift := uint(0); ; shift += 7 {
			if shift >= 64 {
				return 0, errIntOverflow
			}
			if iNdEx >= l {
				return 0, io.ErrUnexpectedEOF
			}
			b := dAtA[iNdEx]
			iNdEx++
			wire |= (uint64(b) & 0x7F) << shift
			if b < 0x80 {
				break
			}
		}
		wireType := int(wire & 0x7)
		switch wireType {
		case 0:
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return 0, errIntOverflow
				}
				if iNdEx >= l {
					return 0, io.ErrUnexpectedEOF
				}
				iNdEx++
				if dAtA[iNdEx-1] < 0x80 {
					break
				}
			}
		case 1:
			iNdEx += 8
		case 2:
			var length int
			for shift := uint(0); ; shift += 7 {
				if shift >= 64 {
					return 0, errIntOverflow
				}
				if iNdEx >= l {
					return 0, io.ErrUnexpectedEOF
				}
				b := dAtA[iNdEx]
				iNdEx++
				length |= (int(b) & 0x7F) << shift
				if b < 0x80 {
					break
				}
			}
			if length < 0 {
				return 0, fmt.Errorf("proto: negative length found during unmarshaling")
			}
			iNdEx += length
		case 3:
			depth++
		case 4:
			if depth == 0 {
				return 0, fmt.Errorf("proto: unexpected end of group")
			}
			depth--
		case 5:
			iNdEx += 4
		default:
			return 0, fmt.Errorf("proto: illegal wireType %d", wireType)
		}
		if iNdEx < 0 {
			return 0, fmt.Errorf("proto: negative length found during unmarshaling")
		}
		if depth == 0 {
			return iNdEx, nil
		}
	}
	return 0, io.ErrUnexpectedEOF
}

// Register all message types with gogoproto so that proto.MessageName() returns
// the correct Osmosis type URL names. This is critical for Cosmos SDK's
// interface registry to resolve types correctly.
func init() {
	proto.RegisterType((*MsgCreateDenom)(nil), "osmosis.tokenfactory.v1beta1.MsgCreateDenom")
	proto.RegisterType((*MsgCreateDenomResponse)(nil), "osmosis.tokenfactory.v1beta1.MsgCreateDenomResponse")
	proto.RegisterType((*MsgMint)(nil), "osmosis.tokenfactory.v1beta1.MsgMint")
	proto.RegisterType((*MsgMintResponse)(nil), "osmosis.tokenfactory.v1beta1.MsgMintResponse")
	proto.RegisterType((*MsgBurn)(nil), "osmosis.tokenfactory.v1beta1.MsgBurn")
	proto.RegisterType((*MsgBurnResponse)(nil), "osmosis.tokenfactory.v1beta1.MsgBurnResponse")
	proto.RegisterType((*MsgSetBeforeSendHook)(nil), "osmosis.tokenfactory.v1beta1.MsgSetBeforeSendHook")
	proto.RegisterType((*MsgSetBeforeSendHookResponse)(nil), "osmosis.tokenfactory.v1beta1.MsgSetBeforeSendHookResponse")
}
