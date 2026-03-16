//go:build integration

package ibc_test

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
	channeltypes "github.com/cosmos/ibc-go/v10/modules/core/04-channel/types"
	ibcexported "github.com/cosmos/ibc-go/v10/modules/core/exported"
	transfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"

	agentibc "clawchain/x/agent/ibc"
	"clawchain/x/agent/keeper"
	module "clawchain/x/agent/module"
	"clawchain/x/agent/types"
)

// ---------------------------------------------------------------------------
// Mock IBC module (underlying app)
// ---------------------------------------------------------------------------

// mockIBCModule is a minimal stub implementing porttypes.IBCModule.
// It returns a successful acknowledgement for any received packet.
type mockIBCModule struct{}

func (m mockIBCModule) OnChanOpenInit(
	_ sdk.Context, _ channeltypes.Order, _ []string,
	_ string, _ string, _ channeltypes.Counterparty, _ string,
) (string, error) {
	return "", nil
}

func (m mockIBCModule) OnChanOpenTry(
	_ sdk.Context, _ channeltypes.Order, _ []string,
	_, _ string, _ channeltypes.Counterparty, _ string,
) (string, error) {
	return "", nil
}

func (m mockIBCModule) OnChanOpenAck(_ sdk.Context, _, _, _, _ string) error {
	return nil
}

func (m mockIBCModule) OnChanOpenConfirm(_ sdk.Context, _, _ string) error {
	return nil
}

func (m mockIBCModule) OnChanCloseInit(_ sdk.Context, _, _ string) error {
	return nil
}

func (m mockIBCModule) OnChanCloseConfirm(_ sdk.Context, _, _ string) error {
	return nil
}

func (m mockIBCModule) OnRecvPacket(
	_ sdk.Context, _ string, _ channeltypes.Packet, _ sdk.AccAddress,
) ibcexported.Acknowledgement {
	return channeltypes.NewResultAcknowledgement([]byte(`{"result":"AQ=="}`))
}

func (m mockIBCModule) OnAcknowledgementPacket(
	_ sdk.Context, _ string, _ channeltypes.Packet, _ []byte, _ sdk.AccAddress,
) error {
	return nil
}

func (m mockIBCModule) OnTimeoutPacket(
	_ sdk.Context, _ string, _ channeltypes.Packet, _ sdk.AccAddress,
) error {
	return nil
}

// ---------------------------------------------------------------------------
// Mock bank keeper (satisfies types.BankKeeper)
// ---------------------------------------------------------------------------

type mockBankKeeper struct{}

func (m mockBankKeeper) SpendableCoins(_ context.Context, _ sdk.AccAddress) sdk.Coins {
	return sdk.Coins{}
}

func (m mockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, _ sdk.AccAddress, _ string, _ sdk.Coins) error {
	return nil
}

func (m mockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, _ string, _ sdk.AccAddress, _ sdk.Coins) error {
	return nil
}

func (m mockBankKeeper) BurnCoins(_ context.Context, _ string, _ sdk.Coins) error {
	return nil
}

func (m mockBankKeeper) MintCoins(_ context.Context, _ string, _ sdk.Coins) error {
	return nil
}

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

type ibcFixture struct {
	ctx        sdk.Context
	keeper     keeper.Keeper
	middleware agentibc.AgentIBCMiddleware
}

func initIBCFixture(t *testing.T) *ibcFixture {
	t.Helper()

	encCfg := moduletestutil.MakeTestEncodingConfig(module.AppModule{})
	addressCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	storeKey := storetypes.NewKVStoreKey(types.StoreKey)
	storeService := runtime.NewKVStoreService(storeKey)
	ctx := testutil.DefaultContextWithDB(t, storeKey, storetypes.NewTransientStoreKey("transient_test")).Ctx

	authority := authtypes.NewModuleAddress(types.GovModuleName)
	bk := mockBankKeeper{}

	k := keeper.NewKeeper(
		storeService,
		encCfg.Codec,
		addressCodec,
		authority,
		bk,
		nil, // mintKeeper
		nil, // reputationKeeper
	)

	// Initialize default params.
	params := types.DefaultParams()
	params.MinAgentDepositUclaw = 0
	if err := k.Params.Set(ctx, params); err != nil {
		t.Fatalf("failed to set params: %v", err)
	}

	mw := agentibc.NewAgentIBCMiddleware(mockIBCModule{}, &k)

	return &ibcFixture{
		ctx:        ctx,
		keeper:     k,
		middleware: mw,
	}
}

// makeTransferPacket builds an ICS-20 FungibleTokenPacketData as an IBC packet
// with the given memo.
func makeTransferPacket(memo string) channeltypes.Packet {
	data := transfertypes.FungibleTokenPacketData{
		Denom:    "uclaw",
		Amount:   "1000000",
		Sender:   "cosmos1sender",
		Receiver: "claw1receiver",
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

// parseAckResponse decodes the IBC acknowledgement bytes into an AgentDiscoveryResponse.
// IBC ResultAcknowledgement uses {"result":"<base64-encoded-payload>"} format.
func parseAckResponse(t *testing.T, ackBytes []byte) agentibc.AgentDiscoveryResponse {
	t.Helper()
	var resp agentibc.AgentDiscoveryResponse

	// Try to decode the IBC envelope: {"result":"<base64>"}
	var envelope struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(ackBytes, &envelope); err == nil && envelope.Result != "" {
		inner, err := base64.StdEncoding.DecodeString(envelope.Result)
		if err != nil {
			t.Fatalf("failed to base64-decode ack result: %v", err)
		}
		if err := json.Unmarshal(inner, &resp); err != nil {
			t.Fatalf("failed to unmarshal inner ack response: %v", err)
		}
		return resp
	}

	// Fallback: try direct unmarshal.
	if err := json.Unmarshal(ackBytes, &resp); err != nil {
		t.Fatalf("failed to unmarshal ack response: %v", err)
	}
	return resp
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestIBCAgentDiscoveryPacket constructs an IBC packet with agent announce data
// in the memo field, passes it through the middleware, and verifies the remote
// agent is stored in the keeper.
func TestIBCAgentDiscoveryPacket(t *testing.T) {
	f := initIBCFixture(t)

	memo := `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"osmosis-1","address":"osmo1abc","name":"test-agent","endpoint":"https://agent.example.com","tools":["transfer","query"]}}}`
	packet := makeTransferPacket(memo)

	ack := f.middleware.OnRecvPacket(f.ctx, "ics20-1", packet, nil)
	if ack == nil {
		t.Fatal("expected non-nil acknowledgement")
	}
	if !ack.Success() {
		t.Fatalf("expected successful ack, got: %s", string(ack.Acknowledgement()))
	}

	// Parse the acknowledgement to verify it was acknowledged.
	// The IBC ResultAcknowledgement wraps data as {"result":"<base64>"}.
	resp := parseAckResponse(t, ack.Acknowledgement())
	if !resp.Acknowledged {
		t.Fatalf("expected acknowledged=true in response, got: %s", string(ack.Acknowledgement()))
	}

	// Verify the remote agent was stored.
	results, err := f.keeper.QueryRemoteAgents(f.ctx)
	if err != nil {
		t.Fatalf("failed to query remote agents: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 remote agent, got %d", len(results))
	}

	var stored agentibc.RemoteAgentInfo
	if err := json.Unmarshal([]byte(results[0]), &stored); err != nil {
		t.Fatalf("failed to unmarshal stored agent: %v", err)
	}
	if stored.ChainID != "osmosis-1" {
		t.Fatalf("expected chain_id 'osmosis-1', got %q", stored.ChainID)
	}
	if stored.Address != "osmo1abc" {
		t.Fatalf("expected address 'osmo1abc', got %q", stored.Address)
	}
	if stored.Name != "test-agent" {
		t.Fatalf("expected name 'test-agent', got %q", stored.Name)
	}
	if len(stored.Tools) != 2 || stored.Tools[0] != "transfer" || stored.Tools[1] != "query" {
		t.Fatalf("unexpected tools: %v", stored.Tools)
	}
}

// TestIBCAgentDiscoveryInvalidMemo verifies that packets without agent memo
// are passed through unchanged (the underlying app's ack is returned).
func TestIBCAgentDiscoveryInvalidMemo(t *testing.T) {
	f := initIBCFixture(t)

	tests := []struct {
		name string
		memo string
	}{
		{"empty memo", ""},
		{"no agent key", `{"other_key":"value"}`},
		{"plain text", "just a normal transfer"},
		{"privacy only", `{"clawchain_privacy":{"auto_shield":true}}`},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			packet := makeTransferPacket(tc.memo)
			ack := f.middleware.OnRecvPacket(f.ctx, "ics20-1", packet, nil)
			if ack == nil {
				t.Fatal("expected non-nil acknowledgement")
			}
			if !ack.Success() {
				t.Fatalf("expected successful passthrough ack, got: %s", string(ack.Acknowledgement()))
			}

			// Verify no remote agents were stored.
			results, err := f.keeper.QueryRemoteAgents(f.ctx)
			if err != nil {
				t.Fatalf("failed to query remote agents: %v", err)
			}
			if len(results) != 0 {
				t.Fatalf("expected 0 remote agents for memo %q, got %d", tc.memo, len(results))
			}
		})
	}
}

// TestIBCRemoteAgentQuery stores some remote agents directly in the keeper,
// then queries them via the remote agents query endpoint and verifies results.
func TestIBCRemoteAgentQuery(t *testing.T) {
	f := initIBCFixture(t)

	// Store three remote agents via the keeper's StoreRemoteAgent method.
	agents := []struct {
		chain   string
		channel string
		info    agentibc.RemoteAgentInfo
	}{
		{
			chain:   "osmosis-1",
			channel: "channel-0",
			info: agentibc.RemoteAgentInfo{
				ChainID:  "osmosis-1",
				Address:  "osmo1aaa",
				Name:     "osmo-agent-1",
				Endpoint: "https://osmo1.example.com",
				Tools:    []string{"swap", "pool"},
			},
		},
		{
			chain:   "osmosis-1",
			channel: "channel-0",
			info: agentibc.RemoteAgentInfo{
				ChainID:  "osmosis-1",
				Address:  "osmo1bbb",
				Name:     "osmo-agent-2",
				Endpoint: "https://osmo2.example.com",
				Tools:    []string{"query"},
			},
		},
		{
			chain:   "juno-1",
			channel: "channel-3",
			info: agentibc.RemoteAgentInfo{
				ChainID:  "juno-1",
				Address:  "juno1ccc",
				Name:     "juno-agent-1",
				Endpoint: "https://juno.example.com",
				Tools:    []string{"compute"},
			},
		},
	}

	for _, a := range agents {
		if err := f.keeper.StoreRemoteAgent(f.ctx, a.chain, a.channel, a.info); err != nil {
			t.Fatalf("failed to store agent %s: %v", a.info.Name, err)
		}
	}

	// Query via the query server.
	qs := keeper.NewQueryServerImpl(f.keeper)
	resp, err := qs.RemoteAgents(f.ctx, &types.QueryRemoteAgentsRequest{})
	if err != nil {
		t.Fatalf("RemoteAgents query failed: %v", err)
	}
	if len(resp.Agents) != 3 {
		t.Fatalf("expected 3 remote agents, got %d", len(resp.Agents))
	}

	// Verify each stored agent can be deserialized.
	found := make(map[string]bool)
	for _, raw := range resp.Agents {
		var info agentibc.RemoteAgentInfo
		if err := json.Unmarshal([]byte(raw), &info); err != nil {
			t.Fatalf("failed to unmarshal agent: %v (raw: %s)", err, raw)
		}
		found[info.Name] = true
	}

	for _, expectedName := range []string{"osmo-agent-1", "osmo-agent-2", "juno-agent-1"} {
		if !found[expectedName] {
			t.Fatalf("expected agent %q not found in results", expectedName)
		}
	}
}

// TestIBCAgentDiscoveryDuplicate sends the same agent announcement twice and
// verifies it updates the existing entry rather than creating a duplicate.
func TestIBCAgentDiscoveryDuplicate(t *testing.T) {
	f := initIBCFixture(t)

	// First announcement.
	memo1 := `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"osmosis-1","address":"osmo1abc","name":"agent-v1","endpoint":"https://v1.example.com","tools":["transfer"]}}}`
	packet1 := makeTransferPacket(memo1)
	ack1 := f.middleware.OnRecvPacket(f.ctx, "ics20-1", packet1, nil)
	if ack1 == nil || !ack1.Success() {
		t.Fatal("first announce failed")
	}

	// Second announcement with updated fields (same chain_id + address).
	memo2 := `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"osmosis-1","address":"osmo1abc","name":"agent-v2","endpoint":"https://v2.example.com","tools":["transfer","query"]}}}`
	packet2 := makeTransferPacket(memo2)
	ack2 := f.middleware.OnRecvPacket(f.ctx, "ics20-1", packet2, nil)
	if ack2 == nil || !ack2.Success() {
		t.Fatal("second announce failed")
	}

	// Verify only one remote agent exists (not two).
	results, err := f.keeper.QueryRemoteAgents(f.ctx)
	if err != nil {
		t.Fatalf("failed to query remote agents: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 remote agent (upsert), got %d", len(results))
	}

	// Verify it has the updated data from the second announcement.
	var stored agentibc.RemoteAgentInfo
	if err := json.Unmarshal([]byte(results[0]), &stored); err != nil {
		t.Fatalf("failed to unmarshal stored agent: %v", err)
	}
	if stored.Name != "agent-v2" {
		t.Fatalf("expected updated name 'agent-v2', got %q", stored.Name)
	}
	if stored.Endpoint != "https://v2.example.com" {
		t.Fatalf("expected updated endpoint, got %q", stored.Endpoint)
	}
	if len(stored.Tools) != 2 {
		t.Fatalf("expected 2 tools after update, got %d", len(stored.Tools))
	}
}

// TestIBCAgentDiscoveryMalformedData verifies that malformed memo data is
// handled gracefully -- the middleware should not panic or return an error ack.
func TestIBCAgentDiscoveryMalformedData(t *testing.T) {
	f := initIBCFixture(t)

	tests := []struct {
		name string
		memo string
	}{
		{
			name: "truncated JSON",
			memo: `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"osmo`,
		},
		{
			name: "wrong type for action",
			memo: `{"clawchain_agent":{"action":12345}}`,
		},
		{
			name: "null agent key",
			memo: `{"clawchain_agent":null}`,
		},
		{
			name: "agent key is string",
			memo: `{"clawchain_agent":"not an object"}`,
		},
		{
			name: "announce without remote_agent",
			memo: `{"clawchain_agent":{"action":"announce"}}`,
		},
		{
			name: "empty action",
			memo: `{"clawchain_agent":{"action":""}}`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			packet := makeTransferPacket(tc.memo)

			// The middleware must not panic.
			ack := f.middleware.OnRecvPacket(f.ctx, "ics20-1", packet, nil)
			if ack == nil {
				t.Fatal("expected non-nil acknowledgement even for malformed data")
			}

			// The ack should still be a success (either passthrough or error in JSON body).
			// The middleware never returns an error ack -- it either passes through
			// or wraps errors in a result ack with an error field.
			if !ack.Success() {
				t.Fatalf("expected successful ack (passthrough or error-in-body), got failure: %s", string(ack.Acknowledgement()))
			}
		})
	}

	// Verify no agents were stored from any malformed data.
	results, err := f.keeper.QueryRemoteAgents(f.ctx)
	if err != nil {
		t.Fatalf("failed to query remote agents: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 remote agents after malformed data tests, got %d", len(results))
	}
}
