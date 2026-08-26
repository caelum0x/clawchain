package settlement

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

// Outcome is the signed, independently verifiable result of a lifecycle
// transition. A third party (auditor, counterparty, billing system) can verify
// an Outcome with only the service public key — no chain access required.
type Outcome struct {
	Event     string `json:"event"`      // EventSettled | EventDisputed | EventResolved
	Claim     Claim  `json:"claim"`      // full post-transition claim state
	Digest    string `json:"digest"`     // hex sha256 over canonical (event, claim)
	Signature string `json:"signature"`  // base64 ed25519 signature over the canonical bytes
	PublicKey string `json:"public_key"` // base64 ed25519 public key of the signer
	SignedAt  int64  `json:"signed_at"`
}

// Signer produces ed25519-signed outcomes. It holds a private key that never
// leaves the process; only the public key is published (via outcomes and the
// service /v1/pubkey endpoint).
type Signer struct {
	priv ed25519.PrivateKey
	pub  ed25519.PublicKey
}

// NewSigner builds a Signer from a 32-byte ed25519 seed. Using a fixed seed
// yields a stable public key across restarts (important for verifiers).
func NewSigner(seed []byte) (*Signer, error) {
	if len(seed) != ed25519.SeedSize {
		return nil, fmt.Errorf("%w: signer seed must be %d bytes, got %d", ErrInvalidRequest, ed25519.SeedSize, len(seed))
	}
	priv := ed25519.NewKeyFromSeed(seed)
	return &Signer{priv: priv, pub: priv.Public().(ed25519.PublicKey)}, nil
}

// PublicKeyB64 returns the base64-encoded public key.
func (s *Signer) PublicKeyB64() string {
	return base64.StdEncoding.EncodeToString(s.pub)
}

// canonicalBytes returns the deterministic byte representation that is hashed
// and signed: a struct-ordered JSON of the event plus the claim. Go's
// encoding/json emits struct fields in declaration order, so this is stable.
func canonicalBytes(event string, c *Claim) ([]byte, error) {
	payload := struct {
		Event string `json:"event"`
		Claim *Claim `json:"claim"`
	}{Event: event, Claim: c}
	return json.Marshal(payload)
}

// Sign builds a signed Outcome for a claim transition. The digest is the sha256
// of the canonical bytes; the signature is ed25519 over those same bytes.
func (s *Signer) Sign(event string, c *Claim, signedAt int64) (*Outcome, error) {
	canon, err := canonicalBytes(event, c)
	if err != nil {
		return nil, fmt.Errorf("canonicalize outcome: %w", err)
	}
	sum := sha256.Sum256(canon)
	sig := ed25519.Sign(s.priv, canon)
	// copy the claim so later mutations don't affect a stored outcome
	claimCopy := *c
	return &Outcome{
		Event:     event,
		Claim:     claimCopy,
		Digest:    hex.EncodeToString(sum[:]),
		Signature: base64.StdEncoding.EncodeToString(sig),
		PublicKey: s.PublicKeyB64(),
		SignedAt:  signedAt,
	}, nil
}

// VerifyOutcome verifies an Outcome's signature and digest against its embedded
// public key. It returns nil if the outcome is authentic and untampered. This
// is the primitive a verifier uses off-chain.
func VerifyOutcome(o *Outcome) error {
	pub, err := base64.StdEncoding.DecodeString(o.PublicKey)
	if err != nil || len(pub) != ed25519.PublicKeySize {
		return fmt.Errorf("%w: bad public key", ErrInvalidRequest)
	}
	sig, err := base64.StdEncoding.DecodeString(o.Signature)
	if err != nil {
		return fmt.Errorf("%w: bad signature encoding", ErrInvalidRequest)
	}
	canon, err := canonicalBytes(o.Event, &o.Claim)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(canon)
	if hex.EncodeToString(sum[:]) != o.Digest {
		return fmt.Errorf("%w: digest mismatch", ErrInvalidRequest)
	}
	if !ed25519.Verify(pub, canon, sig) {
		return fmt.Errorf("%w: signature verification failed", ErrInvalidRequest)
	}
	return nil
}
