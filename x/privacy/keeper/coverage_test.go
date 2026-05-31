//go:build integration
// +build integration

package keeper_test

import (
	"os"
	"path/filepath"
	"testing"

	"clawchain/x/privacy/circuit"
	"clawchain/x/privacy/keeper"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/stretchr/testify/require"

	"clawchain/x/privacy/types"
)

// ---------------------------------------------------------------------------
// UpdateParam coverage tests
// ---------------------------------------------------------------------------

func TestUpdateParam_MaxPrivacyTxPerBlock(t *testing.T) {
	f := initFixture(t)

	// Set default params first.
	require.NoError(t, f.keeper.Params.Set(f.ctx, types.DefaultParams()))

	// Valid update.
	err := f.keeper.UpdateParam(f.ctx, "max_privacy_tx_per_block", "100")
	require.NoError(t, err)

	// Verify the param was updated.
	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(100), params.MaxPrivacyTxPerBlock)
}

func TestUpdateParam_InvalidValue(t *testing.T) {
	f := initFixture(t)

	require.NoError(t, f.keeper.Params.Set(f.ctx, types.DefaultParams()))

	// Non-numeric value should fail.
	err := f.keeper.UpdateParam(f.ctx, "max_privacy_tx_per_block", "not_a_number")
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid value")
}

func TestUpdateParam_UnknownKey(t *testing.T) {
	f := initFixture(t)

	require.NoError(t, f.keeper.Params.Set(f.ctx, types.DefaultParams()))

	// Unknown param key should fail.
	err := f.keeper.UpdateParam(f.ctx, "nonexistent_param", "42")
	require.Error(t, err)
	require.Contains(t, err.Error(), "unknown privacy param key")
}

func TestUpdateParam_ZeroValue(t *testing.T) {
	f := initFixture(t)

	require.NoError(t, f.keeper.Params.Set(f.ctx, types.DefaultParams()))

	// Setting to zero should succeed (it disables rate limiting).
	err := f.keeper.UpdateParam(f.ctx, "max_privacy_tx_per_block", "0")
	require.NoError(t, err)

	params, err := f.keeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, uint64(0), params.MaxPrivacyTxPerBlock)
}

// ---------------------------------------------------------------------------
// ShieldForAccount coverage tests
// ---------------------------------------------------------------------------

func TestShieldForAccount_Success(t *testing.T) {
	f := initFixtureWithBank(t)

	sender := sdk.AccAddress([]byte("shield_sender_______"))

	commitmentHex, leafIndex, err := f.keeper.ShieldForAccount(
		sdk.UnwrapSDKContext(f.ctx), sender, 1000, "stake",
	)
	require.NoError(t, err)
	require.NotEmpty(t, commitmentHex, "commitment hex should not be empty")
	require.Equal(t, uint64(0), leafIndex, "first leaf index should be 0")

	// Verify the commitment was stored.
	storedCommitment, err := f.keeper.Commitments.Get(f.ctx, leafIndex)
	require.NoError(t, err)
	require.NotEmpty(t, storedCommitment)

	// Verify the commitment index reverse lookup works.
	idx, err := f.keeper.CommitmentIndex.Get(f.ctx, commitmentHex)
	require.NoError(t, err)
	require.Equal(t, leafIndex, idx)

	// Verify a Merkle root was stored.
	iter, err := f.keeper.MerkleRoots.Iterate(f.ctx, nil)
	require.NoError(t, err)
	defer iter.Close()
	count := 0
	for ; iter.Valid(); iter.Next() {
		count++
	}
	require.Greater(t, count, 0, "at least one Merkle root should be stored")
}

func TestShieldForAccount_ZeroAmount(t *testing.T) {
	f := initFixtureWithBank(t)

	sender := sdk.AccAddress([]byte("shield_zero_________"))

	_, _, err := f.keeper.ShieldForAccount(
		sdk.UnwrapSDKContext(f.ctx), sender, 0, "stake",
	)
	require.Error(t, err)
	require.Contains(t, err.Error(), "amount must be greater than zero")
}

func TestShieldForAccount_DefaultDenom(t *testing.T) {
	f := initFixtureWithBank(t)

	sender := sdk.AccAddress([]byte("shield_denom________"))

	// Pass empty denom -- should default to "stake".
	commitmentHex, _, err := f.keeper.ShieldForAccount(
		sdk.UnwrapSDKContext(f.ctx), sender, 500, "",
	)
	require.NoError(t, err)
	require.NotEmpty(t, commitmentHex)
}

func TestShieldForAccount_MultipleShields(t *testing.T) {
	f := initFixtureWithBank(t)

	sender := sdk.AccAddress([]byte("shield_multi________"))
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	// Shield twice and verify leaf indices increment.
	_, idx1, err := f.keeper.ShieldForAccount(sdkCtx, sender, 100, "stake")
	require.NoError(t, err)

	_, idx2, err := f.keeper.ShieldForAccount(sdkCtx, sender, 200, "stake")
	require.NoError(t, err)

	require.Equal(t, idx1+1, idx2, "leaf indices should increment sequentially")
}

func TestShieldForAccount_NativeDenom(t *testing.T) {
	f := initFixtureWithBank(t)

	sender := sdk.AccAddress([]byte("shield_native_______"))

	// Auto-shielding the native pool denom must succeed.
	commitmentHex, _, err := f.keeper.ShieldForAccount(
		sdk.UnwrapSDKContext(f.ctx), sender, 750, types.PoolDenom(),
	)
	require.NoError(t, err)
	require.NotEmpty(t, commitmentHex)
}

func TestShieldForAccount_ForeignDenomRejected(t *testing.T) {
	f := initFixtureWithBank(t)

	sender := sdk.AccAddress([]byte("shield_foreign______"))

	// The pool is single-denom; auto-shielding a foreign IBC voucher must be
	// rejected so it cannot be withdrawn as the native denom. PoolDenom()
	// resolves to "stake" in unit tests, so "uclaw" is foreign here.
	_, _, err := f.keeper.ShieldForAccount(
		sdk.UnwrapSDKContext(f.ctx), sender, 750, "uclaw",
	)
	require.ErrorIs(t, err, types.ErrUnsupportedDenom)
}

func TestGetBankKeeper_NilInFixture(t *testing.T) {
	f := initFixture(t)
	require.Nil(t, f.keeper.GetBankKeeper())
}

func TestLoadVerifyingKeys_MissingFiles(t *testing.T) {
	f := initFixture(t)

	err := f.keeper.LoadVerifyingKeys("/tmp/definitely-missing-privacy-keys")
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to read transfer verifying key")
}

func TestPrivateTransfer_EarlyValidationErrors(t *testing.T) {
	f := initFixtureWithBank(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("creator_____________")).String()

	// Invalid creator address check.
	_, err := msgServer.PrivateTransfer(f.ctx, &types.MsgPrivateTransfer{
		Creator:        "bad-address",
		Nullifiers:     "a,b",
		Root:           "abcd",
		Proof:          "00",
		NewCommitments: "c,d",
	})
	require.Error(t, err)

	// Invalid nullifier arity check.
	_, err = msgServer.PrivateTransfer(f.ctx, &types.MsgPrivateTransfer{
		Creator:        creator,
		Nullifiers:     "single-nullifier",
		Root:           "abcd",
		Proof:          "00",
		NewCommitments: "c,d",
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "expected exactly 2 nullifiers")
}

func TestQueryViewKey_NotFoundAndFound(t *testing.T) {
	f := initFixture(t)
	queryServer := keeper.NewQueryServerImpl(f.keeper)

	// Not found path.
	resp, err := queryServer.ViewKey(f.ctx, &types.QueryViewKeyRequest{CommitmentHex: "deadbeef"})
	require.NoError(t, err)
	require.False(t, resp.Found)

	// Found path.
	require.NoError(t, f.keeper.ViewKeys.Set(f.ctx, "cafe", []byte("encrypted-note")))
	resp, err = queryServer.ViewKey(f.ctx, &types.QueryViewKeyRequest{CommitmentHex: "cafe"})
	require.NoError(t, err)
	require.True(t, resp.Found)
	require.Equal(t, "encrypted-note", resp.EncryptedNote)
}

func TestLoadVerifyingKeys_Success(t *testing.T) {
	f := initFixture(t)
	tmp := t.TempDir()

	_, transferVK, _, err := circuit.SetupTransfer()
	require.NoError(t, err)
	_, unshieldVK, _, err := circuit.SetupUnshield()
	require.NoError(t, err)

	transferVKBytes, err := circuit.SerializeVerifyingKey(transferVK)
	require.NoError(t, err)
	unshieldVKBytes, err := circuit.SerializeVerifyingKey(unshieldVK)
	require.NoError(t, err)

	require.NoError(t, os.WriteFile(filepath.Join(tmp, "transfer_vk.bin"), transferVKBytes, 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(tmp, "unshield_vk.bin"), unshieldVKBytes, 0o600))

	require.NoError(t, f.keeper.LoadVerifyingKeys(tmp))
	require.NotNil(t, f.keeper.VKs.TransferVK)
	require.NotNil(t, f.keeper.VKs.UnshieldVK)
}

func TestRegisterViewKeyAndParamsQueries(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	queryServer := keeper.NewQueryServerImpl(f.keeper)
	creator := sdk.AccAddress([]byte("viewkey_creator_____")).String()

	_, err := msgServer.RegisterViewKey(f.ctx, &types.MsgRegisterViewKey{
		Creator:       creator,
		CommitmentHex: "abcd1234",
		EncryptedNote: "enc-note",
	})
	require.NoError(t, err)

	_, err = msgServer.RegisterViewKey(f.ctx, &types.MsgRegisterViewKey{
		Creator:       creator,
		CommitmentHex: "abcd1234",
		EncryptedNote: "enc-note-dup",
	})
	require.Error(t, err)

	_, err = msgServer.RegisterViewKey(f.ctx, &types.MsgRegisterViewKey{
		Creator:       creator,
		CommitmentHex: "",
		EncryptedNote: "enc-note",
	})
	require.Error(t, err)

	authority, err := f.addressCodec.BytesToString(f.keeper.GetAuthority())
	require.NoError(t, err)
	_, err = msgServer.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: authority,
		Params: types.Params{
			MaxPrivacyTxPerBlock: 123,
		},
	})
	require.NoError(t, err)

	_, err = msgServer.UpdateParams(f.ctx, &types.MsgUpdateParams{
		Authority: "cosmos1notauthorizedxxxxxxxxxxxxxxxxxxxxxx",
		Params:    types.DefaultParams(),
	})
	require.Error(t, err)

	_, err = queryServer.Params(f.ctx, nil)
	require.Error(t, err)

	resp, err := queryServer.Params(f.ctx, &types.QueryParamsRequest{})
	require.NoError(t, err)
	require.EqualValues(t, 123, resp.Params.MaxPrivacyTxPerBlock)
}

func TestStateMachine_ValidateRootAndAppendCommitment(t *testing.T) {
	f := initFixture(t)

	_, err := f.keeper.ValidateKnownRoot(f.ctx, "deadbeef")
	require.Error(t, err)

	leaf, commitHex, rootHex, err := f.keeper.AppendCommitment(f.ctx, []byte{0x01, 0x02, 0x03, 0x04})
	require.NoError(t, err)
	require.EqualValues(t, 0, leaf)
	require.NotEmpty(t, commitHex)
	require.NotEmpty(t, rootHex)

	normalizedRoot, err := f.keeper.ValidateKnownRoot(f.ctx, " "+rootHex+" ")
	require.NoError(t, err)
	require.Equal(t, rootHex, normalizedRoot)

	_, _, _, err = f.keeper.AppendCommitment(f.ctx, []byte{0x01, 0x02, 0x03, 0x04})
	require.Error(t, err)

	_, _, _, err = f.keeper.AppendCommitment(f.ctx, nil)
	require.Error(t, err)
}
