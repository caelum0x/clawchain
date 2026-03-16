package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	privacyibc "clawchain/x/privacy/ibc"
)

func TestParsePrivacyMetadata_UnshieldAction(t *testing.T) {
	memo := `{"clawchain_privacy":{"auto_shield":false,"action":"unshield","proof":"aabbcc","nullifier":"ddeeff","amount":"1000"}}`
	meta := privacyibc.ParsePrivacyMetadata(memo)
	require.NotNil(t, meta)
	require.Equal(t, "unshield", meta.Action)
	require.Equal(t, "aabbcc", meta.Proof)
	require.Equal(t, "ddeeff", meta.Nullifier)
	require.Equal(t, "1000", meta.Amount)
}

func TestParsePrivacyMetadata_AutoShieldWithThresholdFields(t *testing.T) {
	memo := `{"clawchain_privacy":{"auto_shield":true}}`
	meta := privacyibc.ParsePrivacyMetadata(memo)
	require.NotNil(t, meta)
	require.True(t, meta.AutoShield)
	require.Equal(t, "", meta.Action)
}

func TestAutoShieldThreshold_SetAndGet(t *testing.T) {
	// Set a threshold.
	privacyibc.SetAutoShieldThreshold(5000)
	defer privacyibc.SetAutoShieldThreshold(0) // reset after test

	mw := privacyibc.NewIBCMiddleware(nil, nil)
	require.Equal(t, uint64(5000), mw.GetAutoShieldThreshold())
}
