//go:build integration
// +build integration

package keeper_test

import (
	"context"
	"encoding/hex"
	"math/big"
	"strings"
	"testing"

	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr/mimc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/witness"
	"github.com/consensys/gnark/frontend"
	"github.com/stretchr/testify/require"

	"clawchain/x/privacy/circuit"
	"clawchain/x/privacy/keeper"
	"clawchain/x/privacy/merkle"
	module "clawchain/x/privacy/module"
	"clawchain/x/privacy/types"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// offChainMiMCHash computes MiMC(left, right) using gnark-crypto the same way
// the merkle package does. This is used to verify hash consistency.
func offChainMiMCHash(left, right *big.Int) *big.Int {
	h := mimc.NewMiMC()

	var leftElem, rightElem fr.Element
	leftElem.SetBigInt(left)
	rightElem.SetBigInt(right)

	h.Write(leftElem.Marshal())
	h.Write(rightElem.Marshal())

	hashBytes := h.Sum(nil)

	var result fr.Element
	result.SetBytes(hashBytes)

	var out big.Int
	result.BigInt(&out)
	return &out
}

// fixedBlinding32 returns a deterministic 32-byte blinding value for tests.
func fixedBlinding32(seed uint64) []byte {
	b := make([]byte, 32)
	for i := 0; i < 8; i++ {
		b[31-i] = byte(seed >> (8 * i))
	}
	return b
}

// mockBankKeeper implements types.BankKeeper for tests that exercise the
// Shield message handler, which normally calls bankKeeper to escrow coins.
// The mock simply succeeds without moving any real coins.
type mockBankKeeper struct{}

var _ types.BankKeeper = (*mockBankKeeper)(nil)

func (m *mockBankKeeper) SpendableCoins(_ context.Context, _ sdk.AccAddress) sdk.Coins {
	return sdk.NewCoins()
}

func (m *mockBankKeeper) SendCoins(_ context.Context, _, _ sdk.AccAddress, _ sdk.Coins) error {
	return nil
}

func (m *mockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, _ sdk.AccAddress, _ string, _ sdk.Coins) error {
	return nil
}

func (m *mockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, _ string, _ sdk.AccAddress, _ sdk.Coins) error {
	return nil
}

// initFixtureWithBank creates a test fixture with a mock bank keeper so
// the Shield handler can succeed without a real bank module.
func initFixtureWithBank(t *testing.T) *fixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)

	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addrCodec,
		authority,
		&mockBankKeeper{},
	)

	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	return &fixture{
		ctx:          ctx,
		keeper:       k,
		addressCodec: addrCodec,
	}
}

// ---------------------------------------------------------------------------
// 1. Test MiMC hash consistency
// ---------------------------------------------------------------------------

// TestMiMCHashConsistency verifies that the off-chain merkle tree MiMC hash
// (gnark-crypto) produces the same result as computing it directly, and that
// the merkle.MiMCHashPair helper is consistent.
func TestMiMCHashConsistency(t *testing.T) {
	left := big.NewInt(100)
	right := big.NewInt(42)

	// Compute using our local helper (mirrors the merkle package implementation).
	expected := offChainMiMCHash(left, right)

	// Compute using the merkle package's public helper.
	got := merkle.MiMCHashPair(left, right)

	require.Equal(t, 0, expected.Cmp(got),
		"MiMC hash mismatch: local helper = %s, merkle.MiMCHashPair = %s",
		expected.String(), got.String())

	// Verify determinism: hashing the same inputs twice yields the same result.
	got2 := merkle.MiMCHashPair(left, right)
	require.Equal(t, 0, got.Cmp(got2), "MiMC hash is not deterministic")

	// Verify different inputs produce different hashes.
	different := merkle.MiMCHashPair(big.NewInt(101), right)
	require.NotEqual(t, 0, got.Cmp(different),
		"different inputs should produce different hashes")

	// Verify the commitment formula used by the circuit: commitment = MiMC(amount, blinding).
	amount := big.NewInt(1000)
	blinding := big.NewInt(9999)
	commitment := merkle.MiMCHashPair(amount, blinding)
	require.NotNil(t, commitment)
	require.True(t, commitment.Sign() > 0, "commitment should be positive")
}

// ---------------------------------------------------------------------------
// 2. Test Merkle tree operations
// ---------------------------------------------------------------------------

func TestMerkleTreeInsertAndProof(t *testing.T) {
	tree := merkle.NewTree()

	// Insert several leaves.
	leaves := []*big.Int{
		big.NewInt(111),
		big.NewInt(222),
		big.NewInt(333),
	}

	for i, leaf := range leaves {
		idx, err := tree.Insert(leaf)
		require.NoError(t, err)
		require.Equal(t, uint64(i), idx)
	}

	root := tree.Root()
	require.NotNil(t, root)
	require.True(t, root.Sign() != 0, "root should be non-zero after inserts")

	// Get and verify proofs for each leaf.
	for i, leaf := range leaves {
		proof, err := tree.GetProof(uint64(i))
		require.NoError(t, err, "failed to get proof for leaf %d", i)

		valid := merkle.VerifyProof(leaf, proof, root)
		require.True(t, valid, "proof should be valid for leaf %d", i)
	}

	// A wrong leaf should not verify.
	proof0, err := tree.GetProof(0)
	require.NoError(t, err)
	wrongLeaf := big.NewInt(999)
	valid := merkle.VerifyProof(wrongLeaf, proof0, root)
	require.False(t, valid, "proof should not verify for a wrong leaf")

	// Verify that inserting a new leaf changes the root.
	oldRoot := new(big.Int).Set(root)
	_, err = tree.Insert(big.NewInt(444))
	require.NoError(t, err)
	newRoot := tree.Root()
	require.NotEqual(t, 0, oldRoot.Cmp(newRoot),
		"root should change after inserting a new leaf")
}

func TestMerkleTreeRootHex(t *testing.T) {
	tree := merkle.NewTree()

	// Empty tree root hex should be deterministic.
	emptyRootHex := tree.RootHex()
	require.NotEmpty(t, emptyRootHex)

	// Insert a leaf and check that root hex changes.
	_, err := tree.Insert(big.NewInt(42))
	require.NoError(t, err)
	nonEmptyRootHex := tree.RootHex()
	require.NotEqual(t, emptyRootHex, nonEmptyRootHex)

	// Root hex should decode to valid bytes.
	_, err = hex.DecodeString(nonEmptyRootHex)
	require.NoError(t, err)
}

func TestMerkleTreeProofOutOfRange(t *testing.T) {
	tree := merkle.NewTree()
	_, err := tree.Insert(big.NewInt(1))
	require.NoError(t, err)

	// Requesting a proof for an index that has not been inserted should fail.
	_, err = tree.GetProof(1)
	require.Error(t, err, "should fail for out-of-range leaf index")

	// Index 0 should succeed.
	_, err = tree.GetProof(0)
	require.NoError(t, err)
}

// ---------------------------------------------------------------------------
// 3. Test ZK circuit compilation
// ---------------------------------------------------------------------------

func TestCompileTransferCircuit(t *testing.T) {
	cs, err := circuit.CompileTransferCircuit()
	require.NoError(t, err)
	require.NotNil(t, cs)

	nbConstraints := cs.GetNbConstraints()
	require.Greater(t, nbConstraints, 0, "transfer circuit should have constraints")
	t.Logf("TransferCircuit constraints: %d", nbConstraints)
}

func TestCompileUnshieldCircuit(t *testing.T) {
	cs, err := circuit.CompileUnshieldCircuit()
	require.NoError(t, err)
	require.NotNil(t, cs)

	nbConstraints := cs.GetNbConstraints()
	require.Greater(t, nbConstraints, 0, "unshield circuit should have constraints")
	t.Logf("UnshieldCircuit constraints: %d", nbConstraints)
}

// ---------------------------------------------------------------------------
// 4. Test trusted setup
// ---------------------------------------------------------------------------

func TestSetupTransfer(t *testing.T) {
	pk, vk, cs, err := circuit.SetupTransfer()
	require.NoError(t, err)
	require.NotNil(t, pk)
	require.NotNil(t, vk)
	require.NotNil(t, cs)

	// Verify the keys can be serialized and deserialized.
	pkBytes, err := circuit.SerializeProvingKey(pk)
	require.NoError(t, err)
	require.True(t, len(pkBytes) > 0)

	vkBytes, err := circuit.SerializeVerifyingKey(vk)
	require.NoError(t, err)
	require.True(t, len(vkBytes) > 0)

	// Round-trip deserialization.
	pk2, err := circuit.DeserializeProvingKey(pkBytes)
	require.NoError(t, err)
	require.NotNil(t, pk2)

	vk2, err := circuit.DeserializeVerifyingKey(vkBytes)
	require.NoError(t, err)
	require.NotNil(t, vk2)
}

func TestSetupUnshield(t *testing.T) {
	pk, vk, cs, err := circuit.SetupUnshield()
	require.NoError(t, err)
	require.NotNil(t, pk)
	require.NotNil(t, vk)
	require.NotNil(t, cs)
}

// ---------------------------------------------------------------------------
// 5. Test shield operation (keeper message handler)
// ---------------------------------------------------------------------------

func TestShieldHandler(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Shield 100 tokens.
	resp, err := msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   100,
		Coins:    "stake",
		Blinding: fixedBlinding32(1),
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Verify that a commitment was stored.
	commitBytes, err := f.keeper.Commitments.Get(f.ctx, 0)
	require.NoError(t, err)
	require.NotEmpty(t, commitBytes, "commitment should be stored at index 0")

	// Verify that the Merkle root was stored.
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	rootResp, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	require.NotEmpty(t, rootResp.Root)

	// The stored root should be recognized as valid.
	rootValid, err := f.keeper.MerkleRoots.Has(f.ctx, rootResp.Root)
	require.NoError(t, err)
	require.True(t, rootValid, "the root after shield should be stored as valid")
}

func TestShieldHandlerZeroAmount(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Shielding zero tokens should fail.
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   0,
		Coins:    "stake",
		Blinding: fixedBlinding32(2),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "amount must be greater than zero")
}

func TestShieldHandlerMultiple(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Shield twice and verify both commitments are stored with different roots.
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   100,
		Coins:    "stake",
		Blinding: fixedBlinding32(3),
	})
	require.NoError(t, err)

	queryServer := keeper.NewQueryServerImpl(f.keeper)
	rootResp1, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)

	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   200,
		Coins:    "stake",
		Blinding: fixedBlinding32(4),
	})
	require.NoError(t, err)

	rootResp2, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)

	// Roots should differ after the second shield.
	require.NotEqual(t, rootResp1.Root, rootResp2.Root,
		"Merkle root should change after a second shield")

	// Both roots should be recognized as valid historical roots.
	root1Valid, err := f.keeper.MerkleRoots.Has(f.ctx, rootResp1.Root)
	require.NoError(t, err)
	require.True(t, root1Valid)

	root2Valid, err := f.keeper.MerkleRoots.Has(f.ctx, rootResp2.Root)
	require.NoError(t, err)
	require.True(t, root2Valid)
}

// ---------------------------------------------------------------------------
// 6. Test proof generation and verification (UnshieldCircuit end-to-end)
// ---------------------------------------------------------------------------

// TestUnshieldProofGenAndVerify exercises the full cycle:
// compute commitment, insert into merkle tree, get proof, build circuit
// assignment, generate Groth16 proof, verify it.
func TestUnshieldProofGenAndVerify(t *testing.T) {
	// --- Parameters ---
	amount := big.NewInt(500)
	blinding := big.NewInt(12345)
	secret := big.NewInt(67890)

	// 1. Compute commitment = MiMC(amount, blinding).
	commitment := merkle.MiMCHashPair(amount, blinding)

	// 2. Compute nullifier = MiMC(secret, commitment).
	nullifier := merkle.MiMCHashPair(secret, commitment)

	// 3. Insert commitment into the off-chain Merkle tree.
	tree := merkle.NewTree()
	leafIdx, err := tree.Insert(commitment)
	require.NoError(t, err)
	require.Equal(t, uint64(0), leafIdx)

	root := tree.Root()

	// 4. Get the Merkle proof.
	mProof, err := tree.GetProof(leafIdx)
	require.NoError(t, err)

	// Sanity-check the proof off-chain.
	require.True(t, merkle.VerifyProof(commitment, mProof, root))

	// 5. Trusted setup for the unshield circuit.
	pk, vk, cs, err := circuit.SetupUnshield()
	require.NoError(t, err)

	// 6. Build the full witness assignment.
	var assignment circuit.UnshieldCircuit
	assignment.Nullifier = nullifier
	assignment.Commitment = commitment
	assignment.Amount = amount
	assignment.MerkleRoot = root
	assignment.Blinding = blinding
	assignment.Secret = secret

	for i := 0; i < circuit.MerkleTreeDepth; i++ {
		assignment.MerklePath[i] = mProof.Path[i]
		assignment.MerkleIndices[i] = mProof.Indices[i]
	}

	// 7. Generate proof.
	proof, err := circuit.GenerateUnshieldProof(cs, pk, &assignment)
	require.NoError(t, err)
	require.NotNil(t, proof)

	// 8. Extract public witness and verify.
	publicAssignment := circuit.UnshieldCircuit{
		Nullifier:  nullifier,
		Commitment: commitment,
		Amount:     amount,
		MerkleRoot: root,
	}
	publicWitness, err := frontend.NewWitness(&publicAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	require.NoError(t, err)

	err = circuit.VerifyUnshieldProof(vk, proof, publicWitness)
	require.NoError(t, err, "valid proof should verify successfully")

	// 9. Verify that a tampered public input causes verification to fail.
	badAssignment := circuit.UnshieldCircuit{
		Nullifier:  nullifier,
		Commitment: commitment,
		Amount:     new(big.Int).Add(amount, big.NewInt(1)), // tampered amount
		MerkleRoot: root,
	}
	badWitness, err := frontend.NewWitness(&badAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	require.NoError(t, err)

	err = circuit.VerifyUnshieldProof(vk, proof, badWitness)
	require.Error(t, err, "proof should not verify with tampered amount")
}

// ---------------------------------------------------------------------------
// 6b. Test proof serialization round-trip
// ---------------------------------------------------------------------------

func TestProofSerializationRoundTrip(t *testing.T) {
	amount := big.NewInt(100)
	blinding := big.NewInt(42)
	secret := big.NewInt(99)

	commitment := merkle.MiMCHashPair(amount, blinding)
	nullifier := merkle.MiMCHashPair(secret, commitment)

	tree := merkle.NewTree()
	leafIdx, err := tree.Insert(commitment)
	require.NoError(t, err)
	root := tree.Root()
	mProof, err := tree.GetProof(leafIdx)
	require.NoError(t, err)

	pk, vk, cs, err := circuit.SetupUnshield()
	require.NoError(t, err)

	var assignment circuit.UnshieldCircuit
	assignment.Nullifier = nullifier
	assignment.Commitment = commitment
	assignment.Amount = amount
	assignment.MerkleRoot = root
	assignment.Blinding = blinding
	assignment.Secret = secret
	for i := 0; i < circuit.MerkleTreeDepth; i++ {
		assignment.MerklePath[i] = mProof.Path[i]
		assignment.MerkleIndices[i] = mProof.Indices[i]
	}

	proof, err := circuit.GenerateUnshieldProof(cs, pk, &assignment)
	require.NoError(t, err)

	// Serialize and deserialize the proof.
	proofBytes, err := circuit.SerializeProof(proof)
	require.NoError(t, err)
	require.True(t, len(proofBytes) > 0)

	proof2, err := circuit.DeserializeProof(proofBytes)
	require.NoError(t, err)
	require.NotNil(t, proof2)

	// The deserialized proof should still verify.
	publicAssignment := circuit.UnshieldCircuit{
		Nullifier:  nullifier,
		Commitment: commitment,
		Amount:     amount,
		MerkleRoot: root,
	}
	publicWitness, err := frontend.NewWitness(&publicAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	require.NoError(t, err)

	err = groth16.Verify(proof2, vk, publicWitness)
	require.NoError(t, err, "deserialized proof should still verify")
}

// ---------------------------------------------------------------------------
// 7. Test nullifier double-spend prevention
// ---------------------------------------------------------------------------

func TestNullifierDoubleSpendPrevention(t *testing.T) {
	f := initFixtureWithBank(t)

	nullifierHex := "abcdef0123456789"

	// Initially, the nullifier should not exist.
	exists, err := f.keeper.Nullifiers.Has(f.ctx, nullifierHex)
	require.NoError(t, err)
	require.False(t, exists)

	// Mark nullifier as spent.
	err = f.keeper.Nullifiers.Set(f.ctx, nullifierHex, true)
	require.NoError(t, err)

	// Now it should exist.
	exists, err = f.keeper.Nullifiers.Has(f.ctx, nullifierHex)
	require.NoError(t, err)
	require.True(t, exists)

	// Another nullifier that was never set should not exist.
	exists2, err := f.keeper.Nullifiers.Has(f.ctx, "ffffffffffff")
	require.NoError(t, err)
	require.False(t, exists2)
}

// TestNullifierDoubleSpendViaQuery tests double-spend detection through
// the query server, simulating what an on-chain handler would check.
func TestNullifierDoubleSpendViaQuery(t *testing.T) {
	f := initFixtureWithBank(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	nullifierHex := "deadbeef12345678"

	// Query before setting - should not exist.
	resp, err := queryServer.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{
		Nullifier: nullifierHex,
	})
	require.NoError(t, err)
	require.False(t, resp.Exists)

	// Simulate spending: set the nullifier.
	err = f.keeper.Nullifiers.Set(f.ctx, nullifierHex, true)
	require.NoError(t, err)

	// Query after setting - should exist.
	resp, err = queryServer.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{
		Nullifier: nullifierHex,
	})
	require.NoError(t, err)
	require.True(t, resp.Exists, "nullifier should be reported as existing after being set")
}

// ---------------------------------------------------------------------------
// 8. Test Merkle root query
// ---------------------------------------------------------------------------

func TestMerkleRootQueryEmpty(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	// Query root on an empty tree. The root should be the zero-hash of depth 32.
	resp, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	require.NotEmpty(t, resp.Root)

	// Verify it matches the expected empty tree root from an off-chain tree.
	offChainTree := merkle.NewTree()
	expectedRootHex := offChainTree.RootHex()

	// The on-chain empty root (computed via getZeroHashes) and the off-chain
	// empty root (computed by merkle.NewTree) should be the same.
	require.Equal(t, expectedRootHex, resp.Root,
		"empty tree root from keeper should match off-chain empty tree root")
}

func TestMerkleRootQueryAfterShield(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Get the root before shield.
	rootBefore, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)

	// Shield tokens.
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   50,
		Coins:    "stake",
		Blinding: fixedBlinding32(5),
	})
	require.NoError(t, err)

	// Get the root after shield.
	rootAfter, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)

	require.NotEqual(t, rootBefore.Root, rootAfter.Root,
		"Merkle root should change after shield operation")
}

// TestMerkleRootConsistencyOnAndOffChain verifies that the on-chain Merkle
// tree root matches an independently computed off-chain Merkle tree root
// when the same commitment is inserted.
func TestMerkleRootConsistencyOnAndOffChain(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Shield operation: commitment = MiMC(amount, blinding) with test blinding.
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   100,
		Coins:    "stake",
		Blinding: fixedBlinding32(6),
	})
	require.NoError(t, err)

	// Read back the stored commitment bytes.
	commitBytes, err := f.keeper.Commitments.Get(f.ctx, 0)
	require.NoError(t, err)
	onChainCommitment := new(big.Int).SetBytes(commitBytes)

	// Compute the same commitment off-chain.
	expectedCommitment := merkle.MiMCHashPair(big.NewInt(100), new(big.Int).SetUint64(6))
	require.Equal(t, 0, expectedCommitment.Cmp(onChainCommitment),
		"on-chain commitment should match off-chain computation")

	// Build an off-chain tree with the same commitment.
	offChainTree := merkle.NewTree()
	_, err = offChainTree.Insert(expectedCommitment)
	require.NoError(t, err)

	offChainRoot := offChainTree.Root()
	offChainRootHex := hex.EncodeToString(offChainRoot.Bytes())

	// Query on-chain root.
	rootResp, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)

	require.Equal(t, offChainRootHex, rootResp.Root,
		"on-chain Merkle root should match off-chain Merkle root for the same commitment")
}

// ---------------------------------------------------------------------------
// 9. Test nullifier exists query
// ---------------------------------------------------------------------------

func TestNullifierExistsQueryNilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	// Nil request should return an error.
	_, err := queryServer.NullifierExists(f.ctx, nil)
	require.Error(t, err)
}

func TestNullifierExistsQueryEmptyNullifier(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	// Empty nullifier string should return an error.
	_, err := queryServer.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{
		Nullifier: "",
	})
	require.Error(t, err)
}

func TestNullifierExistsQueryNotFound(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{
		Nullifier: "0123456789abcdef",
	})
	require.NoError(t, err)
	require.False(t, resp.Exists)
}

func TestNullifierExistsQueryFound(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	nfHex := "aabbccdd11223344"

	// Store the nullifier directly.
	err := f.keeper.Nullifiers.Set(f.ctx, nfHex, true)
	require.NoError(t, err)

	resp, err := queryServer.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{
		Nullifier: nfHex,
	})
	require.NoError(t, err)
	require.True(t, resp.Exists)
}

func TestMerkleRootQueryNilRequest(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	// Nil request should return an error.
	_, err := queryServer.MerkleRoot(f.ctx, nil)
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// Additional: multiple nullifiers tracked independently
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// End-to-end: Shield → generate proof → Unshield (on-chain verification)
// ---------------------------------------------------------------------------

// TestUnshieldHandlerE2E exercises the full on-chain unshield flow:
// 1. Trusted setup (generate VK/PK)
// 2. Inject VKs into keeper via SetVerifyingKeys
// 3. Shield tokens (creates a commitment in the on-chain Merkle tree)
// 4. Build off-chain Merkle tree matching on-chain state
// 5. Generate a Groth16 unshield proof
// 6. Submit an Unshield message and verify it succeeds on-chain
func TestUnshieldHandlerE2E(t *testing.T) {
	f := initFixtureWithBank(t)

	// --- 1. Trusted setup ---
	_, transferVK, _, err := circuit.SetupTransfer()
	require.NoError(t, err)
	unshieldPK, unshieldVK, unshieldCS, err := circuit.SetupUnshield()
	require.NoError(t, err)

	// --- 2. Inject VKs into the keeper ---
	f.keeper.SetVerifyingKeys(transferVK, unshieldVK)

	msgServer := keeper.NewMsgServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// --- 3. Shield 500 tokens ---
	shieldAmount := uint64(500)
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   shieldAmount,
		Coins:    "stake",
		Blinding: fixedBlinding32(7),
	})
	require.NoError(t, err)

	// Read back the commitment stored on-chain.
	commitBytes, err := f.keeper.Commitments.Get(f.ctx, 0)
	require.NoError(t, err)
	onChainCommitment := new(big.Int).SetBytes(commitBytes)

	// Keep assignment blinding aligned with the test shield input.
	amount := new(big.Int).SetUint64(shieldAmount)
	blinding := big.NewInt(7)
	expectedCommitment := merkle.MiMCHashPair(amount, blinding)
	require.Equal(t, 0, expectedCommitment.Cmp(onChainCommitment), "commitment mismatch")

	// --- 4. Build off-chain Merkle tree matching on-chain state ---
	offChainTree := merkle.NewTree()
	_, err = offChainTree.Insert(onChainCommitment)
	require.NoError(t, err)

	root := offChainTree.Root()
	mProof, err := offChainTree.GetProof(0)
	require.NoError(t, err)

	// Verify root matches on-chain.
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	rootResp, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	offChainRootHex := hex.EncodeToString(root.Bytes())
	require.Equal(t, offChainRootHex, rootResp.Root, "off-chain and on-chain roots must match")

	// --- 5. Generate the unshield proof ---
	secret := big.NewInt(67890) // arbitrary secret the owner knows
	nullifier := merkle.MiMCHashPair(secret, onChainCommitment)

	var assignment circuit.UnshieldCircuit
	assignment.Nullifier = nullifier
	assignment.Commitment = onChainCommitment
	assignment.Amount = amount
	assignment.MerkleRoot = root
	assignment.Blinding = blinding
	assignment.Secret = secret
	for i := 0; i < circuit.MerkleTreeDepth; i++ {
		assignment.MerklePath[i] = mProof.Path[i]
		assignment.MerkleIndices[i] = mProof.Indices[i]
	}

	proof, err := circuit.GenerateUnshieldProof(unshieldCS, unshieldPK, &assignment)
	require.NoError(t, err)

	proofBytes, err := circuit.SerializeProof(proof)
	require.NoError(t, err)

	// --- 6. Submit Unshield message ---
	_, err = msgServer.Unshield(f.ctx, &types.MsgUnshield{
		Creator:    creatorAddr,
		Amount:     shieldAmount,
		Proof:      hex.EncodeToString(proofBytes),
		Nullifier:  hex.EncodeToString(nullifier.Bytes()),
		Commitment: hex.EncodeToString(onChainCommitment.Bytes()),
		Root:       offChainRootHex,
	})
	require.NoError(t, err, "unshield should succeed with a valid proof")

	// Verify the nullifier was marked as spent.
	exists, err := f.keeper.Nullifiers.Has(f.ctx, hex.EncodeToString(nullifier.Bytes()))
	require.NoError(t, err)
	require.True(t, exists, "nullifier should be marked spent after unshield")

	// Attempting to re-use the same nullifier should fail (double-spend).
	_, err = msgServer.Unshield(f.ctx, &types.MsgUnshield{
		Creator:    creatorAddr,
		Amount:     shieldAmount,
		Proof:      hex.EncodeToString(proofBytes),
		Nullifier:  hex.EncodeToString(nullifier.Bytes()),
		Commitment: hex.EncodeToString(onChainCommitment.Bytes()),
		Root:       offChainRootHex,
	})
	require.Error(t, err, "double-spend should be rejected")
	require.Contains(t, err.Error(), "nullifier")
}

// ---------------------------------------------------------------------------
// 10. Test range proof enforcement
// ---------------------------------------------------------------------------

// TestRangeProofEnforcement verifies that the UnshieldCircuit rejects amounts
// that exceed 2^64. This confirms the range proof constraints are active.
func TestRangeProofEnforcement(t *testing.T) {
	// Setup keys for the unshield circuit (includes range proof constraints).
	pk, _, cs, err := circuit.SetupUnshield()
	require.NoError(t, err)

	// Use an amount that exceeds 2^64 (2^65).
	overflowAmount := new(big.Int).Lsh(big.NewInt(1), 65)
	blinding := big.NewInt(12345)
	secret := big.NewInt(67890)

	commitment := merkle.MiMCHashPair(overflowAmount, blinding)
	nullifier := merkle.MiMCHashPair(secret, commitment)

	tree := merkle.NewTree()
	leafIdx, err := tree.Insert(commitment)
	require.NoError(t, err)

	root := tree.Root()
	mProof, err := tree.GetProof(leafIdx)
	require.NoError(t, err)

	var assignment circuit.UnshieldCircuit
	assignment.Nullifier = nullifier
	assignment.Commitment = commitment
	assignment.Amount = overflowAmount
	assignment.MerkleRoot = root
	assignment.Blinding = blinding
	assignment.Secret = secret
	for i := 0; i < circuit.MerkleTreeDepth; i++ {
		assignment.MerklePath[i] = mProof.Path[i]
		assignment.MerkleIndices[i] = mProof.Indices[i]
	}

	// Proof generation should fail because the amount exceeds 2^64.
	_, err = circuit.GenerateUnshieldProof(cs, pk, &assignment)
	require.Error(t, err, "proof generation should fail for amount exceeding 2^64")
}

func TestMultipleNullifiersTrackedIndependently(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	nf1 := "aaaa1111"
	nf2 := "bbbb2222"
	nf3 := "cccc3333"

	// Set nf1 and nf2 as spent.
	require.NoError(t, f.keeper.Nullifiers.Set(f.ctx, nf1, true))
	require.NoError(t, f.keeper.Nullifiers.Set(f.ctx, nf2, true))

	// nf1 exists.
	resp, err := queryServer.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{Nullifier: nf1})
	require.NoError(t, err)
	require.True(t, resp.Exists)

	// nf2 exists.
	resp, err = queryServer.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{Nullifier: nf2})
	require.NoError(t, err)
	require.True(t, resp.Exists)

	// nf3 does not exist.
	resp, err = queryServer.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{Nullifier: nf3})
	require.NoError(t, err)
	require.False(t, resp.Exists)
}

// ---------------------------------------------------------------------------
// 11. Test Unshield with historical root (root changes between proof gen and submission)
// ---------------------------------------------------------------------------

// TestUnshieldWithHistoricalRoot verifies that an unshield proof generated
// against root1 still succeeds even after the on-chain root has moved to root2
// (because of a subsequent shield), as long as root1 is in the historical
// MerkleRoots store.
func TestUnshieldWithHistoricalRoot(t *testing.T) {
	f := initFixtureWithBank(t)

	// --- 1. Trusted setup ---
	_, transferVK, _, err := circuit.SetupTransfer()
	require.NoError(t, err)
	unshieldPK, unshieldVK, unshieldCS, err := circuit.SetupUnshield()
	require.NoError(t, err)

	f.keeper.SetVerifyingKeys(transferVK, unshieldVK)

	msgServer := keeper.NewMsgServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// --- 2. Shield 500 tokens → root1 ---
	shieldAmount := uint64(500)
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   shieldAmount,
		Coins:    "stake",
		Blinding: fixedBlinding32(8),
	})
	require.NoError(t, err)

	// Capture root1 (the root after the first shield).
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	rootResp1, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	root1Hex := rootResp1.Root

	// Read back commitment from on-chain.
	commitBytes, err := f.keeper.Commitments.Get(f.ctx, 0)
	require.NoError(t, err)
	onChainCommitment := new(big.Int).SetBytes(commitBytes)

	// Build off-chain tree matching root1.
	offChainTree := merkle.NewTree()
	_, err = offChainTree.Insert(onChainCommitment)
	require.NoError(t, err)
	root1 := offChainTree.Root()
	offChainRoot1Hex := hex.EncodeToString(root1.Bytes())
	require.Equal(t, root1Hex, offChainRoot1Hex)

	mProof, err := offChainTree.GetProof(0)
	require.NoError(t, err)

	// --- 3. Generate unshield proof against root1 ---
	amount := new(big.Int).SetUint64(shieldAmount)
	blinding := big.NewInt(8)
	secret := big.NewInt(67890)
	nullifier := merkle.MiMCHashPair(secret, onChainCommitment)

	var assignment circuit.UnshieldCircuit
	assignment.Nullifier = nullifier
	assignment.Commitment = onChainCommitment
	assignment.Amount = amount
	assignment.MerkleRoot = root1
	assignment.Blinding = blinding
	assignment.Secret = secret
	for i := 0; i < circuit.MerkleTreeDepth; i++ {
		assignment.MerklePath[i] = mProof.Path[i]
		assignment.MerkleIndices[i] = mProof.Indices[i]
	}

	proof, err := circuit.GenerateUnshieldProof(unshieldCS, unshieldPK, &assignment)
	require.NoError(t, err)

	proofBytes, err := circuit.SerializeProof(proof)
	require.NoError(t, err)

	// --- 4. Shield 200 more tokens → root changes to root2 ---
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   200,
		Coins:    "stake",
		Blinding: fixedBlinding32(9),
	})
	require.NoError(t, err)

	// Verify the current root is now different from root1.
	rootResp2, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	require.NotEqual(t, root1Hex, rootResp2.Root, "current root should differ from root1 after second shield")

	// --- 5. Submit Unshield with Root: root1 → should succeed ---
	_, err = msgServer.Unshield(f.ctx, &types.MsgUnshield{
		Creator:    creatorAddr,
		Amount:     shieldAmount,
		Proof:      hex.EncodeToString(proofBytes),
		Nullifier:  hex.EncodeToString(nullifier.Bytes()),
		Commitment: hex.EncodeToString(onChainCommitment.Bytes()),
		Root:       root1Hex,
	})
	require.NoError(t, err, "unshield with historical root1 should succeed")

	// Verify nullifier is spent.
	exists, err := f.keeper.Nullifiers.Has(f.ctx, hex.EncodeToString(nullifier.Bytes()))
	require.NoError(t, err)
	require.True(t, exists, "nullifier should be marked spent")
}

// ---------------------------------------------------------------------------
// 12. Test Unshield rejects empty root
// ---------------------------------------------------------------------------

func TestUnshieldRejectsEmptyRoot(t *testing.T) {
	f := initFixtureWithBank(t)

	_, transferVK, _, err := circuit.SetupTransfer()
	require.NoError(t, err)
	_, unshieldVK, _, err := circuit.SetupUnshield()
	require.NoError(t, err)

	f.keeper.SetVerifyingKeys(transferVK, unshieldVK)

	msgServer := keeper.NewMsgServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Empty root falls through to latest computed root; with a bad proof the
	// handler will fail at proof deserialization since "aabbccdd" is too short.
	_, err = msgServer.Unshield(f.ctx, &types.MsgUnshield{
		Creator:    creatorAddr,
		Amount:     100,
		Proof:      "aabbccdd",
		Nullifier:  "11223344",
		Commitment: "55667788",
		Root:       "",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "deserialize proof")
}

// ---------------------------------------------------------------------------
// 13. Test Unshield rejects unknown root
// ---------------------------------------------------------------------------

func TestUnshieldRejectsUnknownRoot(t *testing.T) {
	f := initFixtureWithBank(t)

	_, transferVK, _, err := circuit.SetupTransfer()
	require.NoError(t, err)
	_, unshieldVK, _, err := circuit.SetupUnshield()
	require.NoError(t, err)

	f.keeper.SetVerifyingKeys(transferVK, unshieldVK)

	msgServer := keeper.NewMsgServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	_, err = msgServer.Unshield(f.ctx, &types.MsgUnshield{
		Creator:    creatorAddr,
		Amount:     100,
		Proof:      "aabbccdd",
		Nullifier:  "11223344",
		Commitment: "55667788",
		Root:       "deadbeefdeadbeefdeadbeefdeadbeef",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "not recognized in root history")
}

// ---------------------------------------------------------------------------
// View Key / Selective Disclosure tests
// ---------------------------------------------------------------------------

func TestViewKeyCircuitCompile(t *testing.T) {
	cs, err := circuit.CompileViewKeyCircuit()
	require.NoError(t, err)
	require.NotNil(t, cs)
	t.Logf("ViewKeyCircuit compiled: %d constraints", cs.GetNbConstraints())
}

func TestViewKeyProofGenAndVerify(t *testing.T) {
	// 1. Setup the view key circuit.
	pk, vk, cs, err := circuit.SetupViewKey()
	require.NoError(t, err)

	// 2. Choose amount and blinding, compute commitment = MiMC(amount, blinding).
	amount := big.NewInt(500)
	blinding := big.NewInt(999999)

	// Compute MiMC commitment off-chain.
	commitment := offChainMiMCHash(amount, blinding)
	t.Logf("Commitment = %s", commitment.String())

	// 3. Create assignment and generate proof.
	assignment := &circuit.ViewKeyCircuit{
		Commitment: commitment,
		Amount:     amount,
		Blinding:   blinding,
	}
	proof, err := circuit.GenerateViewKeyProof(cs, pk, assignment)
	require.NoError(t, err)

	// 4. Build public witness and verify.
	publicAssignment := &circuit.ViewKeyCircuit{
		Commitment: commitment,
		Amount:     amount,
	}
	publicWitness, err := frontend.NewWitness(publicAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	require.NoError(t, err)

	err = circuit.VerifyViewKeyProof(vk, proof, publicWitness)
	require.NoError(t, err, "valid proof should verify")

	// 5. Tamper amount → verify should fail.
	tamperedAssignment := &circuit.ViewKeyCircuit{
		Commitment: commitment,
		Amount:     big.NewInt(501), // wrong amount
	}
	tamperedWitness, err := frontend.NewWitness(tamperedAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	require.NoError(t, err)

	err = circuit.VerifyViewKeyProof(vk, proof, tamperedWitness)
	require.Error(t, err, "tampered amount should fail verification")
}

func TestRegisterViewKeySuccess(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	commitmentHex := "abcdef1234567890"
	encryptedNote := "encrypted_note_data_here"

	// Register view key.
	resp, err := msgServer.RegisterViewKey(f.ctx, &types.MsgRegisterViewKey{
		Creator:       creatorAddr,
		CommitmentHex: commitmentHex,
		EncryptedNote: encryptedNote,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Query it back.
	qResp, err := queryServer.ViewKey(f.ctx, &types.QueryViewKeyRequest{
		CommitmentHex: commitmentHex,
	})
	require.NoError(t, err)
	require.True(t, qResp.Found)
	require.Equal(t, encryptedNote, qResp.EncryptedNote)
}

func TestRegisterViewKeyDuplicate(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	msg := &types.MsgRegisterViewKey{
		Creator:       creatorAddr,
		CommitmentHex: "abcdef1234567890",
		EncryptedNote: "note1",
	}

	// First registration succeeds.
	_, err = msgServer.RegisterViewKey(f.ctx, msg)
	require.NoError(t, err)

	// Second registration fails.
	_, err = msgServer.RegisterViewKey(f.ctx, msg)
	require.Error(t, err)
	require.ErrorContains(t, err, "view key already exists")
}

// ---------------------------------------------------------------------------
// Merkle tree refinement tests
// ---------------------------------------------------------------------------

func TestCommitmentIndexAfterShield(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Shield tokens.
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   100,
		Coins:    "stake",
		Blinding: fixedBlinding32(10),
	})
	require.NoError(t, err)

	// Read back the commitment hex.
	commitBytes, err := f.keeper.Commitments.Get(f.ctx, 0)
	require.NoError(t, err)
	commitmentHex := hex.EncodeToString(commitBytes)

	// Query CommitmentIndex.
	resp, err := queryServer.CommitmentIndex(f.ctx, &types.QueryCommitmentIndexRequest{
		CommitmentHex: commitmentHex,
	})
	require.NoError(t, err)
	require.True(t, resp.Found)
	require.Equal(t, uint64(0), resp.LeafIndex)
}

func TestCommitmentIndexNotFound(t *testing.T) {
	f := initFixtureWithBank(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.CommitmentIndex(f.ctx, &types.QueryCommitmentIndexRequest{
		CommitmentHex: "deadbeef12345678",
	})
	require.NoError(t, err)
	require.False(t, resp.Found)
}

func TestMerkleProofAfterShield(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Shield tokens.
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   100,
		Coins:    "stake",
		Blinding: fixedBlinding32(11),
	})
	require.NoError(t, err)

	// Read back the commitment hex.
	commitBytes, err := f.keeper.Commitments.Get(f.ctx, 0)
	require.NoError(t, err)
	commitmentHex := hex.EncodeToString(commitBytes)

	// Query MerkleProof.
	resp, err := queryServer.MerkleProof(f.ctx, &types.QueryMerkleProofRequest{
		CommitmentHex: commitmentHex,
	})
	require.NoError(t, err)
	require.True(t, resp.Found)
	require.Equal(t, uint64(0), resp.LeafIndex)
	require.Len(t, resp.Path, 32, "Merkle proof path should have 32 elements")
	require.Len(t, resp.Indices, 32, "Merkle proof indices should have 32 elements")
	require.NotEmpty(t, resp.Root)

	// Verify the root matches the on-chain root.
	rootResp, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	require.Equal(t, rootResp.Root, resp.Root)

	// Verify the proof off-chain: reconstruct root from leaf + proof.
	leaf := new(big.Int).SetBytes(commitBytes)
	current := leaf
	for level := 0; level < 32; level++ {
		siblingBytes, err := hex.DecodeString(resp.Path[level])
		require.NoError(t, err)
		sibling := new(big.Int).SetBytes(siblingBytes)
		if resp.Indices[level] == 0 {
			// current is left, sibling is right
			current = merkle.MiMCHashPair(current, sibling)
		} else {
			// current is right, sibling is left
			current = merkle.MiMCHashPair(sibling, current)
		}
	}
	reconstructedRootHex := hex.EncodeToString(current.Bytes())
	require.Equal(t, resp.Root, reconstructedRootHex, "reconstructed root should match")
}

func TestMerkleProofNotFound(t *testing.T) {
	f := initFixtureWithBank(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.MerkleProof(f.ctx, &types.QueryMerkleProofRequest{
		CommitmentHex: "deadbeef12345678",
	})
	require.NoError(t, err)
	require.False(t, resp.Found)
}

func TestTreeStatsEmpty(t *testing.T) {
	f := initFixtureWithBank(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	resp, err := queryServer.TreeStats(f.ctx, &types.QueryTreeStatsRequest{})
	require.NoError(t, err)
	require.Equal(t, uint64(0), resp.LeafCount)
	require.Equal(t, uint32(32), resp.TreeDepth)
	require.NotEmpty(t, resp.CurrentRoot)
}

func TestTreeStatsAfterShields(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Shield twice.
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{Creator: creatorAddr, Amount: 100, Coins: "stake", Blinding: fixedBlinding32(12)})
	require.NoError(t, err)
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{Creator: creatorAddr, Amount: 200, Coins: "stake", Blinding: fixedBlinding32(13)})
	require.NoError(t, err)

	resp, err := queryServer.TreeStats(f.ctx, &types.QueryTreeStatsRequest{})
	require.NoError(t, err)
	require.Equal(t, uint64(2), resp.LeafCount)
	require.Equal(t, uint32(32), resp.TreeDepth)
	require.NotEmpty(t, resp.CurrentRoot)
}

// ---------------------------------------------------------------------------
// Batch verification tests
// ---------------------------------------------------------------------------

// TestBatchVerifyProofs tests the circuit-level batch verify function directly.
func TestBatchVerifyProofs(t *testing.T) {
	// Setup transfer circuit keys.
	transferPK, transferVK, transferCS, err := circuit.SetupTransfer()
	require.NoError(t, err)

	// Create two valid transfer proofs.
	tree := merkle.NewTree()

	// Create 4 UTXOs (2 per transfer) with matching amounts.
	type utxo struct {
		amount, blinding, secret *big.Int
		commitment               *big.Int
		leafIdx                  uint64
	}

	createUTXO := func(amount, blinding, secret int64) utxo {
		a := big.NewInt(amount)
		b := big.NewInt(blinding)
		s := big.NewInt(secret)
		c := merkle.MiMCHashPair(a, b)
		idx, err := tree.Insert(c)
		require.NoError(t, err)
		return utxo{a, b, s, c, idx}
	}

	// UTXOs for transfer 1: spend u0+u1 (300+200=500) → create new (250+250)
	u0 := createUTXO(300, 1001, 2001)
	u1 := createUTXO(200, 1002, 2002)
	// UTXOs for transfer 2: spend u2+u3 (400+100=500) → create new (350+150)
	u2 := createUTXO(400, 1003, 2003)
	u3 := createUTXO(100, 1004, 2004)

	root := tree.Root()

	makeProof := func(old0, old1 utxo, newAmt0, newAmt1 int64) (groth16.Proof, witness.Witness) {
		newBlinding0 := big.NewInt(5001)
		newBlinding1 := big.NewInt(5002)
		newCommit0 := merkle.MiMCHashPair(big.NewInt(newAmt0), newBlinding0)
		newCommit1 := merkle.MiMCHashPair(big.NewInt(newAmt1), newBlinding1)
		null0 := merkle.MiMCHashPair(old0.secret, old0.commitment)
		null1 := merkle.MiMCHashPair(old1.secret, old1.commitment)

		var assignment circuit.TransferCircuit
		assignment.OldNullifiers[0] = null0
		assignment.OldNullifiers[1] = null1
		assignment.NewCommitments[0] = newCommit0
		assignment.NewCommitments[1] = newCommit1
		assignment.MerkleRoot = root
		assignment.OldAmounts[0] = old0.amount
		assignment.OldAmounts[1] = old1.amount
		assignment.OldBlindings[0] = old0.blinding
		assignment.OldBlindings[1] = old1.blinding
		assignment.OldSecrets[0] = old0.secret
		assignment.OldSecrets[1] = old1.secret
		assignment.NewAmounts[0] = big.NewInt(newAmt0)
		assignment.NewAmounts[1] = big.NewInt(newAmt1)
		assignment.NewBlindings[0] = newBlinding0
		assignment.NewBlindings[1] = newBlinding1

		for i, u := range []utxo{old0, old1} {
			proof, err := tree.GetProof(u.leafIdx)
			require.NoError(t, err)
			for j := 0; j < circuit.MerkleTreeDepth; j++ {
				assignment.MerklePaths[i][j] = proof.Path[j]
				assignment.MerkleIndices[i][j] = proof.Indices[j]
			}
		}

		proof, err := circuit.GenerateTransferProof(transferCS, transferPK, &assignment)
		require.NoError(t, err)

		var pubAssignment circuit.TransferCircuit
		pubAssignment.OldNullifiers[0] = null0
		pubAssignment.OldNullifiers[1] = null1
		pubAssignment.NewCommitments[0] = newCommit0
		pubAssignment.NewCommitments[1] = newCommit1
		pubAssignment.MerkleRoot = root

		pubWitness, err := frontend.NewWitness(&pubAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
		require.NoError(t, err)
		return proof, pubWitness
	}

	proof1, wit1 := makeProof(u0, u1, 250, 250)
	proof2, wit2 := makeProof(u2, u3, 350, 150)

	// Batch verify both valid proofs should succeed.
	err = circuit.BatchVerifyTransferProofs(transferVK, []groth16.Proof{proof1, proof2}, []witness.Witness{wit1, wit2})
	require.NoError(t, err, "batch verify with valid proofs should succeed")

	// Tamper one witness → batch verify should fail.
	// Create a bad witness with wrong root.
	var badAssignment circuit.TransferCircuit
	badAssignment.OldNullifiers[0] = big.NewInt(999)
	badAssignment.OldNullifiers[1] = big.NewInt(998)
	badAssignment.NewCommitments[0] = big.NewInt(997)
	badAssignment.NewCommitments[1] = big.NewInt(996)
	badAssignment.MerkleRoot = big.NewInt(1) // wrong root
	badWit, err := frontend.NewWitness(&badAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	require.NoError(t, err)

	err = circuit.BatchVerifyTransferProofs(transferVK, []groth16.Proof{proof1, proof2}, []witness.Witness{wit1, badWit})
	require.Error(t, err, "batch verify with tampered witness should fail")
}

// TestPrivateTransferSuccess exercises the single-transfer handler end-to-end.
func TestPrivateTransferSuccess(t *testing.T) {
	f := initFixtureWithBank(t)

	transferPK, transferVK, transferCS, err := circuit.SetupTransfer()
	require.NoError(t, err)
	_, unshieldVK, _, err := circuit.SetupUnshield()
	require.NoError(t, err)
	f.keeper.SetVerifyingKeys(transferVK, unshieldVK)

	msgServer := keeper.NewMsgServerImpl(f.keeper)
	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	require.NoError(t, f.keeper.Params.Set(f.ctx, types.DefaultParams()))

	// Shield two UTXOs that will be consumed by the private transfer.
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   250,
		Coins:    "stake",
		Blinding: fixedBlinding32(41),
	})
	require.NoError(t, err)
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  creatorAddr,
		Amount:   350,
		Coins:    "stake",
		Blinding: fixedBlinding32(42),
	})
	require.NoError(t, err)

	type utxoInfo struct {
		amount, blinding *big.Int
		commitment       *big.Int
		leafIdx          uint64
	}

	offChainTree := merkle.NewTree()
	utxos := make([]utxoInfo, 2)
	for i := uint64(0); i < 2; i++ {
		commitBytes, getErr := f.keeper.Commitments.Get(f.ctx, i)
		require.NoError(t, getErr)
		commit := new(big.Int).SetBytes(commitBytes)
		idx, insErr := offChainTree.Insert(commit)
		require.NoError(t, insErr)
		utxos[i] = utxoInfo{
			amount:     new(big.Int).SetUint64([]uint64{250, 350}[i]),
			blinding:   new(big.Int).SetUint64([]uint64{41, 42}[i]),
			commitment: commit,
			leafIdx:    idx,
		}
	}

	root := offChainTree.Root()
	secret0 := big.NewInt(11001)
	secret1 := big.NewInt(11002)
	newBlinding0 := big.NewInt(12001)
	newBlinding1 := big.NewInt(12002)
	newAmount0 := big.NewInt(300)
	newAmount1 := big.NewInt(300)
	newCommit0 := merkle.MiMCHashPair(newAmount0, newBlinding0)
	newCommit1 := merkle.MiMCHashPair(newAmount1, newBlinding1)
	null0 := merkle.MiMCHashPair(secret0, utxos[0].commitment)
	null1 := merkle.MiMCHashPair(secret1, utxos[1].commitment)

	var assignment circuit.TransferCircuit
	assignment.OldNullifiers[0] = null0
	assignment.OldNullifiers[1] = null1
	assignment.NewCommitments[0] = newCommit0
	assignment.NewCommitments[1] = newCommit1
	assignment.MerkleRoot = root
	assignment.OldAmounts[0] = utxos[0].amount
	assignment.OldAmounts[1] = utxos[1].amount
	assignment.OldBlindings[0] = utxos[0].blinding
	assignment.OldBlindings[1] = utxos[1].blinding
	assignment.OldSecrets[0] = secret0
	assignment.OldSecrets[1] = secret1
	assignment.NewAmounts[0] = newAmount0
	assignment.NewAmounts[1] = newAmount1
	assignment.NewBlindings[0] = newBlinding0
	assignment.NewBlindings[1] = newBlinding1

	for i, u := range utxos {
		proof, proofErr := offChainTree.GetProof(u.leafIdx)
		require.NoError(t, proofErr)
		for j := 0; j < circuit.MerkleTreeDepth; j++ {
			assignment.MerklePaths[i][j] = proof.Path[j]
			assignment.MerkleIndices[i][j] = proof.Indices[j]
		}
	}

	proof, err := circuit.GenerateTransferProof(transferCS, transferPK, &assignment)
	require.NoError(t, err)
	proofBytes, err := circuit.SerializeProof(proof)
	require.NoError(t, err)

	_, err = msgServer.PrivateTransfer(f.ctx, &types.MsgPrivateTransfer{
		Creator:        creatorAddr,
		Nullifiers:     hex.EncodeToString(null0.Bytes()) + "," + hex.EncodeToString(null1.Bytes()),
		Root:           hex.EncodeToString(root.Bytes()),
		Proof:          hex.EncodeToString(proofBytes),
		NewCommitments: hex.EncodeToString(newCommit0.Bytes()) + "," + hex.EncodeToString(newCommit1.Bytes()),
	})
	require.NoError(t, err)

	// Nullifiers should be marked as spent.
	exists, err := f.keeper.Nullifiers.Has(f.ctx, hex.EncodeToString(null0.Bytes()))
	require.NoError(t, err)
	require.True(t, exists)
	exists, err = f.keeper.Nullifiers.Has(f.ctx, hex.EncodeToString(null1.Bytes()))
	require.NoError(t, err)
	require.True(t, exists)

	// 2 original commitments + 2 new commitments.
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	statsResp, err := queryServer.TreeStats(f.ctx, &types.QueryTreeStatsRequest{})
	require.NoError(t, err)
	require.Equal(t, uint64(4), statsResp.LeafCount)
}

// TestBatchPrivateTransferSuccess tests a successful batch transfer via the handler.
func TestBatchPrivateTransferSuccess(t *testing.T) {
	f := initFixtureWithBank(t)

	// Setup keys.
	transferPK, transferVK, transferCS, err := circuit.SetupTransfer()
	require.NoError(t, err)
	_, unshieldVK, _, err := circuit.SetupUnshield()
	require.NoError(t, err)
	f.keeper.SetVerifyingKeys(transferVK, unshieldVK)

	msgServer := keeper.NewMsgServerImpl(f.keeper)
	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Shield 4 UTXOs.
	for i := 0; i < 4; i++ {
		_, err = msgServer.Shield(f.ctx, &types.MsgShield{
			Creator:  creatorAddr,
			Amount:   uint64(100 * (i + 1)), // 100, 200, 300, 400
			Coins:    "stake",
			Blinding: fixedBlinding32(uint64(20 + i)),
		})
		require.NoError(t, err)
	}

	// Build off-chain tree matching on-chain state.
	offChainTree := merkle.NewTree()
	type utxoInfo struct {
		amount, blinding *big.Int
		commitment       *big.Int
		leafIdx          uint64
	}
	utxos := make([]utxoInfo, 4)
	for i := uint64(0); i < 4; i++ {
		commitBytes, err := f.keeper.Commitments.Get(f.ctx, i)
		require.NoError(t, err)
		commit := new(big.Int).SetBytes(commitBytes)
		idx, err := offChainTree.Insert(commit)
		require.NoError(t, err)
		utxos[i] = utxoInfo{
			amount:     new(big.Int).SetUint64(uint64(100 * (i + 1))),
			blinding:   new(big.Int).SetUint64(uint64(20 + i)),
			commitment: commit,
			leafIdx:    idx,
		}
	}

	root := offChainTree.Root()
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	rootResp, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	require.Equal(t, hex.EncodeToString(root.Bytes()), rootResp.Root)

	// Build 2 transfers:
	// Transfer 1: spend utxos[0]+utxos[1] (100+200=300) → create 150+150
	// Transfer 2: spend utxos[2]+utxos[3] (300+400=700) → create 400+300
	buildTransferEntry := func(old0, old1 utxoInfo, newAmt0, newAmt1 int64, secret0, secret1 *big.Int, newBl0, newBl1 *big.Int) *types.BatchTransferEntry {
		newCommit0 := merkle.MiMCHashPair(big.NewInt(newAmt0), newBl0)
		newCommit1 := merkle.MiMCHashPair(big.NewInt(newAmt1), newBl1)
		null0 := merkle.MiMCHashPair(secret0, old0.commitment)
		null1 := merkle.MiMCHashPair(secret1, old1.commitment)

		var assignment circuit.TransferCircuit
		assignment.OldNullifiers[0] = null0
		assignment.OldNullifiers[1] = null1
		assignment.NewCommitments[0] = newCommit0
		assignment.NewCommitments[1] = newCommit1
		assignment.MerkleRoot = root
		assignment.OldAmounts[0] = old0.amount
		assignment.OldAmounts[1] = old1.amount
		assignment.OldBlindings[0] = old0.blinding
		assignment.OldBlindings[1] = old1.blinding
		assignment.OldSecrets[0] = secret0
		assignment.OldSecrets[1] = secret1
		assignment.NewAmounts[0] = big.NewInt(newAmt0)
		assignment.NewAmounts[1] = big.NewInt(newAmt1)
		assignment.NewBlindings[0] = newBl0
		assignment.NewBlindings[1] = newBl1

		for i, u := range []utxoInfo{old0, old1} {
			proof, err := offChainTree.GetProof(u.leafIdx)
			require.NoError(t, err)
			for j := 0; j < circuit.MerkleTreeDepth; j++ {
				assignment.MerklePaths[i][j] = proof.Path[j]
				assignment.MerkleIndices[i][j] = proof.Indices[j]
			}
		}

		proof, err := circuit.GenerateTransferProof(transferCS, transferPK, &assignment)
		require.NoError(t, err)
		proofBytes, err := circuit.SerializeProof(proof)
		require.NoError(t, err)

		return &types.BatchTransferEntry{
			OldCommitments: hex.EncodeToString(old0.commitment.Bytes()) + "," + hex.EncodeToString(old1.commitment.Bytes()),
			NewCommitments: hex.EncodeToString(newCommit0.Bytes()) + "," + hex.EncodeToString(newCommit1.Bytes()),
			Nullifiers:     hex.EncodeToString(null0.Bytes()) + "," + hex.EncodeToString(null1.Bytes()),
			Root:           hex.EncodeToString(root.Bytes()),
			Proof:          hex.EncodeToString(proofBytes),
		}
	}

	entry1 := buildTransferEntry(utxos[0], utxos[1], 150, 150, big.NewInt(9001), big.NewInt(9002), big.NewInt(6001), big.NewInt(6002))
	entry2 := buildTransferEntry(utxos[2], utxos[3], 400, 300, big.NewInt(9003), big.NewInt(9004), big.NewInt(6003), big.NewInt(6004))

	// Submit batch.
	_, err = msgServer.BatchPrivateTransfer(f.ctx, &types.MsgBatchPrivateTransfer{
		Creator:   creatorAddr,
		Transfers: []types.BatchTransferEntry{*entry1, *entry2},
	})
	require.NoError(t, err, "batch private transfer should succeed")

	// Verify nullifiers are spent.
	for _, entry := range []*types.BatchTransferEntry{entry1, entry2} {
		for _, nfHex := range strings.Split(entry.Nullifiers, ",") {
			exists, err := f.keeper.Nullifiers.Has(f.ctx, strings.TrimSpace(nfHex))
			require.NoError(t, err)
			require.True(t, exists, "nullifier should be spent")
		}
	}

	// Verify new commitments were added (4 original + 4 new = 8 total).
	statsResp, err := queryServer.TreeStats(f.ctx, &types.QueryTreeStatsRequest{})
	require.NoError(t, err)
	require.Equal(t, uint64(8), statsResp.LeafCount)
}

// TestBatchPrivateTransferDuplicateNullifier tests that duplicate nullifiers within a batch are rejected.
func TestBatchPrivateTransferDuplicateNullifier(t *testing.T) {
	f := initFixtureWithBank(t)

	transferPK, transferVK, transferCS, err := circuit.SetupTransfer()
	require.NoError(t, err)
	_, unshieldVK, _, err := circuit.SetupUnshield()
	require.NoError(t, err)
	f.keeper.SetVerifyingKeys(transferVK, unshieldVK)

	msgServer := keeper.NewMsgServerImpl(f.keeper)
	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Shield 2 UTXOs.
	for i := 0; i < 2; i++ {
		_, err = msgServer.Shield(f.ctx, &types.MsgShield{
			Creator:  creatorAddr,
			Amount:   uint64(200),
			Coins:    "stake",
			Blinding: fixedBlinding32(uint64(30 + i)),
		})
		require.NoError(t, err)
	}

	// Build off-chain tree.
	offChainTree := merkle.NewTree()
	type utxoInfo struct {
		amount, blinding *big.Int
		commitment       *big.Int
		leafIdx          uint64
	}
	utxos := make([]utxoInfo, 2)
	for i := uint64(0); i < 2; i++ {
		commitBytes, err := f.keeper.Commitments.Get(f.ctx, i)
		require.NoError(t, err)
		commit := new(big.Int).SetBytes(commitBytes)
		idx, err := offChainTree.Insert(commit)
		require.NoError(t, err)
		utxos[i] = utxoInfo{
			amount:     big.NewInt(200),
			blinding:   new(big.Int).SetUint64(uint64(30 + i)),
			commitment: commit,
			leafIdx:    idx,
		}
	}
	root := offChainTree.Root()

	// Build a valid transfer entry.
	secret0 := big.NewInt(7001)
	secret1 := big.NewInt(7002)
	null0 := merkle.MiMCHashPair(secret0, utxos[0].commitment)
	null1 := merkle.MiMCHashPair(secret1, utxos[1].commitment)
	newBl0, newBl1 := big.NewInt(8001), big.NewInt(8002)
	newCommit0 := merkle.MiMCHashPair(big.NewInt(200), newBl0)
	newCommit1 := merkle.MiMCHashPair(big.NewInt(200), newBl1)

	var assignment circuit.TransferCircuit
	assignment.OldNullifiers[0] = null0
	assignment.OldNullifiers[1] = null1
	assignment.NewCommitments[0] = newCommit0
	assignment.NewCommitments[1] = newCommit1
	assignment.MerkleRoot = root
	assignment.OldAmounts[0] = utxos[0].amount
	assignment.OldAmounts[1] = utxos[1].amount
	assignment.OldBlindings[0] = utxos[0].blinding
	assignment.OldBlindings[1] = utxos[1].blinding
	assignment.OldSecrets[0] = secret0
	assignment.OldSecrets[1] = secret1
	assignment.NewAmounts[0] = big.NewInt(200)
	assignment.NewAmounts[1] = big.NewInt(200)
	assignment.NewBlindings[0] = newBl0
	assignment.NewBlindings[1] = newBl1

	for i, u := range utxos {
		proof, err := offChainTree.GetProof(u.leafIdx)
		require.NoError(t, err)
		for j := 0; j < circuit.MerkleTreeDepth; j++ {
			assignment.MerklePaths[i][j] = proof.Path[j]
			assignment.MerkleIndices[i][j] = proof.Indices[j]
		}
	}

	proof, err := circuit.GenerateTransferProof(transferCS, transferPK, &assignment)
	require.NoError(t, err)
	proofBytes, err := circuit.SerializeProof(proof)
	require.NoError(t, err)

	// Create the same entry twice (same nullifiers) to trigger duplicate detection.
	entry := &types.BatchTransferEntry{
		OldCommitments: hex.EncodeToString(utxos[0].commitment.Bytes()) + "," + hex.EncodeToString(utxos[1].commitment.Bytes()),
		NewCommitments: hex.EncodeToString(newCommit0.Bytes()) + "," + hex.EncodeToString(newCommit1.Bytes()),
		Nullifiers:     hex.EncodeToString(null0.Bytes()) + "," + hex.EncodeToString(null1.Bytes()),
		Root:           hex.EncodeToString(root.Bytes()),
		Proof:          hex.EncodeToString(proofBytes),
	}

	_, err = msgServer.BatchPrivateTransfer(f.ctx, &types.MsgBatchPrivateTransfer{
		Creator:   creatorAddr,
		Transfers: []types.BatchTransferEntry{*entry, *entry},
	})
	require.Error(t, err, "duplicate nullifiers within batch should be rejected")
	require.Contains(t, err.Error(), "duplicate nullifier")
}

// TestBatchPrivateTransferEmpty tests that an empty batch is rejected.
func TestBatchPrivateTransferEmpty(t *testing.T) {
	f := initFixtureWithBank(t)

	_, transferVK, _, err := circuit.SetupTransfer()
	require.NoError(t, err)
	_, unshieldVK, _, err := circuit.SetupUnshield()
	require.NoError(t, err)
	f.keeper.SetVerifyingKeys(transferVK, unshieldVK)

	msgServer := keeper.NewMsgServerImpl(f.keeper)
	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	_, err = msgServer.BatchPrivateTransfer(f.ctx, &types.MsgBatchPrivateTransfer{
		Creator:   creatorAddr,
		Transfers: []types.BatchTransferEntry{},
	})
	require.Error(t, err, "empty batch should be rejected")
	require.Contains(t, err.Error(), "at least 1 transfer")
}

// TestBatchPrivateTransferTooLarge tests that a batch exceeding the maximum size is rejected.
func TestBatchPrivateTransferTooLarge(t *testing.T) {
	f := initFixtureWithBank(t)

	_, transferVK, _, err := circuit.SetupTransfer()
	require.NoError(t, err)
	_, unshieldVK, _, err := circuit.SetupUnshield()
	require.NoError(t, err)
	f.keeper.SetVerifyingKeys(transferVK, unshieldVK)

	msgServer := keeper.NewMsgServerImpl(f.keeper)
	creatorAddr, err := f.addressCodec.BytesToString([]byte("cosmos1testcreator00000"))
	require.NoError(t, err)

	// Create 17 dummy entries (exceeds max of 16).
	entries := make([]types.BatchTransferEntry, 17)

	_, err = msgServer.BatchPrivateTransfer(f.ctx, &types.MsgBatchPrivateTransfer{
		Creator:   creatorAddr,
		Transfers: entries,
	})
	require.Error(t, err, "batch exceeding max size should be rejected")
	require.Contains(t, err.Error(), "exceeds maximum")
}

func TestVerifyAmountProofOnChain(t *testing.T) {
	f := initFixtureWithBank(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	// Setup view key circuit and set VK on keeper.
	pk, vk, cs, err := circuit.SetupViewKey()
	require.NoError(t, err)
	f.keeper.SetViewKeyVerifyingKey(vk)

	// Compute commitment = MiMC(amount, blinding).
	amount := big.NewInt(1000)
	blinding := big.NewInt(777777)
	commitment := offChainMiMCHash(amount, blinding)
	commitmentHex := hex.EncodeToString(commitment.Bytes())

	// Generate proof off-chain.
	assignment := &circuit.ViewKeyCircuit{
		Commitment: commitment,
		Amount:     amount,
		Blinding:   blinding,
	}
	proof, err := circuit.GenerateViewKeyProof(cs, pk, assignment)
	require.NoError(t, err)

	// Serialize proof.
	proofBytes, err := circuit.SerializeProof(proof)
	require.NoError(t, err)

	// Verify via keeper query.
	resp, err := queryServer.VerifyAmountProof(f.ctx, &types.QueryVerifyAmountProofRequest{
		CommitmentHex: commitmentHex,
		Amount:        1000,
		Proof:         proofBytes,
	})
	require.NoError(t, err)
	require.True(t, resp.Valid, "valid proof should be accepted")

	// Verify with wrong amount fails.
	resp, err = queryServer.VerifyAmountProof(f.ctx, &types.QueryVerifyAmountProofRequest{
		CommitmentHex: commitmentHex,
		Amount:        999, // wrong
		Proof:         proofBytes,
	})
	require.NoError(t, err)
	require.False(t, resp.Valid, "wrong amount should fail")
}
