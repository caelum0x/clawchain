package types

// Proto-compatible Marshal/Unmarshal/Size methods for ExchangeRate,
// PriceHistoryEntry, and OracleParams so they can be embedded in
// protobuf request/response messages.

import (
	"encoding/json"
	fmt "fmt"
	io "io"
	math_bits "math/bits"
)

// ── ExchangeRate ────────────────────────────────────────────────

func (m *ExchangeRate) Reset()         { *m = ExchangeRate{} }
func (m *ExchangeRate) String() string { return fmt.Sprintf("%+v", *m) }
func (*ExchangeRate) ProtoMessage()    {}

func (m *ExchangeRate) Marshal() (dAtA []byte, err error) {
	size := m.Size()
	dAtA = make([]byte, size)
	n, err := m.MarshalToSizedBuffer(dAtA[:size])
	if err != nil {
		return nil, err
	}
	return dAtA[:n], nil
}

func (m *ExchangeRate) MarshalTo(dAtA []byte) (int, error) {
	size := m.Size()
	return m.MarshalToSizedBuffer(dAtA[:size])
}

func (m *ExchangeRate) MarshalToSizedBuffer(dAtA []byte) (int, error) {
	// JSON-based marshal for embedded struct compatibility
	b, err := json.Marshal(m)
	if err != nil {
		return 0, err
	}
	i := len(dAtA)
	i -= len(b)
	copy(dAtA[i:], b)
	return len(dAtA) - i, nil
}

func (m *ExchangeRate) Size() (n int) {
	if m == nil {
		return 0
	}
	b, _ := json.Marshal(m)
	return len(b)
}

func (m *ExchangeRate) Unmarshal(dAtA []byte) error {
	return json.Unmarshal(dAtA, m)
}

// ── PriceHistoryEntry ───────────────────────────────────────────

func (m *PriceHistoryEntry) Reset()         { *m = PriceHistoryEntry{} }
func (m *PriceHistoryEntry) String() string { return fmt.Sprintf("%+v", *m) }
func (*PriceHistoryEntry) ProtoMessage()    {}

func (m *PriceHistoryEntry) Marshal() (dAtA []byte, err error) {
	size := m.Size()
	dAtA = make([]byte, size)
	n, err := m.MarshalToSizedBuffer(dAtA[:size])
	if err != nil {
		return nil, err
	}
	return dAtA[:n], nil
}

func (m *PriceHistoryEntry) MarshalTo(dAtA []byte) (int, error) {
	size := m.Size()
	return m.MarshalToSizedBuffer(dAtA[:size])
}

func (m *PriceHistoryEntry) MarshalToSizedBuffer(dAtA []byte) (int, error) {
	b, err := json.Marshal(m)
	if err != nil {
		return 0, err
	}
	i := len(dAtA)
	i -= len(b)
	copy(dAtA[i:], b)
	return len(dAtA) - i, nil
}

func (m *PriceHistoryEntry) Size() (n int) {
	if m == nil {
		return 0
	}
	b, _ := json.Marshal(m)
	return len(b)
}

func (m *PriceHistoryEntry) Unmarshal(dAtA []byte) error {
	return json.Unmarshal(dAtA, m)
}

// ── OracleParams ────────────────────────────────────────────────

func (m *OracleParams) Reset()         { *m = OracleParams{} }
func (m *OracleParams) String() string { return fmt.Sprintf("%+v", *m) }
func (*OracleParams) ProtoMessage()    {}

func (m *OracleParams) Marshal() (dAtA []byte, err error) {
	size := m.Size()
	dAtA = make([]byte, size)
	n, err := m.MarshalToSizedBuffer(dAtA[:size])
	if err != nil {
		return nil, err
	}
	return dAtA[:n], nil
}

func (m *OracleParams) MarshalTo(dAtA []byte) (int, error) {
	size := m.Size()
	return m.MarshalToSizedBuffer(dAtA[:size])
}

func (m *OracleParams) MarshalToSizedBuffer(dAtA []byte) (int, error) {
	b, err := json.Marshal(m)
	if err != nil {
		return 0, err
	}
	i := len(dAtA)
	i -= len(b)
	copy(dAtA[i:], b)
	return len(dAtA) - i, nil
}

func (m *OracleParams) Size() (n int) {
	if m == nil {
		return 0
	}
	b, _ := json.Marshal(m)
	return len(b)
}

func (m *OracleParams) Unmarshal(dAtA []byte) error {
	return json.Unmarshal(dAtA, m)
}

// Suppress unused import errors
var _ = io.ErrUnexpectedEOF
var _ = math_bits.Len64
