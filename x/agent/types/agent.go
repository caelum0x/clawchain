package types

import (
	"encoding/json"
	"fmt"

	"cosmossdk.io/collections/codec"
)

// AgentInfo represents a registered AI agent on-chain.
type AgentInfo struct {
	Address      string `json:"address"`
	Pubkey       string `json:"pubkey"`
	Endpoint     string `json:"endpoint"`      // encrypted endpoint
	Name         string `json:"name"`
	RegisteredAt int64  `json:"registered_at"` // block height
	Active       bool   `json:"active"`
}

// AgentActionRecord represents a single action performed by an agent.
type AgentActionRecord struct {
	AgentAddress string `json:"agent_address"`
	ActionType   string `json:"action_type"`
	Payload      string `json:"payload"`
	BlockHeight  int64  `json:"block_height"`
	Timestamp    int64  `json:"timestamp"`
}

// SupportedActionTypes lists the allowed action types for MVP.
var SupportedActionTypes = map[string]bool{
	"transfer":   true,
	"coordinate": true,
	"query":      true,
}

// jsonValueCodec is a generic ValueCodec that stores values as JSON bytes.
// This works with cosmossdk.io/collections for any JSON-serializable type.
type jsonValueCodec[T any] struct {
	typeName string
}

func (c jsonValueCodec[T]) Encode(value T) ([]byte, error) {
	return json.Marshal(value)
}

func (c jsonValueCodec[T]) Decode(b []byte) (T, error) {
	var v T
	err := json.Unmarshal(b, &v)
	return v, err
}

func (c jsonValueCodec[T]) EncodeJSON(value T) ([]byte, error) {
	return json.Marshal(value)
}

func (c jsonValueCodec[T]) DecodeJSON(b []byte) (T, error) {
	var v T
	err := json.Unmarshal(b, &v)
	return v, err
}

func (c jsonValueCodec[T]) Stringify(value T) string {
	b, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprintf("<%s: marshal error: %v>", c.typeName, err)
	}
	return string(b)
}

func (c jsonValueCodec[T]) ValueType() string {
	return c.typeName
}

// Ensure our codec implements the ValueCodec interface.
var _ codec.ValueCodec[AgentInfo] = jsonValueCodec[AgentInfo]{}
var _ codec.ValueCodec[AgentActionRecord] = jsonValueCodec[AgentActionRecord]{}

// AgentInfoValueCodec returns a ValueCodec for AgentInfo using JSON serialization.
func AgentInfoValueCodec() codec.ValueCodec[AgentInfo] {
	return jsonValueCodec[AgentInfo]{typeName: "AgentInfo"}
}

// AgentActionRecordValueCodec returns a ValueCodec for AgentActionRecord using JSON serialization.
func AgentActionRecordValueCodec() codec.ValueCodec[AgentActionRecord] {
	return jsonValueCodec[AgentActionRecord]{typeName: "AgentActionRecord"}
}
