package merkle

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewTreeInitializesZeroHashes(t *testing.T) {
	tree := NewTree()

	require.NotNil(t, tree.ZeroHashes[0])
	require.Equal(t, big.NewInt(0), tree.ZeroHashes[0])

	// Each subsequent level should be non-zero (MiMC(zero, zero) != 0).
	for i := 1; i <= Depth; i++ {
		require.NotNil(t, tree.ZeroHashes[i])
		require.NotEqual(t, 0, tree.ZeroHashes[i].Sign(), "zero hash at level %d should be non-zero", i)
	}

	// Zero hashes at different levels should differ.
	require.NotEqual(t, 0, tree.ZeroHashes[1].Cmp(tree.ZeroHashes[2]))
}

func TestEmptyTreeRoot(t *testing.T) {
	tree := NewTree()

	root := tree.Root()
	require.NotNil(t, root)
	// Empty tree root should equal ZeroHashes[Depth].
	require.Equal(t, 0, root.Cmp(tree.ZeroHashes[Depth]))
}

func TestInsertSingleLeaf(t *testing.T) {
	tree := NewTree()
	emptyRoot := tree.Root()

	leaf := big.NewInt(12345)
	idx, err := tree.Insert(leaf)
	require.NoError(t, err)
	require.Equal(t, uint64(0), idx)
	require.Equal(t, uint64(1), tree.NextLeafIndex)

	// Root should change after insertion.
	newRoot := tree.Root()
	require.NotEqual(t, 0, emptyRoot.Cmp(newRoot))
}

func TestInsertMultipleLeaves(t *testing.T) {
	tree := NewTree()

	idx0, err := tree.Insert(big.NewInt(100))
	require.NoError(t, err)
	require.Equal(t, uint64(0), idx0)

	idx1, err := tree.Insert(big.NewInt(200))
	require.NoError(t, err)
	require.Equal(t, uint64(1), idx1)

	idx2, err := tree.Insert(big.NewInt(300))
	require.NoError(t, err)
	require.Equal(t, uint64(2), idx2)

	require.Equal(t, uint64(3), tree.NextLeafIndex)
}

func TestRootConsistency(t *testing.T) {
	// Two trees with the same leaves inserted in the same order should
	// produce the same root.
	tree1 := NewTree()
	tree2 := NewTree()

	for i := int64(1); i <= 5; i++ {
		_, err := tree1.Insert(big.NewInt(i * 100))
		require.NoError(t, err)
		_, err = tree2.Insert(big.NewInt(i * 100))
		require.NoError(t, err)
	}

	require.Equal(t, 0, tree1.Root().Cmp(tree2.Root()))
}

func TestRootDiffersWithDifferentLeaves(t *testing.T) {
	tree1 := NewTree()
	tree2 := NewTree()

	_, err := tree1.Insert(big.NewInt(100))
	require.NoError(t, err)
	_, err = tree2.Insert(big.NewInt(200))
	require.NoError(t, err)

	require.NotEqual(t, 0, tree1.Root().Cmp(tree2.Root()))
}

func TestMerkleProofGeneration(t *testing.T) {
	tree := NewTree()

	leaf := big.NewInt(42)
	idx, err := tree.Insert(leaf)
	require.NoError(t, err)

	proof, err := tree.GetProof(idx)
	require.NoError(t, err)
	require.NotNil(t, proof)

	// Proof path should have Depth entries.
	require.Len(t, proof.Path, Depth)
	require.Len(t, proof.Indices, Depth)
}

func TestMerkleProofVerification(t *testing.T) {
	tree := NewTree()

	leaf := big.NewInt(42)
	idx, err := tree.Insert(leaf)
	require.NoError(t, err)

	root := tree.Root()
	proof, err := tree.GetProof(idx)
	require.NoError(t, err)

	valid := VerifyProof(leaf, proof, root)
	require.True(t, valid, "proof should verify for correct leaf")
}

func TestMerkleProofVerificationMultipleLeaves(t *testing.T) {
	tree := NewTree()

	leaves := []*big.Int{
		big.NewInt(100),
		big.NewInt(200),
		big.NewInt(300),
		big.NewInt(400),
	}

	indices := make([]uint64, len(leaves))
	for i, leaf := range leaves {
		idx, err := tree.Insert(leaf)
		require.NoError(t, err)
		indices[i] = idx
	}

	root := tree.Root()

	// Verify proof for each leaf.
	for i, leaf := range leaves {
		proof, err := tree.GetProof(indices[i])
		require.NoError(t, err)
		require.True(t, VerifyProof(leaf, proof, root), "proof should verify for leaf %d", i)
	}
}

func TestMerkleProofRejectsWrongLeaf(t *testing.T) {
	tree := NewTree()

	_, err := tree.Insert(big.NewInt(42))
	require.NoError(t, err)

	root := tree.Root()
	proof, err := tree.GetProof(0)
	require.NoError(t, err)

	// Verify with wrong leaf should fail.
	valid := VerifyProof(big.NewInt(99), proof, root)
	require.False(t, valid, "proof should not verify for wrong leaf")
}

func TestMerkleProofRejectsWrongRoot(t *testing.T) {
	tree := NewTree()

	leaf := big.NewInt(42)
	_, err := tree.Insert(leaf)
	require.NoError(t, err)

	proof, err := tree.GetProof(0)
	require.NoError(t, err)

	wrongRoot := big.NewInt(9999)
	valid := VerifyProof(leaf, proof, wrongRoot)
	require.False(t, valid, "proof should not verify with wrong root")
}

func TestGetProofOutOfRange(t *testing.T) {
	tree := NewTree()

	_, err := tree.GetProof(0)
	require.Error(t, err)
	require.Contains(t, err.Error(), "out of range")
}

func TestRootHex(t *testing.T) {
	tree := NewTree()
	_, err := tree.Insert(big.NewInt(42))
	require.NoError(t, err)

	hex := tree.RootHex()
	require.NotEmpty(t, hex)
	require.Greater(t, len(hex), 0)
}

func TestMiMCHashPair(t *testing.T) {
	left := big.NewInt(100)
	right := big.NewInt(200)

	hash := MiMCHashPair(left, right)
	require.NotNil(t, hash)
	require.NotEqual(t, big.NewInt(0), hash)

	// Deterministic.
	hash2 := MiMCHashPair(left, right)
	require.Equal(t, 0, hash.Cmp(hash2))

	// Order matters.
	hash3 := MiMCHashPair(right, left)
	require.NotEqual(t, 0, hash.Cmp(hash3))
}
