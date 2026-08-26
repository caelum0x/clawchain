package settlement

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"

	"cosmossdk.io/math"
	bolt "go.etcd.io/bbolt"
)

// bbolt bucket names.
var (
	bucketClaims     = []byte("claims")
	bucketReputation = []byte("reputation")
	bucketIdem       = []byte("idempotency")
	bucketFees       = []byte("fees")
)

// BoltStore is a real, embedded, pure-Go persistence layer backed by bbolt.
// bbolt is already a vendored dependency of the chain, so this adds no new
// third-party code and runs entirely off-chain (a single local file).
type BoltStore struct {
	db *bolt.DB
}

// NewBoltStore opens (creating if needed) a bbolt database at path and ensures
// all required buckets exist.
func NewBoltStore(path string) (*BoltStore, error) {
	db, err := bolt.Open(path, 0o600, nil)
	if err != nil {
		return nil, fmt.Errorf("open bolt db %q: %w", path, err)
	}
	err = db.Update(func(tx *bolt.Tx) error {
		for _, b := range [][]byte{bucketClaims, bucketReputation, bucketIdem, bucketFees} {
			if _, err := tx.CreateBucketIfNotExists(b); err != nil {
				return fmt.Errorf("create bucket %s: %w", b, err)
			}
		}
		return nil
	})
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return &BoltStore{db: db}, nil
}

// Close closes the underlying database.
func (s *BoltStore) Close() error { return s.db.Close() }

// GetClaim implements Store.
func (s *BoltStore) GetClaim(_ context.Context, id string) (*Claim, error) {
	var out *Claim
	err := s.db.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket(bucketClaims).Get([]byte(id))
		if raw == nil {
			return ErrClaimNotFound
		}
		var c Claim
		if err := json.Unmarshal(raw, &c); err != nil {
			return fmt.Errorf("unmarshal claim %s: %w", id, err)
		}
		out = &c
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// PutClaim implements Store.
func (s *BoltStore) PutClaim(_ context.Context, c *Claim) error {
	raw, err := json.Marshal(c)
	if err != nil {
		return fmt.Errorf("marshal claim %s: %w", c.ID, err)
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketClaims).Put([]byte(c.ID), raw)
	})
}

// Reputation implements Store. A provider that has never been slashed defaults
// to the maximum score (MaxReputationBps).
func (s *BoltStore) Reputation(_ context.Context, provider string) (uint64, error) {
	score := MaxReputationBps
	err := s.db.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket(bucketReputation).Get([]byte(provider))
		if raw != nil {
			score = binary.BigEndian.Uint64(raw)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return score, nil
}

// SetReputation implements Store.
func (s *BoltStore) SetReputation(_ context.Context, provider string, bps uint64) error {
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], bps)
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketReputation).Put([]byte(provider), buf[:])
	})
}

// GetIdempotent implements Store.
func (s *BoltStore) GetIdempotent(_ context.Context, key string) (*Outcome, error) {
	if key == "" {
		return nil, nil
	}
	var out *Outcome
	err := s.db.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket(bucketIdem).Get([]byte(key))
		if raw == nil {
			return nil
		}
		var o Outcome
		if err := json.Unmarshal(raw, &o); err != nil {
			return fmt.Errorf("unmarshal idempotent outcome: %w", err)
		}
		out = &o
		return nil
	})
	return out, err
}

// PutIdempotent implements Store.
func (s *BoltStore) PutIdempotent(_ context.Context, key string, o *Outcome) error {
	if key == "" {
		return nil
	}
	raw, err := json.Marshal(o)
	if err != nil {
		return fmt.Errorf("marshal idempotent outcome: %w", err)
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketIdem).Put([]byte(key), raw)
	})
}

// AddFee implements Store: atomic read-modify-write of the account fee ledger.
func (s *BoltStore) AddFee(_ context.Context, account, denom, amount string) (*FeeLedger, error) {
	amt, ok := math.NewIntFromString(amount)
	if !ok {
		return nil, fmt.Errorf("%w: fee amount %q not an integer", ErrInvalidRequest, amount)
	}
	var out *FeeLedger
	err := s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketFees)
		ledger := FeeLedger{Account: account, Denom: denom, Total: "0", Count: 0}
		if raw := b.Get([]byte(account)); raw != nil {
			if err := json.Unmarshal(raw, &ledger); err != nil {
				return fmt.Errorf("unmarshal fee ledger: %w", err)
			}
		}
		total, ok := math.NewIntFromString(ledger.Total)
		if !ok {
			total = math.ZeroInt()
		}
		ledger.Total = total.Add(amt).String()
		ledger.Denom = denom
		ledger.Count++
		raw, err := json.Marshal(&ledger)
		if err != nil {
			return fmt.Errorf("marshal fee ledger: %w", err)
		}
		if err := b.Put([]byte(account), raw); err != nil {
			return err
		}
		out = &ledger
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// GetFee implements Store.
func (s *BoltStore) GetFee(_ context.Context, account string) (*FeeLedger, error) {
	ledger := &FeeLedger{Account: account, Denom: "", Total: "0", Count: 0}
	err := s.db.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket(bucketFees).Get([]byte(account))
		if raw != nil {
			return json.Unmarshal(raw, ledger)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return ledger, nil
}
