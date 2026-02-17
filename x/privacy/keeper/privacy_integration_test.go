package keeper_test

import (
	"context"
	"encoding/hex"
	"math/big"
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
		Creator: creatorAddr,
		Amount:  100,
		Coins:   "stake",
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
		Creator: creatorAddr,
		Amount:  0,
		Coins:   "stake",
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
		Creator: creatorAddr,
		Amount:  100,
		Coins:   "stake",
	})
	require.NoError(t, err)

	queryServer := keeper.NewQueryServerImpl(f.keeper)
	rootResp1, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)

	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator: creatorAddr,
		Amount:  200,
		Coins:   "stake",
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
		Creator: creatorAddr,
		Amount:  50,
		Coins:   "stake",
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

	// Shield operation: the keeper computes commitment = MiMC(amount, blinding)
	// where blinding = commitmentCount + 1 = 0 + 1 = 1 for the first shield.
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator: creatorAddr,
		Amount:  100,
		Coins:   "stake",
	})
	require.NoError(t, err)

	// Read back the stored commitment bytes.
	commitBytes, err := f.keeper.Commitments.Get(f.ctx, 0)
	require.NoError(t, err)
	onChainCommitment := new(big.Int).SetBytes(commitBytes)

	// Compute the same commitment off-chain.
	// From msg_server_shield.go: amount=100, blinding=commitCount+1=1
	expectedCommitment := merkle.MiMCHashPair(big.NewInt(100), big.NewInt(1))
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
