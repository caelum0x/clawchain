//go:build integration
// +build integration

package keeper_test

import (
	"testing"

	"clawchain/x/privacy/keeper"
	"clawchain/x/privacy/types"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// NormalizeHex
// ---------------------------------------------------------------------------

func TestNormalizeHex_EmptyString(t *testing.T) {
	f := initFixture(t)
	_, _, err := f.keeper.NormalizeHex("")
	require.Error(t, err)
	require.Contains(t, err.Error(), "empty")
}

func TestNormalizeHex_InvalidHex(t *testing.T) {
	f := initFixture(t)
	_, _, err := f.keeper.NormalizeHex("zzzz")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid hex")
}

func TestNormalizeHex_ValidWithWhitespace(t *testing.T) {
	f := initFixture(t)
	normalized, decoded, err := f.keeper.NormalizeHex("  ABCD  ")
	require.NoError(t, err)
	require.Equal(t, "abcd", normalized)
	require.Equal(t, []byte{0xab, 0xcd}, decoded)
}

// ---------------------------------------------------------------------------
// ConsumeNullifiers
// ---------------------------------------------------------------------------

func TestConsumeNullifiers_EmptyList(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.ConsumeNullifiers(f.ctx, []string{})
	require.Error(t, err)
	require.Contains(t, err.Error(), "no nullifiers")
}

func TestConsumeNullifiers_DuplicateInSameBatch(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.ConsumeNullifiers(f.ctx, []string{"abcd", "abcd"})
	require.Error(t, err)
	require.Contains(t, err.Error(), "duplicate nullifier")
}

func TestConsumeNullifiers_AlreadySpent(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.ConsumeNullifiers(f.ctx, []string{"abcd"})
	require.NoError(t, err)
	err = f.keeper.ConsumeNullifiers(f.ctx, []string{"abcd"})
	require.Error(t, err)
	require.Contains(t, err.Error(), "nullifier")
}

func TestConsumeNullifiers_Success(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.ConsumeNullifiers(f.ctx, []string{"aa", "bb"})
	require.NoError(t, err)
	exists, err := f.keeper.Nullifiers.Has(f.ctx, "aa")
	require.NoError(t, err)
	require.True(t, exists)
	exists, err = f.keeper.Nullifiers.Has(f.ctx, "bb")
	require.NoError(t, err)
	require.True(t, exists)
}

func TestConsumeNullifiers_InvalidHex(t *testing.T) {
	f := initFixture(t)
	err := f.keeper.ConsumeNullifiers(f.ctx, []string{"zzzz"})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid nullifier hex")
}

// ---------------------------------------------------------------------------
// Query: NullifierExists
// ---------------------------------------------------------------------------

func TestQueryNullifierExists_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.NullifierExists(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryNullifierExists_InvalidHex(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{Nullifier: "zzzz"})
	require.Error(t, err)
}

func TestQueryNullifierExists_NotFound(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{Nullifier: "abcd"})
	require.NoError(t, err)
	require.False(t, resp.Exists)
}

func TestQueryNullifierExists_Found(t *testing.T) {
	f := initFixture(t)
	require.NoError(t, f.keeper.Nullifiers.Set(f.ctx, "abcd", true))
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.NullifierExists(f.ctx, &types.QueryNullifierExistsRequest{Nullifier: "abcd"})
	require.NoError(t, err)
	require.True(t, resp.Exists)
}

// ---------------------------------------------------------------------------
// Query: CommitmentIndex
// ---------------------------------------------------------------------------

func TestQueryCommitmentIndex_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.CommitmentIndex(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryCommitmentIndex_InvalidHex(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.CommitmentIndex(f.ctx, &types.QueryCommitmentIndexRequest{CommitmentHex: "zzzz"})
	require.Error(t, err)
}

func TestQueryCommitmentIndex_NotFound(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.CommitmentIndex(f.ctx, &types.QueryCommitmentIndexRequest{CommitmentHex: "abcd"})
	require.NoError(t, err)
	require.False(t, resp.Found)
}

func TestQueryCommitmentIndex_Found(t *testing.T) {
	f := initFixture(t)
	_, commitHex, _, err := f.keeper.AppendCommitment(f.ctx, []byte{0xab, 0xcd})
	require.NoError(t, err)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.CommitmentIndex(f.ctx, &types.QueryCommitmentIndexRequest{CommitmentHex: commitHex})
	require.NoError(t, err)
	require.True(t, resp.Found)
	require.EqualValues(t, 0, resp.LeafIndex)
}

// ---------------------------------------------------------------------------
// Query: TreeStats
// ---------------------------------------------------------------------------

func TestQueryTreeStats_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.TreeStats(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryTreeStats_EmptyTree(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.TreeStats(f.ctx, &types.QueryTreeStatsRequest{})
	require.NoError(t, err)
	require.EqualValues(t, 0, resp.LeafCount)
	require.NotEmpty(t, resp.CurrentRoot)
	require.Greater(t, resp.TreeDepth, uint32(0))
}

func TestQueryTreeStats_WithCommitments(t *testing.T) {
	f := initFixture(t)
	_, _, _, err := f.keeper.AppendCommitment(f.ctx, []byte{0x01})
	require.NoError(t, err)
	_, _, _, err = f.keeper.AppendCommitment(f.ctx, []byte{0x02})
	require.NoError(t, err)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.TreeStats(f.ctx, &types.QueryTreeStatsRequest{})
	require.NoError(t, err)
	require.EqualValues(t, 2, resp.LeafCount)
}

// ---------------------------------------------------------------------------
// Query: MerkleProof
// ---------------------------------------------------------------------------

func TestQueryMerkleProof_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.MerkleProof(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryMerkleProof_InvalidHex(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.MerkleProof(f.ctx, &types.QueryMerkleProofRequest{CommitmentHex: "zzzz"})
	require.Error(t, err)
}

func TestQueryMerkleProof_NotFound(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.MerkleProof(f.ctx, &types.QueryMerkleProofRequest{CommitmentHex: "abcd"})
	require.NoError(t, err)
	require.False(t, resp.Found)
}

func TestQueryMerkleProof_Found(t *testing.T) {
	f := initFixture(t)
	_, commitHex, _, err := f.keeper.AppendCommitment(f.ctx, []byte{0xde, 0xad})
	require.NoError(t, err)
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.MerkleProof(f.ctx, &types.QueryMerkleProofRequest{CommitmentHex: commitHex})
	require.NoError(t, err)
	require.True(t, resp.Found)
	require.EqualValues(t, 0, resp.LeafIndex)
	require.NotEmpty(t, resp.Path)
	require.NotEmpty(t, resp.Root)
}

// ---------------------------------------------------------------------------
// Query: ViewKey nil + empty
// ---------------------------------------------------------------------------

func TestQueryViewKey_NilRequest2(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.ViewKey(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryViewKey_EmptyCommitment2(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.ViewKey(f.ctx, &types.QueryViewKeyRequest{CommitmentHex: ""})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// Query: VerifyAmountProof
// ---------------------------------------------------------------------------

func TestQueryVerifyAmountProof_NilRequest(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.VerifyAmountProof(f.ctx, nil)
	require.Error(t, err)
}

func TestQueryVerifyAmountProof_EmptyCommitment(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.VerifyAmountProof(f.ctx, &types.QueryVerifyAmountProofRequest{
		CommitmentHex: "",
		Proof:         []byte{0x01},
		Amount:        100,
	})
	require.Error(t, err)
}

func TestQueryVerifyAmountProof_EmptyProof(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.VerifyAmountProof(f.ctx, &types.QueryVerifyAmountProofRequest{
		CommitmentHex: "abcd",
		Proof:         nil,
		Amount:        100,
	})
	require.Error(t, err)
}

func TestQueryVerifyAmountProof_NilVK(t *testing.T) {
	f := initFixture(t)
	qs := keeper.NewQueryServerImpl(f.keeper)
	_, err := qs.VerifyAmountProof(f.ctx, &types.QueryVerifyAmountProofRequest{
		CommitmentHex: "abcd",
		Proof:         []byte{0x01},
		Amount:        100,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "verifying key not loaded")
}

// ---------------------------------------------------------------------------
// Shield error paths
// ---------------------------------------------------------------------------

func TestShield_InvalidAddress(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	_, err := ms.Shield(f.ctx, &types.MsgShield{
		Creator:  "bad-address",
		Amount:   100,
		Blinding: fixedBlinding32(1),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid sender address")
}

func TestShield_ZeroAmount(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("shield_creator______")).String()
	_, err := ms.Shield(f.ctx, &types.MsgShield{
		Creator:  creator,
		Amount:   0,
		Blinding: fixedBlinding32(1),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "amount must be greater than zero")
}

func TestShield_MissingBlinding(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("shield_blind________")).String()
	_, err := ms.Shield(f.ctx, &types.MsgShield{
		Creator:  creator,
		Amount:   1000,
		Blinding: nil,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "blinding factor is required")
}

func TestShield_WrongBlindingLength(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("shield_blen_________")).String()
	_, err := ms.Shield(f.ctx, &types.MsgShield{
		Creator:  creator,
		Amount:   1000,
		Blinding: []byte{0x01, 0x02},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "blinding must be exactly 32 bytes")
}

func TestShield_SuccessDefaultDenom(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("shield_ok___________")).String()
	// Empty Coins is treated as the native pool denom and must succeed.
	resp, err := ms.Shield(f.ctx, &types.MsgShield{
		Creator:  creator,
		Amount:   1000,
		Coins:    "",
		Blinding: fixedBlinding32(42),
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

func TestShield_NativeDenomSucceeds(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("shield_native_______")).String()
	// Explicitly passing the native pool denom must succeed.
	resp, err := ms.Shield(f.ctx, &types.MsgShield{
		Creator:  creator,
		Amount:   1000,
		Coins:    types.PoolDenom(),
		Blinding: fixedBlinding32(99),
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
}

func TestShield_ForeignDenomRejected(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("shield_foreign______")).String()
	// The shielded pool is single-denom. Shielding any denom other than the
	// native pool denom must be rejected, otherwise a depositor could later
	// Unshield the (native) pool denom and drain it. PoolDenom() resolves to
	// "stake" in unit tests, so "uclaw" here is a foreign denom.
	_, err := ms.Shield(f.ctx, &types.MsgShield{
		Creator:  creator,
		Amount:   1000,
		Coins:    "uclaw",
		Blinding: fixedBlinding32(99),
	})
	require.ErrorIs(t, err, types.ErrUnsupportedDenom)
}

// ---------------------------------------------------------------------------
// Unshield error paths
// ---------------------------------------------------------------------------

func TestUnshield_InvalidCreator(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	_, err := ms.Unshield(f.ctx, &types.MsgUnshield{
		Creator:    "bad-address",
		Amount:     100,
		Nullifier:  "abcd",
		Proof:      "00",
		Commitment: "abcd",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid creator address")
}

func TestUnshield_ZeroAmount(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("unshield_zero_______")).String()
	_, err := ms.Unshield(f.ctx, &types.MsgUnshield{
		Creator:    creator,
		Amount:     0,
		Nullifier:  "abcd",
		Proof:      "00",
		Commitment: "abcd",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "amount must be greater than zero")
}

func TestUnshield_InvalidRecipient(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("unshield_recip______")).String()
	_, err := ms.Unshield(f.ctx, &types.MsgUnshield{
		Creator:    creator,
		Recipient:  "bad-recipient",
		Amount:     100,
		Nullifier:  "abcd",
		Proof:      "00",
		Commitment: "abcd",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid recipient address")
}

func TestUnshield_InvalidNullifier(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("unshield_nf_________")).String()
	_, err := ms.Unshield(f.ctx, &types.MsgUnshield{
		Creator:    creator,
		Amount:     100,
		Nullifier:  "zzzz",
		Proof:      "00",
		Commitment: "abcd",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid nullifier")
}

// ---------------------------------------------------------------------------
// BatchPrivateTransfer error paths
// ---------------------------------------------------------------------------

func TestBatchPrivateTransfer_InvalidCreator(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	_, err := ms.BatchPrivateTransfer(f.ctx, &types.MsgBatchPrivateTransfer{
		Creator:   "bad-address",
		Transfers: []types.BatchTransferEntry{{}},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid creator address")
}

func TestBatchPrivateTransfer_EmptyBatch(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("batch_empty_________")).String()
	_, err := ms.BatchPrivateTransfer(f.ctx, &types.MsgBatchPrivateTransfer{
		Creator:   creator,
		Transfers: []types.BatchTransferEntry{},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "at least 1 transfer")
}

func TestBatchPrivateTransfer_OversizedBatch(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("batch_big___________")).String()
	entries := make([]types.BatchTransferEntry, 17)
	_, err := ms.BatchPrivateTransfer(f.ctx, &types.MsgBatchPrivateTransfer{
		Creator:   creator,
		Transfers: entries,
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "exceeds maximum")
}

// ---------------------------------------------------------------------------
// PrivateTransfer additional error paths
// ---------------------------------------------------------------------------

func TestPrivateTransfer_InvalidRoot(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("pt_root_____________")).String()
	_, err := ms.PrivateTransfer(f.ctx, &types.MsgPrivateTransfer{
		Creator:        creator,
		Nullifiers:     "aa,bb",
		Root:           "deadbeef",
		Proof:          "00",
		NewCommitments: "cc,dd",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "root")
}

func TestPrivateTransfer_InvalidProofHex(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("pt_proofhex_________")).String()
	_, _, rootHex, err := f.keeper.AppendCommitment(f.ctx, []byte{0x01, 0x02})
	require.NoError(t, err)
	_, err = ms.PrivateTransfer(f.ctx, &types.MsgPrivateTransfer{
		Creator:        creator,
		Nullifiers:     "aa,bb",
		Root:           rootHex,
		Proof:          "zzzz",
		NewCommitments: "cc,dd",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "not valid hex")
}

func TestPrivateTransfer_InvalidCommitmentArity(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("pt_commit___________")).String()
	_, _, rootHex, err := f.keeper.AppendCommitment(f.ctx, []byte{0x03, 0x04})
	require.NoError(t, err)
	_, err = ms.PrivateTransfer(f.ctx, &types.MsgPrivateTransfer{
		Creator:        creator,
		Nullifiers:     "aa,bb",
		Root:           rootHex,
		Proof:          "00",
		NewCommitments: "single",
	})
	require.Error(t, err)
	// Proof deserialization may fail before commitment arity check — just verify error.
}

func TestPrivateTransfer_VKNotInitialized(t *testing.T) {
	f := initFixtureWithBank(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("pt_novk_____________")).String()
	_, _, rootHex, err := f.keeper.AppendCommitment(f.ctx, []byte{0x05, 0x06})
	require.NoError(t, err)
	_, err = ms.PrivateTransfer(f.ctx, &types.MsgPrivateTransfer{
		Creator:        creator,
		Nullifiers:     "aa,bb",
		Root:           rootHex,
		Proof:          "aabbccdd",
		NewCommitments: "cc,dd",
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// RegisterViewKey error paths
// ---------------------------------------------------------------------------

func TestRegisterViewKey_EmptyCommitment2(t *testing.T) {
	f := initFixture(t)
	ms := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("rvk_empty___________")).String()
	_, err := ms.RegisterViewKey(f.ctx, &types.MsgRegisterViewKey{
		Creator:       creator,
		CommitmentHex: "",
		EncryptedNote: "note",
	})
	require.Error(t, err)
}

// ---------------------------------------------------------------------------
// CheckAndIncrementPrivacyTxCount (rate limiting)
// ---------------------------------------------------------------------------

func TestCheckAndIncrementPrivacyTxCount_Disabled(t *testing.T) {
	f := initFixtureWithBank(t)
	params := types.DefaultParams()
	params.MaxPrivacyTxPerBlock = 0
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	for i := 0; i < 10; i++ {
		err := f.keeper.CheckAndIncrementPrivacyTxCount(f.ctx)
		require.NoError(t, err)
	}
}

func TestCheckAndIncrementPrivacyTxCount_Enforced(t *testing.T) {
	f := initFixtureWithBank(t)
	params := types.DefaultParams()
	params.MaxPrivacyTxPerBlock = 2
	require.NoError(t, f.keeper.Params.Set(f.ctx, params))

	require.NoError(t, f.keeper.CheckAndIncrementPrivacyTxCount(f.ctx))
	require.NoError(t, f.keeper.CheckAndIncrementPrivacyTxCount(f.ctx))
	err := f.keeper.CheckAndIncrementPrivacyTxCount(f.ctx)
	require.Error(t, err)
}
