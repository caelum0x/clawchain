package ibc

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	sdk "github.com/cosmos/cosmos-sdk/types"
	channeltypes "github.com/cosmos/ibc-go/v10/modules/core/04-channel/types"
	porttypes "github.com/cosmos/ibc-go/v10/modules/core/05-port/types"
	ibcexported "github.com/cosmos/ibc-go/v10/modules/core/exported"

	transfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"
)

// ---------------------------------------------------------------------------
// ParsePrivacyMetadata tests
// ---------------------------------------------------------------------------

func TestParsePrivacyMetadataEmpty(t *testing.T) {
	meta := ParsePrivacyMetadata("")
	require.Nil(t, meta)
}

func TestParsePrivacyMetadataInvalidJSON(t *testing.T) {
	meta := ParsePrivacyMetadata("not-json")
	require.Nil(t, meta)
}

func TestParsePrivacyMetadataNoPrivacyKey(t *testing.T) {
	meta := ParsePrivacyMetadata(`{"some_other_key": true}`)
	require.Nil(t, meta)
}

func TestParsePrivacyMetadataAutoShieldTrue(t *testing.T) {
	meta := ParsePrivacyMetadata(`{"clawchain_privacy": {"auto_shield": true}}`)
	require.NotNil(t, meta)
	require.True(t, meta.AutoShield)
}

func TestParsePrivacyMetadataAutoShieldFalse(t *testing.T) {
	meta := ParsePrivacyMetadata(`{"clawchain_privacy": {"auto_shield": false}}`)
	require.NotNil(t, meta)
	require.False(t, meta.AutoShield)
}

func TestParsePrivacyMetadataWithOtherFields(t *testing.T) {
	meta := ParsePrivacyMetadata(`{"clawchain_privacy": {"auto_shield": true}, "other": "data"}`)
	require.NotNil(t, meta)
	require.True(t, meta.AutoShield)
}

// ---------------------------------------------------------------------------
// Mocks for middleware tests
// ---------------------------------------------------------------------------

type successAck struct{}

func (a successAck) Success() bool              { return true }
func (a successAck) Acknowledgement() []byte     { return []byte(`{"result":"AQ=="}`) }

type failAck struct{}

func (a failAck) Success() bool              { return false }
func (a failAck) Acknowledgement() []byte     { return []byte(`{"error":"failed"}`) }

type mockIBCModule struct {
	ack ibcexported.Acknowledgement
}

func (m *mockIBCModule) OnChanOpenInit(_ sdk.Context, _ channeltypes.Order, _ []string, _, _ string, _ channeltypes.Counterparty, _ string) (string, error) {
	return "", nil
}
func (m *mockIBCModule) OnChanOpenTry(_ sdk.Context, _ channeltypes.Order, _ []string, _, _ string, _ channeltypes.Counterparty, _ string) (string, error) {
	return "", nil
}
func (m *mockIBCModule) OnChanOpenAck(_ sdk.Context, _, _, _, _ string) error { return nil }
func (m *mockIBCModule) OnChanOpenConfirm(_ sdk.Context, _, _ string) error   { return nil }
func (m *mockIBCModule) OnChanCloseInit(_ sdk.Context, _, _ string) error     { return nil }
func (m *mockIBCModule) OnChanCloseConfirm(_ sdk.Context, _, _ string) error  { return nil }
func (m *mockIBCModule) OnRecvPacket(_ sdk.Context, _ string, _ channeltypes.Packet, _ sdk.AccAddress) ibcexported.Acknowledgement {
	return m.ack
}
func (m *mockIBCModule) OnAcknowledgementPacket(_ sdk.Context, _ string, _ channeltypes.Packet, _ []byte, _ sdk.AccAddress) error {
	return nil
}
func (m *mockIBCModule) OnTimeoutPacket(_ sdk.Context, _ string, _ channeltypes.Packet, _ sdk.AccAddress) error {
	return nil
}

// Ensure mockIBCModule satisfies the interface.
var _ porttypes.IBCModule = (*mockIBCModule)(nil)

type mockPrivacyKeeper struct {
	shieldCalled bool
	lastAmount   uint64
	lastDenom    string
}

func (m *mockPrivacyKeeper) ShieldForAccount(_ sdk.Context, _ sdk.AccAddress, amount uint64, denom string) (string, uint64, error) {
	m.shieldCalled = true
	m.lastAmount = amount
	m.lastDenom = denom
	return "abc123", 0, nil
}

// ---------------------------------------------------------------------------
// Middleware tests
// ---------------------------------------------------------------------------

func makeTransferPacket(t *testing.T, memo string) channeltypes.Packet {
	t.Helper()
	data := transfertypes.FungibleTokenPacketData{
		Denom:    "uclaw",
		Amount:   "1000",
		Sender:   "cosmos1sender",
		Receiver: "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu",
		Memo:     memo,
	}
	bz, err := json.Marshal(data)
	require.NoError(t, err)

	return channeltypes.Packet{
		Data:               bz,
		SourcePort:         "transfer",
		SourceChannel:      "channel-0",
		DestinationPort:    "transfer",
		DestinationChannel: "channel-1",
	}
}

func TestMiddlewarePassthroughNoMemo(t *testing.T) {
	app := &mockIBCModule{ack: successAck{}}
	pk := &mockPrivacyKeeper{}
	mw := NewIBCMiddleware(app, pk)

	ctx := sdk.Context{}.WithEventManager(sdk.NewEventManager())
	packet := makeTransferPacket(t, "")
	ack := mw.OnRecvPacket(ctx, "ics20-1", packet, nil)

	require.True(t, ack.Success())
	require.False(t, pk.shieldCalled, "should not auto-shield without memo")
}

func TestMiddlewarePassthroughNoPrivacyKey(t *testing.T) {
	app := &mockIBCModule{ack: successAck{}}
	pk := &mockPrivacyKeeper{}
	mw := NewIBCMiddleware(app, pk)

	ctx := sdk.Context{}.WithEventManager(sdk.NewEventManager())
	packet := makeTransferPacket(t, `{"some_key": "value"}`)
	ack := mw.OnRecvPacket(ctx, "ics20-1", packet, nil)

	require.True(t, ack.Success())
	require.False(t, pk.shieldCalled, "should not auto-shield without privacy key")
}

func TestMiddlewareAutoShieldOnMemo(t *testing.T) {
	app := &mockIBCModule{ack: successAck{}}
	pk := &mockPrivacyKeeper{}
	mw := NewIBCMiddleware(app, pk)

	ctx := sdk.Context{}.WithEventManager(sdk.NewEventManager())
	packet := makeTransferPacket(t, `{"clawchain_privacy": {"auto_shield": true}}`)
	ack := mw.OnRecvPacket(ctx, "ics20-1", packet, nil)

	require.True(t, ack.Success())
	require.True(t, pk.shieldCalled, "should auto-shield when memo requests it")
	require.Equal(t, uint64(1000), pk.lastAmount)
}

func TestMiddlewareNoShieldWhenAutoShieldFalse(t *testing.T) {
	app := &mockIBCModule{ack: successAck{}}
	pk := &mockPrivacyKeeper{}
	mw := NewIBCMiddleware(app, pk)

	ctx := sdk.Context{}.WithEventManager(sdk.NewEventManager())
	packet := makeTransferPacket(t, `{"clawchain_privacy": {"auto_shield": false}}`)
	ack := mw.OnRecvPacket(ctx, "ics20-1", packet, nil)

	require.True(t, ack.Success())
	require.False(t, pk.shieldCalled, "should not auto-shield when auto_shield is false")
}

func TestMiddlewareNoShieldOnFailedTransfer(t *testing.T) {
	app := &mockIBCModule{ack: failAck{}}
	pk := &mockPrivacyKeeper{}
	mw := NewIBCMiddleware(app, pk)

	ctx := sdk.Context{}.WithEventManager(sdk.NewEventManager())
	packet := makeTransferPacket(t, `{"clawchain_privacy": {"auto_shield": true}}`)
	ack := mw.OnRecvPacket(ctx, "ics20-1", packet, nil)

	require.False(t, ack.Success())
	require.False(t, pk.shieldCalled, "should not auto-shield when underlying transfer fails")
}

func TestMiddlewareDelegatesChannelHandshake(t *testing.T) {
	app := &mockIBCModule{ack: successAck{}}
	pk := &mockPrivacyKeeper{}
	mw := NewIBCMiddleware(app, pk)

	ctx := sdk.Context{}
	_, err := mw.OnChanOpenInit(ctx, channeltypes.UNORDERED, nil, "transfer", "channel-0", channeltypes.Counterparty{}, "ics20-1")
	require.NoError(t, err)

	err = mw.OnChanOpenConfirm(ctx, "transfer", "channel-0")
	require.NoError(t, err)

	err = mw.OnChanCloseInit(ctx, "transfer", "channel-0")
	require.NoError(t, err)
}
