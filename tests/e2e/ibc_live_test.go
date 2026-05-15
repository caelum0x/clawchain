//go:build e2e
// +build e2e

package e2e

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"

	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	transfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"
	channeltypes "github.com/cosmos/ibc-go/v10/modules/core/04-channel/types"
	porttypes "github.com/cosmos/ibc-go/v10/modules/core/05-port/types"
	ibcexported "github.com/cosmos/ibc-go/v10/modules/core/exported"
	"github.com/stretchr/testify/require"

	agentibc "clawchain/x/agent/ibc"
	agentkeeper "clawchain/x/agent/keeper"
	agentmodule "clawchain/x/agent/module"
	agenttypes "clawchain/x/agent/types"

	privacyibc "clawchain/x/privacy/ibc"
)

// ---------------------------------------------------------------------------
// Mock IBC module (underlying transfer module stub)
// ---------------------------------------------------------------------------

type ibcLiveMockModule struct {
	ack ibcexported.Acknowledgement
}

func (m *ibcLiveMockModule) OnChanOpenInit(_ sdk.Context, _ channeltypes.Order, _ []string, _, _ string, _ channeltypes.Counterparty, _ string) (string, error) {
	return "", nil
}
func (m *ibcLiveMockModule) OnChanOpenTry(_ sdk.Context, _ channeltypes.Order, _ []string, _, _ string, _ channeltypes.Counterparty, _ string) (string, error) {
	return "", nil
}
func (m *ibcLiveMockModule) OnChanOpenAck(_ sdk.Context, _, _, _, _ string) error { return nil }
func (m *ibcLiveMockModule) OnChanOpenConfirm(_ sdk.Context, _, _ string) error   { return nil }
func (m *ibcLiveMockModule) OnChanCloseInit(_ sdk.Context, _, _ string) error     { return nil }
func (m *ibcLiveMockModule) OnChanCloseConfirm(_ sdk.Context, _, _ string) error  { return nil }
func (m *ibcLiveMockModule) OnRecvPacket(_ sdk.Context, _ string, _ channeltypes.Packet, _ sdk.AccAddress) ibcexported.Acknowledgement {
	return m.ack
}
func (m *ibcLiveMockModule) OnAcknowledgementPacket(_ sdk.Context, _ string, _ channeltypes.Packet, _ []byte, _ sdk.AccAddress) error {
	return nil
}
func (m *ibcLiveMockModule) OnTimeoutPacket(_ sdk.Context, _ string, _ channeltypes.Packet, _ sdk.AccAddress) error {
	return nil
}

var _ porttypes.IBCModule = (*ibcLiveMockModule)(nil)

// ---------------------------------------------------------------------------
// Mock bank keeper (agent module)
// ---------------------------------------------------------------------------

type ibcLiveMockBankKeeper struct{}

func (m ibcLiveMockBankKeeper) SpendableCoins(_ context.Context, _ sdk.AccAddress) sdk.Coins {
	return sdk.Coins{}
}
func (m ibcLiveMockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, _ sdk.AccAddress, _ string, _ sdk.Coins) error {
	return nil
}
func (m ibcLiveMockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, _ string, _ sdk.AccAddress, _ sdk.Coins) error {
	return nil
}
func (m ibcLiveMockBankKeeper) BurnCoins(_ context.Context, _ string, _ sdk.Coins) error {
	return nil
}
func (m ibcLiveMockBankKeeper) MintCoins(_ context.Context, _ string, _ sdk.Coins) error {
	return nil
}

// ---------------------------------------------------------------------------
// Mock privacy keeper (for privacy middleware)
// ---------------------------------------------------------------------------

type ibcLiveMockPrivacyKeeper struct {
	shieldCalled bool
	lastAmount   uint64
	lastDenom    string
}

func (m *ibcLiveMockPrivacyKeeper) ShieldForAccount(_ sdk.Context, _ sdk.AccAddress, amount uint64, denom string) (string, uint64, error) {
	m.shieldCalled = true
	m.lastAmount = amount
	m.lastDenom = denom
	return "commitment_abc123", 0, nil
}

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

type ibcLiveFixture struct {
	ctx             sdk.Context
	agentKeeper     agentkeeper.Keeper
	agentMiddleware agentibc.AgentIBCMiddleware
	privacyKeeper   *ibcLiveMockPrivacyKeeper
	fullStack       porttypes.IBCModule // full middleware stack: agent -> privacy -> transfer
}

func initIBCLiveFixture(t *testing.T) *ibcLiveFixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(agentmodule.AppModule{})
	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(agenttypes.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(agenttypes.GovModuleName)
	bk := ibcLiveMockBankKeeper{}

	k := agentkeeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addrCodec,
		authority,
		bk,
		nil, // mintKeeper
		nil, // reputationKeeper
	)

	// Set default params with zero deposit.
	params := agenttypes.DefaultParams()
	params.MinAgentDepositUclaw = 0
	require.NoError(t, k.Params.Set(ctx, params))

	// Build the full middleware stack: Agent -> Privacy -> Transfer(mock)
	pk := &ibcLiveMockPrivacyKeeper{}
	mockTransfer := &ibcLiveMockModule{
		ack: channeltypes.NewResultAcknowledgement([]byte(`{"result":"AQ=="}`)),
	}
	privacyMW := privacyibc.NewIBCMiddleware(mockTransfer, pk)
	agentMW := agentibc.NewAgentIBCMiddleware(privacyMW, &k)

	return &ibcLiveFixture{
		ctx:             ctx,
		agentKeeper:     k,
		agentMiddleware: agentMW,
		privacyKeeper:   pk,
		fullStack:       agentMW,
	}
}

// makeIBCTransferPacket constructs a mock ICS-20 packet for testing middleware.
func makeIBCTransferPacket(sender, receiver, denom, amount, memo string) channeltypes.Packet {
	data := transfertypes.FungibleTokenPacketData{
		Denom:    denom,
		Amount:   amount,
		Sender:   sender,
		Receiver: receiver,
		Memo:     memo,
	}
	bz, _ := json.Marshal(data)
	return channeltypes.Packet{
		Sequence:           1,
		SourcePort:         "transfer",
		SourceChannel:      "channel-0",
		DestinationPort:    "transfer",
		DestinationChannel: "channel-1",
		Data:               bz,
	}
}

// parseIBCAckResult decodes the IBC ResultAcknowledgement envelope {"result":"<base64>"}
// and returns the inner JSON bytes.
func parseIBCAckResult(t *testing.T, ackBytes []byte) []byte {
	t.Helper()
	var envelope struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(ackBytes, &envelope); err == nil && envelope.Result != "" {
		inner, err := base64.StdEncoding.DecodeString(envelope.Result)
		require.NoError(t, err, "failed to base64-decode ack result")
		return inner
	}
	// Return as-is if not wrapped.
	return ackBytes
}

// ---------------------------------------------------------------------------
// Test: IBC transfer message construction (ICS-20 packet format)
// ---------------------------------------------------------------------------

func TestIBCTransferMessageConstruction(t *testing.T) {
	// Verify that ICS-20 FungibleTokenPacketData round-trips correctly.
	data := transfertypes.FungibleTokenPacketData{
		Denom:    "uclaw",
		Amount:   "1000000",
		Sender:   "claw1sender_on_chain_a",
		Receiver: "claw1receiver_on_chain_b",
		Memo:     "",
	}

	bz, err := json.Marshal(data)
	require.NoError(t, err, "ICS-20 packet data should marshal")

	var decoded transfertypes.FungibleTokenPacketData
	require.NoError(t, json.Unmarshal(bz, &decoded))
	require.Equal(t, data.Denom, decoded.Denom)
	require.Equal(t, data.Amount, decoded.Amount)
	require.Equal(t, data.Sender, decoded.Sender)
	require.Equal(t, data.Receiver, decoded.Receiver)
	require.Empty(t, decoded.Memo)
}

// ---------------------------------------------------------------------------
// Test: IBC transfer with memo fields preserved
// ---------------------------------------------------------------------------

func TestIBCTransferMemoPreservation(t *testing.T) {
	memos := []struct {
		name string
		memo string
	}{
		{"empty memo", ""},
		{"plain text", "just a transfer"},
		{"agent discovery", `{"clawchain_agent":{"action":"discover","capabilities":["transfer"],"max_results":5}}`},
		{"agent announce", `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"chain-b","address":"claw1abc","name":"remote-agent","endpoint":"https://remote.local","tools":["compute"]}}}`},
		{"privacy auto-shield", `{"clawchain_privacy":{"auto_shield":true}}`},
		{"combined agent+privacy", `{"clawchain_agent":{"action":"discover","max_results":3},"clawchain_privacy":{"auto_shield":true}}`},
		{"task delegation", `{"clawchain_agent":{"action":"delegate_task","task":{"description":"GPU inference","assignee":"claw1assignee","budget":"5000000uclaw","deadline_blocks":200}}}`},
		{"task query", `{"clawchain_agent":{"action":"query_task","task_result":{"task_id":42}}}`},
	}

	for _, tc := range memos {
		t.Run(tc.name, func(t *testing.T) {
			data := transfertypes.FungibleTokenPacketData{
				Denom:    "uclaw",
				Amount:   "1000",
				Sender:   "claw1sender",
				Receiver: "claw1receiver",
				Memo:     tc.memo,
			}
			bz, err := json.Marshal(data)
			require.NoError(t, err)

			var decoded transfertypes.FungibleTokenPacketData
			require.NoError(t, json.Unmarshal(bz, &decoded))
			require.Equal(t, tc.memo, decoded.GetMemo(), "memo should survive round-trip")
		})
	}
}

// ---------------------------------------------------------------------------
// Test: Agent discovery memo parsing
// ---------------------------------------------------------------------------

func TestIBCAgentDiscoveryMemoParsing(t *testing.T) {
	tests := []struct {
		name           string
		memo           string
		expectNil      bool
		expectedAction string
		expectedCaps   int
	}{
		{"empty", "", true, "", 0},
		{"invalid json", "not json", true, "", 0},
		{"no agent key", `{"other":"val"}`, true, "", 0},
		{"discover with caps", `{"clawchain_agent":{"action":"discover","capabilities":["compute","inference"],"max_results":10}}`, false, "discover", 2},
		{"announce", `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"chain-b","address":"claw1x","name":"agent-b","endpoint":"https://b.local"}}}`, false, "announce", 0},
		{"delegate_task", `{"clawchain_agent":{"action":"delegate_task","task":{"description":"run model","assignee":"claw1y","budget":"1000uclaw","deadline_blocks":100}}}`, false, "delegate_task", 0},
		{"query_task", `{"clawchain_agent":{"action":"query_task","task_result":{"task_id":42}}}`, false, "query_task", 0},
		{"mixed with privacy", `{"clawchain_privacy":{"auto_shield":true},"clawchain_agent":{"action":"discover","capabilities":["transfer"]}}`, false, "discover", 1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := agentibc.ParseAgentDiscovery(tc.memo)
			if tc.expectNil {
				require.Nil(t, result, "expected nil for memo: %q", tc.memo)
				return
			}
			require.NotNil(t, result)
			require.Equal(t, tc.expectedAction, result.Action)
			require.Len(t, result.Capabilities, tc.expectedCaps)
		})
	}
}

// ---------------------------------------------------------------------------
// Test: Privacy auto-shield memo parsing
// ---------------------------------------------------------------------------

func TestIBCPrivacyAutoShieldMemoParsing(t *testing.T) {
	tests := []struct {
		name        string
		memo        string
		expectNil   bool
		expectShield bool
	}{
		{"empty", "", true, false},
		{"no privacy key", `{"other":"data"}`, true, false},
		{"auto_shield true", `{"clawchain_privacy":{"auto_shield":true}}`, false, true},
		{"auto_shield false", `{"clawchain_privacy":{"auto_shield":false}}`, false, false},
		{"with agent", `{"clawchain_privacy":{"auto_shield":true},"clawchain_agent":{"action":"discover"}}`, false, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := privacyibc.ParsePrivacyMetadata(tc.memo)
			if tc.expectNil {
				require.Nil(t, result)
				return
			}
			require.NotNil(t, result)
			require.Equal(t, tc.expectShield, result.AutoShield)
		})
	}
}

// ---------------------------------------------------------------------------
// Test: Full middleware stack — agent announce via IBC packet
// ---------------------------------------------------------------------------

func TestIBCFullStackAgentAnnounce(t *testing.T) {
	f := initIBCLiveFixture(t)

	memo := `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"clawchain-ibc-b","address":"claw1remote_agent_b","name":"gpu-worker-b","endpoint":"https://agent-b.clawchain.io","tools":["gpu_compute","inference","training"]}}}`

	packet := makeIBCTransferPacket(
		"claw1sender_chain_b",
		"claw1receiver_chain_a",
		"uclaw",
		"1000000",
		memo,
	)

	ack := f.fullStack.OnRecvPacket(f.ctx, "ics20-1", packet, nil)
	require.NotNil(t, ack)
	require.True(t, ack.Success(), "announce packet should succeed: %s", string(ack.Acknowledgement()))

	// Decode the acknowledgement.
	inner := parseIBCAckResult(t, ack.Acknowledgement())
	var resp agentibc.AgentDiscoveryResponse
	require.NoError(t, json.Unmarshal(inner, &resp))
	require.True(t, resp.Acknowledged, "response should be acknowledged")
	require.Empty(t, resp.Error)

	// Verify remote agent was stored in keeper.
	results, err := f.agentKeeper.QueryRemoteAgents(f.ctx)
	require.NoError(t, err)
	require.Len(t, results, 1, "should have 1 remote agent")

	var stored agentibc.RemoteAgentInfo
	require.NoError(t, json.Unmarshal([]byte(results[0]), &stored))
	require.Equal(t, "clawchain-ibc-b", stored.ChainID)
	require.Equal(t, "claw1remote_agent_b", stored.Address)
	require.Equal(t, "gpu-worker-b", stored.Name)
	require.Equal(t, "https://agent-b.clawchain.io", stored.Endpoint)
	require.Equal(t, []string{"gpu_compute", "inference", "training"}, stored.Tools)
}

// ---------------------------------------------------------------------------
// Test: Full middleware stack — agent announce updates (upsert)
// ---------------------------------------------------------------------------

func TestIBCFullStackAgentAnnounceUpsert(t *testing.T) {
	f := initIBCLiveFixture(t)

	// First announcement.
	memo1 := `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"chain-b","address":"claw1agent","name":"v1","endpoint":"https://v1.local","tools":["transfer"]}}}`
	packet1 := makeIBCTransferPacket("claw1sender", "claw1receiver", "uclaw", "1", memo1)
	ack1 := f.fullStack.OnRecvPacket(f.ctx, "ics20-1", packet1, nil)
	require.True(t, ack1.Success())

	// Second announcement (same chain_id + address, updated fields).
	memo2 := `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"chain-b","address":"claw1agent","name":"v2","endpoint":"https://v2.local","tools":["transfer","compute"]}}}`
	packet2 := makeIBCTransferPacket("claw1sender", "claw1receiver", "uclaw", "1", memo2)
	ack2 := f.fullStack.OnRecvPacket(f.ctx, "ics20-1", packet2, nil)
	require.True(t, ack2.Success())

	// Should have exactly 1 agent (upserted).
	results, err := f.agentKeeper.QueryRemoteAgents(f.ctx)
	require.NoError(t, err)
	require.Len(t, results, 1, "should upsert, not duplicate")

	var stored agentibc.RemoteAgentInfo
	require.NoError(t, json.Unmarshal([]byte(results[0]), &stored))
	require.Equal(t, "v2", stored.Name, "should have updated name")
	require.Len(t, stored.Tools, 2, "should have updated tools")
}

// ---------------------------------------------------------------------------
// Test: Full middleware stack — passthrough (no agent/privacy memo)
// ---------------------------------------------------------------------------

func TestIBCFullStackPassthrough(t *testing.T) {
	f := initIBCLiveFixture(t)

	tests := []struct {
		name string
		memo string
	}{
		{"empty memo", ""},
		{"plain text", "hello from chain-b"},
		{"unrelated json", `{"some_other_key":"value"}`},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			packet := makeIBCTransferPacket("claw1sender", "claw1receiver", "uclaw", "1000", tc.memo)
			ack := f.fullStack.OnRecvPacket(f.ctx, "ics20-1", packet, nil)
			require.NotNil(t, ack)
			require.True(t, ack.Success(), "passthrough should succeed")

			// No remote agents should be stored.
			results, err := f.agentKeeper.QueryRemoteAgents(f.ctx)
			require.NoError(t, err)
			require.Empty(t, results, "no agents for memo: %q", tc.memo)

			// Privacy keeper should not be called.
			require.False(t, f.privacyKeeper.shieldCalled, "should not auto-shield for memo: %q", tc.memo)
		})
	}
}

// ---------------------------------------------------------------------------
// Test: Full middleware stack — privacy auto-shield on receive
// ---------------------------------------------------------------------------

func TestIBCFullStackPrivacyAutoShield(t *testing.T) {
	f := initIBCLiveFixture(t)

	memo := `{"clawchain_privacy":{"auto_shield":true}}`
	packet := makeIBCTransferPacket(
		"claw1sender",
		"cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu", // valid bech32 for AccAddressFromBech32
		"uclaw",
		"5000",
		memo,
	)

	ack := f.fullStack.OnRecvPacket(f.ctx, "ics20-1", packet, nil)
	require.NotNil(t, ack)
	require.True(t, ack.Success())

	require.True(t, f.privacyKeeper.shieldCalled, "privacy keeper should auto-shield")
	require.Equal(t, uint64(5000), f.privacyKeeper.lastAmount)
	require.Equal(t, "uclaw", f.privacyKeeper.lastDenom)
}

// ---------------------------------------------------------------------------
// Test: Full middleware stack — combined agent + privacy memo
// ---------------------------------------------------------------------------

func TestIBCFullStackCombinedAgentAndPrivacy(t *testing.T) {
	f := initIBCLiveFixture(t)

	// Combined memo: agent announce + privacy auto-shield.
	memo := `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"chain-b","address":"claw1combo","name":"combo-agent","endpoint":"https://combo.local","tools":["compute"]}},"clawchain_privacy":{"auto_shield":true}}`
	packet := makeIBCTransferPacket(
		"claw1sender",
		"cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu",
		"uclaw",
		"2000",
		memo,
	)

	ack := f.fullStack.OnRecvPacket(f.ctx, "ics20-1", packet, nil)
	require.NotNil(t, ack)
	require.True(t, ack.Success())

	// Agent announcement should be processed by the agent middleware.
	inner := parseIBCAckResult(t, ack.Acknowledgement())
	var resp agentibc.AgentDiscoveryResponse
	require.NoError(t, json.Unmarshal(inner, &resp))
	require.True(t, resp.Acknowledged, "agent announce should be acknowledged")

	// Remote agent should be stored.
	results, err := f.agentKeeper.QueryRemoteAgents(f.ctx)
	require.NoError(t, err)
	require.Len(t, results, 1)

	// Note: Since the agent middleware overwrites the ack from the privacy layer,
	// the privacy auto-shield may or may not have been called depending on the
	// middleware ordering. The agent middleware is the outermost layer and processes
	// after the inner layers. The privacy middleware sits between transfer and agent,
	// so it runs first. Verify the privacy keeper was called.
	// The privacy middleware runs first (inner), then agent middleware (outer) intercepts.
	require.True(t, f.privacyKeeper.shieldCalled, "privacy should still auto-shield in combined memo")
}

// ---------------------------------------------------------------------------
// Test: IBC transfer IBC denom construction
// ---------------------------------------------------------------------------

func TestIBCDenomConstruction(t *testing.T) {
	// When tokens are transferred via IBC, the receiving chain sees them with
	// an IBC denom derived from the source port/channel.
	denom := transfertypes.NewDenom("uclaw", transfertypes.NewHop("transfer", "channel-0"))

	ibcDenom := denom.IBCDenom()
	require.NotEmpty(t, ibcDenom)
	require.Contains(t, ibcDenom, "ibc/", "IBC denom should start with ibc/ prefix")

	// Verify the hash is deterministic.
	ibcDenom2 := denom.IBCDenom()
	require.Equal(t, ibcDenom, ibcDenom2, "IBC denom should be deterministic")

	// Different channel should produce different denom.
	denom2 := transfertypes.NewDenom("uclaw", transfertypes.NewHop("transfer", "channel-1"))
	ibcDenom3 := denom2.IBCDenom()
	require.NotEqual(t, ibcDenom, ibcDenom3, "different channel should produce different IBC denom")
}

// ---------------------------------------------------------------------------
// Test: IBC transfer packet with return path (unwind)
// ---------------------------------------------------------------------------

func TestIBCTransferReturnPath(t *testing.T) {
	// When IBC tokens are sent back, the denom trace is unwound.
	// Verify the denom trace parsing works correctly with the deprecated helper.
	denom := transfertypes.ParseDenomTrace("transfer/channel-0/uclaw")
	require.Equal(t, "transfer/channel-0/uclaw", denom.Path())
	require.Equal(t, "uclaw", denom.Base)

	// A native denom has no trace.
	nativeDenom := transfertypes.ParseDenomTrace("uclaw")
	require.Equal(t, "uclaw", nativeDenom.Path())
	require.Equal(t, "uclaw", nativeDenom.Base)
}

// ---------------------------------------------------------------------------
// Test: Malformed agent memo handling (no panic, graceful fallback)
// ---------------------------------------------------------------------------

func TestIBCMalformedAgentMemoGraceful(t *testing.T) {
	f := initIBCLiveFixture(t)

	malformed := []struct {
		name string
		memo string
	}{
		{"truncated json", `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"os`},
		{"wrong action type", `{"clawchain_agent":{"action":12345}}`},
		{"null agent key", `{"clawchain_agent":null}`},
		{"string agent key", `{"clawchain_agent":"not an object"}`},
		{"announce no remote_agent", `{"clawchain_agent":{"action":"announce"}}`},
		{"empty action", `{"clawchain_agent":{"action":""}}`},
		{"delegate_task no task", `{"clawchain_agent":{"action":"delegate_task"}}`},
		{"query_task no task_result", `{"clawchain_agent":{"action":"query_task"}}`},
	}

	for _, tc := range malformed {
		t.Run(tc.name, func(t *testing.T) {
			packet := makeIBCTransferPacket("claw1sender", "claw1receiver", "uclaw", "1000", tc.memo)

			// Must not panic.
			ack := f.fullStack.OnRecvPacket(f.ctx, "ics20-1", packet, nil)
			require.NotNil(t, ack, "should return ack even for malformed memo: %q", tc.memo)
			require.True(t, ack.Success(), "should return success ack (error in body): %s", string(ack.Acknowledgement()))
		})
	}

	// No agents should be stored from malformed data.
	results, err := f.agentKeeper.QueryRemoteAgents(f.ctx)
	require.NoError(t, err)
	require.Empty(t, results, "no agents from malformed memos")
}

// ---------------------------------------------------------------------------
// Test: Channel handshake delegation through middleware stack
// ---------------------------------------------------------------------------

func TestIBCMiddlewareStackChannelHandshake(t *testing.T) {
	f := initIBCLiveFixture(t)

	ctx := f.ctx
	counterparty := channeltypes.Counterparty{
		PortId:    "transfer",
		ChannelId: "channel-1",
	}

	// OnChanOpenInit
	ver, err := f.fullStack.OnChanOpenInit(ctx, channeltypes.UNORDERED, []string{"connection-0"}, "transfer", "channel-0", counterparty, "ics20-1")
	require.NoError(t, err)
	require.Empty(t, ver) // mock returns empty

	// OnChanOpenTry
	ver, err = f.fullStack.OnChanOpenTry(ctx, channeltypes.UNORDERED, []string{"connection-0"}, "transfer", "channel-0", counterparty, "ics20-1")
	require.NoError(t, err)
	require.Empty(t, ver)

	// OnChanOpenAck
	err = f.fullStack.OnChanOpenAck(ctx, "transfer", "channel-0", "channel-1", "ics20-1")
	require.NoError(t, err)

	// OnChanOpenConfirm
	err = f.fullStack.OnChanOpenConfirm(ctx, "transfer", "channel-0")
	require.NoError(t, err)

	// OnChanCloseInit
	err = f.fullStack.OnChanCloseInit(ctx, "transfer", "channel-0")
	require.NoError(t, err)

	// OnChanCloseConfirm
	err = f.fullStack.OnChanCloseConfirm(ctx, "transfer", "channel-0")
	require.NoError(t, err)
}

// ---------------------------------------------------------------------------
// Test: OnAcknowledgementPacket and OnTimeoutPacket delegation
// ---------------------------------------------------------------------------

func TestIBCMiddlewareStackAckAndTimeout(t *testing.T) {
	f := initIBCLiveFixture(t)

	packet := makeIBCTransferPacket("claw1sender", "claw1receiver", "uclaw", "1000", "")

	// OnAcknowledgementPacket
	err := f.fullStack.OnAcknowledgementPacket(f.ctx, "ics20-1", packet, []byte(`{"result":"AQ=="}`), nil)
	require.NoError(t, err)

	// OnTimeoutPacket
	err = f.fullStack.OnTimeoutPacket(f.ctx, "ics20-1", packet, nil)
	require.NoError(t, err)
}

// ---------------------------------------------------------------------------
// Test: Multiple remote agents from different chains
// ---------------------------------------------------------------------------

func TestIBCMultipleRemoteAgentsFromDifferentChains(t *testing.T) {
	f := initIBCLiveFixture(t)

	agents := []struct {
		chainID string
		address string
		name    string
	}{
		{"osmosis-1", "osmo1abc", "osmosis-agent"},
		{"juno-1", "juno1xyz", "juno-agent"},
		{"stargaze-1", "stars1def", "stargaze-agent"},
	}

	for _, a := range agents {
		memo := `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"` + a.chainID + `","address":"` + a.address + `","name":"` + a.name + `","endpoint":"https://` + a.name + `.local","tools":["compute"]}}}`
		packet := makeIBCTransferPacket("sender", "receiver", "uclaw", "1", memo)
		ack := f.fullStack.OnRecvPacket(f.ctx, "ics20-1", packet, nil)
		require.True(t, ack.Success(), "announce from %s should succeed", a.chainID)
	}

	results, err := f.agentKeeper.QueryRemoteAgents(f.ctx)
	require.NoError(t, err)
	require.Len(t, results, 3, "should have 3 remote agents from different chains")

	// Verify each agent is present.
	allJSON := ""
	for _, r := range results {
		allJSON += r + " "
	}
	for _, a := range agents {
		require.Contains(t, allJSON, a.chainID, "should contain agent from %s", a.chainID)
		require.Contains(t, allJSON, a.name, "should contain agent name %s", a.name)
	}
}

// ---------------------------------------------------------------------------
// Test: Task delegation memo format validation
// ---------------------------------------------------------------------------

func TestIBCTaskDelegationMemoFormat(t *testing.T) {
	// Verify the task delegation request memo is correctly structured.
	task := agentibc.TaskDelegationRequest{
		Description:    "Run GPU inference on llama-3 model",
		Requirements:   "gpu_compute,inference",
		Assignee:       "claw1assignee_address",
		SkillId:        42,
		Budget:         "5000000uclaw",
		DeadlineBlocks: 200,
	}

	req := agentibc.AgentDiscoveryRequest{
		Action: "delegate_task",
		Task:   &task,
	}

	outer := map[string]interface{}{
		agentibc.MetadataKey: req,
	}

	memoBytes, err := json.Marshal(outer)
	require.NoError(t, err)

	// Verify it round-trips through ParseAgentDiscovery.
	parsed := agentibc.ParseAgentDiscovery(string(memoBytes))
	require.NotNil(t, parsed)
	require.Equal(t, "delegate_task", parsed.Action)
	require.NotNil(t, parsed.Task)
	require.Equal(t, task.Description, parsed.Task.Description)
	require.Equal(t, task.Assignee, parsed.Task.Assignee)
	require.Equal(t, task.Budget, parsed.Task.Budget)
	require.Equal(t, task.DeadlineBlocks, parsed.Task.DeadlineBlocks)
	require.Equal(t, task.SkillId, parsed.Task.SkillId)
	require.Equal(t, task.Requirements, parsed.Task.Requirements)
}

// ---------------------------------------------------------------------------
// Test: Task query memo format validation
// ---------------------------------------------------------------------------

func TestIBCTaskQueryMemoFormat(t *testing.T) {
	taskResult := agentibc.TaskResultRequest{
		TaskId: 42,
	}

	req := agentibc.AgentDiscoveryRequest{
		Action:     "query_task",
		TaskResult: &taskResult,
	}

	outer := map[string]interface{}{
		agentibc.MetadataKey: req,
	}

	memoBytes, err := json.Marshal(outer)
	require.NoError(t, err)

	parsed := agentibc.ParseAgentDiscovery(string(memoBytes))
	require.NotNil(t, parsed)
	require.Equal(t, "query_task", parsed.Action)
	require.NotNil(t, parsed.TaskResult)
	require.Equal(t, uint64(42), parsed.TaskResult.TaskId)
}

// ---------------------------------------------------------------------------
// Test: IBC discovery response serialization
// ---------------------------------------------------------------------------

func TestIBCDiscoveryResponseSerialization(t *testing.T) {
	resp := agentibc.AgentDiscoveryResponse{
		Agents: []agentibc.DiscoveredAgent{
			{
				Address:    "claw1agent1",
				Name:       "inference-agent",
				Endpoint:   "https://agent1.clawchain.io",
				Tools:      []string{"gpu_compute", "inference"},
				Active:     true,
				Heartbeats: 100,
				Reputation: "excellent",
			},
			{
				Address:    "claw1agent2",
				Name:       "storage-agent",
				Endpoint:   "https://agent2.clawchain.io",
				Tools:      []string{"storage", "backup"},
				Active:     true,
				Heartbeats: 50,
			},
		},
	}

	bz, err := json.Marshal(resp)
	require.NoError(t, err)

	var decoded agentibc.AgentDiscoveryResponse
	require.NoError(t, json.Unmarshal(bz, &decoded))
	require.Len(t, decoded.Agents, 2)
	require.Equal(t, "claw1agent1", decoded.Agents[0].Address)
	require.Equal(t, "inference-agent", decoded.Agents[0].Name)
	require.True(t, decoded.Agents[0].Active)
	require.Equal(t, uint64(100), decoded.Agents[0].Heartbeats)
	require.Equal(t, "excellent", decoded.Agents[0].Reputation)
	require.Len(t, decoded.Agents[0].Tools, 2)
	require.Equal(t, "claw1agent2", decoded.Agents[1].Address)
}

// ---------------------------------------------------------------------------
// Test: Task delegation response and task result response serialization
// ---------------------------------------------------------------------------

func TestIBCTaskResponseSerialization(t *testing.T) {
	// TaskDelegationResponse
	delegResp := agentibc.TaskDelegationResponse{
		TaskId:  7,
		Success: true,
	}
	bz, err := json.Marshal(delegResp)
	require.NoError(t, err)
	var decodedDeleg agentibc.TaskDelegationResponse
	require.NoError(t, json.Unmarshal(bz, &decodedDeleg))
	require.Equal(t, uint64(7), decodedDeleg.TaskId)
	require.True(t, decodedDeleg.Success)

	// TaskResultResponse
	resultResp := agentibc.TaskResultResponse{
		TaskId: 7,
		Status: "completed",
		Result: "inference output: hello world",
	}
	bz, err = json.Marshal(resultResp)
	require.NoError(t, err)
	var decodedResult agentibc.TaskResultResponse
	require.NoError(t, json.Unmarshal(bz, &decodedResult))
	require.Equal(t, uint64(7), decodedResult.TaskId)
	require.Equal(t, "completed", decodedResult.Status)
	require.Equal(t, "inference output: hello world", decodedResult.Result)
	require.Empty(t, decodedResult.Error)
}
