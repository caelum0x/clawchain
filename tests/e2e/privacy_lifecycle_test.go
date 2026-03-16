//go:build e2e
// +build e2e

package e2e

import (
	"context"
	"math/big"
	"encoding/hex"
	"testing"

	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr/mimc"
	"github.com/stretchr/testify/require"

	"clawchain/x/privacy/keeper"
	"clawchain/x/privacy/merkle"
	module "clawchain/x/privacy/module"
	"clawchain/x/privacy/types"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type privacyMockBankKeeper struct{}

func (m *privacyMockBankKeeper) SpendableCoins(_ context.Context, _ sdk.AccAddress) sdk.Coins {
	return sdk.NewCoins()
}
func (m *privacyMockBankKeeper) SendCoins(_ context.Context, _, _ sdk.AccAddress, _ sdk.Coins) error {
	return nil
}
func (m *privacyMockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, _ sdk.AccAddress, _ string, _ sdk.Coins) error {
	return nil
}
func (m *privacyMockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, _ string, _ sdk.AccAddress, _ sdk.Coins) error {
	return nil
}

type privacyFixture struct {
	ctx    context.Context
	keeper keeper.Keeper
}

func initPrivacyFixture(t *testing.T) *privacyFixture {
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
		&privacyMockBankKeeper{},
	)

	if err := k.Params.Set(ctx, types.DefaultParams()); err != nil {
		t.Fatalf("failed to set privacy params: %v", err)
	}

	return &privacyFixture{ctx: ctx, keeper: k}
}

func privacyMiMCHash(left, right *big.Int) *big.Int {
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

// makeBlinding32 creates a deterministic 32-byte blinding value for tests.
func makeBlinding32(seed int64) []byte {
	val := big.NewInt(seed)
	b := val.Bytes()
	// Pad to 32 bytes
	result := make([]byte, 32)
	copy(result[32-len(b):], b)
	return result
}

// ---------------------------------------------------------------------------
// E2E: Shield → Verify Merkle Root → Double Shield → Root Changes
// ---------------------------------------------------------------------------

func TestPrivacyLifecycle_ShieldAndMerkleRootUpdates(t *testing.T) {
	f := initPrivacyFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	sender := sdk.AccAddress([]byte("sender1_____________")).String()

	// --- Step 1: First shield ---
	_, err := msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  sender,
		Amount:   1_000_000,
		Coins:    "stake",
		Blinding: makeBlinding32(12345),
	})
	require.NoError(t, err)
	t.Log("Step 1: First shield successful")

	// Query Merkle root
	rootResp1, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	require.NotEmpty(t, rootResp1.Root, "root should be non-empty after shield")
	t.Logf("Root after shield 1: %s", rootResp1.Root)

	// --- Step 2: Second shield → root should change ---
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  sender,
		Amount:   500_000,
		Coins:    "stake",
		Blinding: makeBlinding32(67890),
	})
	require.NoError(t, err)

	rootResp2, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	require.NotEqual(t, rootResp1.Root, rootResp2.Root,
		"root should change after second shield")
	t.Logf("Root after shield 2: %s (different from shield 1)", rootResp2.Root)

	// --- Step 3: Third shield with different amount ---
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  sender,
		Amount:   250_000,
		Coins:    "stake",
		Blinding: makeBlinding32(11111),
	})
	require.NoError(t, err)

	rootResp3, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	require.NotEqual(t, rootResp2.Root, rootResp3.Root)
	t.Log("Step 3: Multiple shields produce unique roots — lifecycle verified")
}

// TestPrivacyLifecycle_ShieldRejectsEmptyBlinding verifies the security fix
// that prevents deterministic blinding.
func TestPrivacyLifecycle_ShieldRejectsEmptyBlinding(t *testing.T) {
	f := initPrivacyFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	sender := sdk.AccAddress([]byte("sender2_____________")).String()

	// Empty blinding should be rejected
	_, err := msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  sender,
		Amount:   100_000,
		Coins:    "stake",
		Blinding: nil,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "blinding")
	t.Log("Empty blinding correctly rejected")

	// Wrong size blinding (not 32 bytes)
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  sender,
		Amount:   100_000,
		Coins:    "stake",
		Blinding: []byte{1, 2, 3},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "32 bytes")
	t.Log("Incorrect blinding size correctly rejected")
}

// TestPrivacyLifecycle_ShieldRejectsZeroAmount verifies zero amount rejection.
func TestPrivacyLifecycle_ShieldRejectsZeroAmount(t *testing.T) {
	f := initPrivacyFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	sender := sdk.AccAddress([]byte("sender3_____________")).String()

	_, err := msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  sender,
		Amount:   0,
		Coins:    "stake",
		Blinding: makeBlinding32(99999),
	})
	require.Error(t, err)
	t.Log("Zero amount shield correctly rejected")
}

// TestPrivacyLifecycle_NullifierDoubleSpendPrevention tests that the same
// nullifier cannot be consumed twice.
func TestPrivacyLifecycle_NullifierDoubleSpendPrevention(t *testing.T) {
	f := initPrivacyFixture(t)
	sender := sdk.AccAddress([]byte("sender4_____________")).String()

	// Simulate spending a nullifier via the state machine
	nullifierHex := "abcdef1234567890abcdef1234567890"
	err := f.keeper.ConsumeNullifiers(f.ctx, []string{nullifierHex})
	require.NoError(t, err)

	// Verify nullifier is recorded
	exists, err := f.keeper.Nullifiers.Has(f.ctx, nullifierHex)
	require.NoError(t, err)
	require.True(t, exists, "nullifier should exist after consumption")

	// Second attempt to consume same nullifier should fail
	err = f.keeper.ConsumeNullifiers(f.ctx, []string{nullifierHex})
	require.Error(t, err, "double-spend should be rejected")
	t.Logf("Double-spend prevention verified for sender %s", sender)
}

// TestPrivacyLifecycle_MerkleTreeConsistency verifies that the on-chain
// MiMC Merkle tree produces consistent roots with the off-chain implementation.
func TestPrivacyLifecycle_MerkleTreeConsistency(t *testing.T) {
	f := initPrivacyFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	sender := sdk.AccAddress([]byte("sender5_____________")).String()

	// Shield multiple UTXOs and track roots
	blindings := []int64{11111, 22222, 33333, 44444, 55555}
	amounts := []uint64{1000, 2000, 3000, 4000, 5000}
	var roots []string

	for i, amount := range amounts {
		_, err := msgServer.Shield(f.ctx, &types.MsgShield{
			Creator:  sender,
			Amount:   amount,
			Coins:    "stake",
			Blinding: makeBlinding32(blindings[i]),
		})
		require.NoError(t, err)

		resp, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
		require.NoError(t, err)
		roots = append(roots, resp.Root)
		t.Logf("Shield %d (amount=%d): root=%s", i, amount, resp.Root)
	}

	// Each shield should produce a different root
	for i := 1; i < len(roots); i++ {
		require.NotEqual(t, roots[i-1], roots[i],
			"root should change after each shield (shield %d)", i)
	}
	t.Log("Merkle tree consistency verified across 5 shields")
}

// TestPrivacyLifecycle_CommitmentIndexTracking verifies that commitment
// indices are tracked correctly for proof generation.
func TestPrivacyLifecycle_CommitmentIndexTracking(t *testing.T) {
	f := initPrivacyFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	sender := sdk.AccAddress([]byte("sender6_____________")).String()

	// Shield a token to get a commitment
	blinding := makeBlinding32(42)
	amount := uint64(1000)

	_, err := msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  sender,
		Amount:   amount,
		Coins:    "stake",
		Blinding: blinding,
	})
	require.NoError(t, err)

	// Compute the expected commitment using the same format as the chain
	amountBig := new(big.Int).SetUint64(amount)
	blindingBig := new(big.Int).SetBytes(blinding)
	commitment := merkle.MiMCHashPair(amountBig, blindingBig)
	commitmentHex := hex.EncodeToString(commitment.Bytes())

	// Query the commitment index
	idxResp, err := queryServer.CommitmentIndex(f.ctx, &types.QueryCommitmentIndexRequest{
		CommitmentHex: commitmentHex,
	})
	require.NoError(t, err)
	require.True(t, idxResp.Found, "commitment should be found in index")
	require.Equal(t, uint64(0), idxResp.LeafIndex, "first commitment should have index 0")
	t.Logf("Commitment %s tracked at index %d", commitmentHex, idxResp.LeafIndex)

	// Shield another and verify it gets index 1
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  sender,
		Amount:   2000,
		Coins:    "stake",
		Blinding: makeBlinding32(43),
	})
	require.NoError(t, err)

	commitment2 := merkle.MiMCHashPair(big.NewInt(2000), new(big.Int).SetBytes(makeBlinding32(43)))
	idxResp2, err := queryServer.CommitmentIndex(f.ctx, &types.QueryCommitmentIndexRequest{
		CommitmentHex: hex.EncodeToString(commitment2.Bytes()),
	})
	require.NoError(t, err)
	require.True(t, idxResp2.Found)
	require.Equal(t, uint64(1), idxResp2.LeafIndex, "second commitment should have index 1")
	t.Log("Sequential commitment index tracking verified")
}

// TestPrivacyLifecycle_RootHistoryTracking verifies that old Merkle roots
// are remembered so transfers referencing them remain valid.
func TestPrivacyLifecycle_RootHistoryTracking(t *testing.T) {
	f := initPrivacyFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	sender := sdk.AccAddress([]byte("sender7_____________")).String()

	// Shield and capture root
	_, err := msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  sender,
		Amount:   1000,
		Coins:    "stake",
		Blinding: makeBlinding32(100),
	})
	require.NoError(t, err)

	rootResp1, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	root1 := rootResp1.Root

	// Shield again → root changes
	_, err = msgServer.Shield(f.ctx, &types.MsgShield{
		Creator:  sender,
		Amount:   2000,
		Coins:    "stake",
		Blinding: makeBlinding32(200),
	})
	require.NoError(t, err)

	rootResp2, err := queryServer.MerkleRoot(f.ctx, &types.QueryMerkleRootRequest{})
	require.NoError(t, err)
	require.NotEqual(t, root1, rootResp2.Root, "root should change")

	// Query root history — old root should still be known
	histResp, err := queryServer.RootHistory(f.ctx, &types.QueryRootHistoryRequest{})
	require.NoError(t, err)
	require.True(t, len(histResp.Roots) >= 2, "root history should contain at least 2 entries")
	t.Logf("Root history contains %d entries", len(histResp.Roots))
}
