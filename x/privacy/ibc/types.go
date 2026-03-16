// Package ibc implements an IBC middleware for cross-chain privacy on ClawChain.
//
// The middleware wraps the ICS-20 transfer module and intercepts incoming
// token transfers. When a packet contains privacy metadata requesting
// auto-shielding, the received tokens are automatically deposited into the
// shielded pool. It also logs cross-chain transfer events for the privacy
// module's event listener.
package ibc

import "encoding/json"

const (
	// MetadataKey is the JSON key in the ICS-20 memo field that triggers
	// privacy middleware behaviour.
	MetadataKey = "clawchain_privacy"
)

// PrivacyMetadata is embedded in the ICS-20 transfer memo field (JSON)
// to signal the privacy middleware.
//
// Example memo:
//
//	{"clawchain_privacy":{"auto_shield":true}}
//	{"clawchain_privacy":{"action":"unshield","proof":"...","nullifier":"...","amount":"..."}}
type PrivacyMetadata struct {
	// AutoShield signals the middleware to automatically shield the received
	// tokens into the privacy pool after a successful transfer.
	AutoShield bool `json:"auto_shield"`
	// Action optionally specifies a privacy action: "" (default shield), "unshield".
	Action string `json:"action,omitempty"`
	// Proof is a hex-encoded ZK proof (used for unshield action).
	Proof string `json:"proof,omitempty"`
	// Nullifier is a hex-encoded nullifier (used for unshield action).
	Nullifier string `json:"nullifier,omitempty"`
	// Amount is the unshield amount as a string (used for unshield action).
	Amount string `json:"amount,omitempty"`
}

// ParsePrivacyMetadata extracts PrivacyMetadata from an ICS-20 memo string.
// Returns nil if the memo doesn't contain privacy metadata.
func ParsePrivacyMetadata(memo string) *PrivacyMetadata {
	if memo == "" {
		return nil
	}

	var outer map[string]json.RawMessage
	if err := json.Unmarshal([]byte(memo), &outer); err != nil {
		return nil
	}

	raw, ok := outer[MetadataKey]
	if !ok {
		return nil
	}

	var meta PrivacyMetadata
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil
	}

	return &meta
}
