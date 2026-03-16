package keeper

import "crypto/sha256"

// sha256Sum returns the SHA-256 hash of the input data.
func sha256Sum(data []byte) [32]byte {
	return sha256.Sum256(data)
}
