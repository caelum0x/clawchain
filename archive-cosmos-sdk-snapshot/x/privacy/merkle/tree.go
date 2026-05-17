// Package merkle provides a simple in-memory Merkle tree using MiMC hash
// on BN254 for the privacy module's commitment tree. This is used for
// off-chain proof generation and on-chain verification helpers.
package merkle

import (
	"encoding/hex"
	"fmt"
	"math/big"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr/mimc"
)

// Depth is the fixed depth of the commitment Merkle tree.
const Depth = 32

// Tree is a simple append-only Merkle tree using MiMC hash.
// The tree stores all nodes in memory indexed by (level, index).
// Level 0 is the leaf level, level Depth is the root.
type Tree struct {
	// Nodes stores all tree nodes. Key: "level:index" -> field element bytes.
	Nodes map[string]*big.Int
	// NextLeafIndex is the index of the next leaf to be inserted.
	NextLeafIndex uint64
	// ZeroHashes contains the default hash at each level (for empty subtrees).
	ZeroHashes [Depth + 1]*big.Int
}

// NewTree creates a new empty Merkle tree with default zero hashes at each level.
func NewTree() *Tree {
	t := &Tree{
		Nodes:         make(map[string]*big.Int),
		NextLeafIndex: 0,
	}
	t.initZeroHashes()
	return t
}

// initZeroHashes computes the default hash at each level.
// Level 0 zero value is 0. Level i = MiMC(zero[i-1], zero[i-1]).
func (t *Tree) initZeroHashes() {
	t.ZeroHashes[0] = big.NewInt(0)
	for i := 1; i <= Depth; i++ {
		t.ZeroHashes[i] = mimcHash(t.ZeroHashes[i-1], t.ZeroHashes[i-1])
	}
}

// Insert adds a new leaf to the tree and recomputes all affected nodes
// up to the root. Returns the leaf index.
func (t *Tree) Insert(leaf *big.Int) (uint64, error) {
	maxLeaves := uint64(1) << Depth
	if t.NextLeafIndex >= maxLeaves {
		return 0, fmt.Errorf("merkle tree is full (max %d leaves)", maxLeaves)
	}

	idx := t.NextLeafIndex
	t.setNode(0, idx, leaf)

	// Recompute path to root
	currentIdx := idx
	for level := 0; level < Depth; level++ {
		parentIdx := currentIdx / 2
		leftChildIdx := parentIdx * 2
		rightChildIdx := leftChildIdx + 1

		left := t.getNode(level, leftChildIdx)
		right := t.getNode(level, rightChildIdx)

		parentHash := mimcHash(left, right)
		t.setNode(level+1, parentIdx, parentHash)

		currentIdx = parentIdx
	}

	t.NextLeafIndex++
	return idx, nil
}

// Root returns the current root of the Merkle tree.
func (t *Tree) Root() *big.Int {
	return t.getNode(Depth, 0)
}

// RootHex returns the current root as a hex string.
func (t *Tree) RootHex() string {
	root := t.Root()
	return hex.EncodeToString(root.Bytes())
}

// Proof represents a Merkle inclusion proof.
type Proof struct {
	// Path contains the sibling hashes at each level (from leaf to root).
	Path [Depth]*big.Int
	// Indices contains 0 or 1 at each level indicating whether the node
	// is the left (0) or right (1) child.
	Indices [Depth]uint64
}

// GetProof returns the Merkle proof for the leaf at the given index.
func (t *Tree) GetProof(leafIndex uint64) (*Proof, error) {
	if leafIndex >= t.NextLeafIndex {
		return nil, fmt.Errorf("leaf index %d out of range (inserted %d leaves)", leafIndex, t.NextLeafIndex)
	}

	proof := &Proof{}
	currentIdx := leafIndex

	for level := 0; level < Depth; level++ {
		// Determine if current node is left or right child
		isRight := currentIdx % 2
		proof.Indices[level] = isRight

		// Get sibling
		var siblingIdx uint64
		if isRight == 0 {
			siblingIdx = currentIdx + 1
		} else {
			siblingIdx = currentIdx - 1
		}

		proof.Path[level] = t.getNode(level, siblingIdx)
		currentIdx = currentIdx / 2
	}

	return proof, nil
}

// VerifyProof verifies that a leaf belongs to the tree with the given root.
func VerifyProof(leaf *big.Int, proof *Proof, root *big.Int) bool {
	current := new(big.Int).Set(leaf)

	for level := 0; level < Depth; level++ {
		sibling := proof.Path[level]
		var left, right *big.Int
		if proof.Indices[level] == 0 {
			left = current
			right = sibling
		} else {
			left = sibling
			right = current
		}
		current = mimcHash(left, right)
	}

	return current.Cmp(root) == 0
}

// getNode retrieves a node from the tree, returning the zero hash if not set.
func (t *Tree) getNode(level int, index uint64) *big.Int {
	key := nodeKey(level, index)
	if val, ok := t.Nodes[key]; ok {
		return val
	}
	return t.ZeroHashes[level]
}

// setNode stores a node in the tree.
func (t *Tree) setNode(level int, index uint64, value *big.Int) {
	key := nodeKey(level, index)
	t.Nodes[key] = new(big.Int).Set(value)
}

// nodeKey returns the string key for a node at (level, index).
func nodeKey(level int, index uint64) string {
	return fmt.Sprintf("%d:%d", level, index)
}

// mimcHash computes MiMC(left, right) using the BN254 MiMC hasher from gnark-crypto.
func mimcHash(left, right *big.Int) *big.Int {
	h := mimc.NewMiMC()

	// Convert big.Int to field element bytes (32 bytes, big-endian)
	var leftElem, rightElem fr.Element
	leftElem.SetBigInt(left)
	rightElem.SetBigInt(right)

	leftBytes := leftElem.Marshal()
	rightBytes := rightElem.Marshal()

	h.Write(leftBytes)
	h.Write(rightBytes)

	hashBytes := h.Sum(nil)

	var result fr.Element
	result.SetBytes(hashBytes)

	var resultBig big.Int
	result.BigInt(&resultBig)
	return &resultBig
}

// MiMCHashPair is a public helper that computes MiMC(left, right).
// Useful for computing commitments: commitment = MiMC(amount, blinding).
func MiMCHashPair(left, right *big.Int) *big.Int {
	return mimcHash(left, right)
}
