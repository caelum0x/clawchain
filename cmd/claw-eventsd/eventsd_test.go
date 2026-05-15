package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// TestHubBroadcast — multiple clients receive events
// ---------------------------------------------------------------------------

func TestHubBroadcast(t *testing.T) {
	hub := NewHub()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	const numClients = 5
	clients := make([]*Client, numClients)
	for i := 0; i < numClients; i++ {
		c := &Client{
			send: make(chan []byte, 16),
			hub:  hub,
		}
		hub.register <- c
		clients[i] = c
	}

	// Give the hub time to process registrations.
	time.Sleep(50 * time.Millisecond)

	if got := hub.ClientCount(); got != numClients {
		t.Fatalf("expected %d clients, got %d", numClients, got)
	}

	// Broadcast a message.
	msg := []byte(`{"type":"new_block","data":{"height":42}}`)
	hub.Broadcast(msg)

	// Each client should receive it.
	for i, c := range clients {
		select {
		case received := <-c.send:
			if string(received) != string(msg) {
				t.Errorf("client %d: expected %s, got %s", i, msg, received)
			}
		case <-time.After(time.Second):
			t.Errorf("client %d: timeout waiting for broadcast", i)
		}
	}
}

// ---------------------------------------------------------------------------
// TestClientDisconnect — cleanup on disconnect
// ---------------------------------------------------------------------------

func TestClientDisconnect(t *testing.T) {
	hub := NewHub()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	c := &Client{
		send: make(chan []byte, 16),
		hub:  hub,
	}
	hub.register <- c

	time.Sleep(50 * time.Millisecond)
	if got := hub.ClientCount(); got != 1 {
		t.Fatalf("expected 1 client, got %d", got)
	}

	hub.unregister <- c

	time.Sleep(50 * time.Millisecond)
	if got := hub.ClientCount(); got != 0 {
		t.Fatalf("expected 0 clients after disconnect, got %d", got)
	}
}

// ---------------------------------------------------------------------------
// TestHealthEndpoint — returns 200 + status
// ---------------------------------------------------------------------------

func TestHealthEndpoint(t *testing.T) {
	upstream := &UpstreamState{}
	upstream.connected.Store(true)

	handler := makeHealthHandler(upstream)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp HealthResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.Status != "ok" {
		t.Errorf("expected status 'ok', got %q", resp.Status)
	}
	if !resp.UpstreamConnected {
		t.Error("expected upstream_connected=true")
	}

	// Test with upstream disconnected.
	upstream.connected.Store(false)
	req2 := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)

	var resp2 HealthResponse
	if err := json.NewDecoder(rec2.Body).Decode(&resp2); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp2.UpstreamConnected {
		t.Error("expected upstream_connected=false")
	}
}

// ---------------------------------------------------------------------------
// TestStatsEndpoint — returns connection counts
// ---------------------------------------------------------------------------

func TestStatsEndpoint(t *testing.T) {
	hub := NewHub()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	upstream := &UpstreamState{}
	upstream.connected.Store(true)

	// Register two clients.
	for i := 0; i < 2; i++ {
		c := &Client{
			send: make(chan []byte, 16),
			hub:  hub,
		}
		hub.register <- c
	}

	// Simulate some relayed events.
	hub.blocksRelayed.Store(100)
	hub.txsRelayed.Store(250)

	time.Sleep(50 * time.Millisecond)

	handler := makeStatsHandler(hub, upstream)
	req := httptest.NewRequest(http.MethodGet, "/stats", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp StatsResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.ConnectedClients != 2 {
		t.Errorf("expected 2 connected_clients, got %d", resp.ConnectedClients)
	}
	if !resp.UpstreamConnected {
		t.Error("expected upstream_connected=true")
	}
	if resp.BlocksRelayed != 100 {
		t.Errorf("expected blocks_relayed=100, got %d", resp.BlocksRelayed)
	}
	if resp.TxsRelayed != 250 {
		t.Errorf("expected txs_relayed=250, got %d", resp.TxsRelayed)
	}
}

// ---------------------------------------------------------------------------
// TestParseNewBlockEvent — extracts height, time, num_txs
// ---------------------------------------------------------------------------

func TestParseNewBlockEvent(t *testing.T) {
	raw := `{
		"result": {
			"query": "tm.event='NewBlock'",
			"data": {
				"type": "tendermint/event/NewBlock",
				"value": {
					"block": {
						"header": {
							"height": "12345",
							"time": "2026-03-07T10:00:00Z",
							"proposer_address": "ABCDEF1234567890"
						},
						"data": {
							"txs": ["dHgx", "dHgy", "dHgz"]
						}
					}
				}
			}
		}
	}`

	be, err := ParseNewBlockEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if be.Height != 12345 {
		t.Errorf("expected height 12345, got %d", be.Height)
	}
	if be.Time != "2026-03-07T10:00:00Z" {
		t.Errorf("expected time 2026-03-07T10:00:00Z, got %s", be.Time)
	}
	if be.NumTxs != 3 {
		t.Errorf("expected 3 txs, got %d", be.NumTxs)
	}
	if be.Proposer != "ABCDEF1234567890" {
		t.Errorf("expected proposer ABCDEF1234567890, got %s", be.Proposer)
	}
}

func TestParseNewBlockEvent_MissingHeight(t *testing.T) {
	raw := `{"result":{"data":{"value":{"block":{"header":{}}}}}}`
	_, err := ParseNewBlockEvent([]byte(raw))
	if err == nil {
		t.Fatal("expected error for missing height")
	}
}

func TestParseNewBlockEvent_InvalidJSON(t *testing.T) {
	_, err := ParseNewBlockEvent([]byte(`{invalid`))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

// ---------------------------------------------------------------------------
// TestParseNewTxEvent — extracts hash, type, sender
// ---------------------------------------------------------------------------

func TestParseNewTxEvent(t *testing.T) {
	raw := `{
		"result": {
			"query": "tm.event='Tx'",
			"events": {
				"tx.hash": ["AABBCCDD11223344"],
				"message.sender": ["claw1abc123"],
				"message.action": ["/cosmos.bank.v1beta1.MsgSend"]
			},
			"data": {
				"type": "tendermint/event/Tx",
				"value": {
					"TxResult": {
						"height": "999",
						"result": {
							"gas_used": "50000",
							"events": []
						}
					}
				}
			}
		}
	}`

	te, err := ParseNewTxEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if te.Hash != "AABBCCDD11223344" {
		t.Errorf("expected hash AABBCCDD11223344, got %s", te.Hash)
	}
	if te.Height != 999 {
		t.Errorf("expected height 999, got %d", te.Height)
	}
	if te.Type != "MsgSend" {
		t.Errorf("expected type MsgSend, got %s", te.Type)
	}
	if te.Sender != "claw1abc123" {
		t.Errorf("expected sender claw1abc123, got %s", te.Sender)
	}
	if te.GasUsed != 50000 {
		t.Errorf("expected gas_used 50000, got %d", te.GasUsed)
	}
}

func TestParseNewTxEvent_InnerEvents(t *testing.T) {
	// When the top-level events map does not have message.action, fall back
	// to scanning inner result events.
	raw := `{
		"result": {
			"events": {
				"tx.hash": ["DEADBEEF"],
				"message.sender": ["claw1xyz"]
			},
			"data": {
				"type": "tendermint/event/Tx",
				"value": {
					"TxResult": {
						"height": "500",
						"result": {
							"gas_used": "10000",
							"events": [
								{
									"type": "message",
									"attributes": [
										{"key": "action", "value": "/clawchain.agent.v1.MsgRegisterAgent"}
									]
								}
							]
						}
					}
				}
			}
		}
	}`

	te, err := ParseNewTxEvent([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if te.Type != "MsgRegisterAgent" {
		t.Errorf("expected type MsgRegisterAgent, got %s", te.Type)
	}
}

func TestParseNewTxEvent_MissingHeight(t *testing.T) {
	raw := `{"result":{"events":{},"data":{"value":{"TxResult":{"height":""}}}}}`
	_, err := ParseNewTxEvent([]byte(raw))
	if err == nil {
		t.Fatal("expected error for missing height")
	}
}

func TestParseNewTxEvent_InvalidJSON(t *testing.T) {
	_, err := ParseNewTxEvent([]byte(`not json`))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

// ---------------------------------------------------------------------------
// TestReconnectBackoff — backoff increases then caps
// ---------------------------------------------------------------------------

func TestReconnectBackoff(t *testing.T) {
	// Attempt 0: 1s
	d0 := ReconnectBackoff(0)
	if d0 != 1*time.Second {
		t.Errorf("attempt 0: expected 1s, got %v", d0)
	}

	// Attempt 1: 2s
	d1 := ReconnectBackoff(1)
	if d1 != 2*time.Second {
		t.Errorf("attempt 1: expected 2s, got %v", d1)
	}

	// Attempt 2: 4s
	d2 := ReconnectBackoff(2)
	if d2 != 4*time.Second {
		t.Errorf("attempt 2: expected 4s, got %v", d2)
	}

	// Attempt 3: 8s
	d3 := ReconnectBackoff(3)
	if d3 != 8*time.Second {
		t.Errorf("attempt 3: expected 8s, got %v", d3)
	}

	// Attempt 4: 16s
	d4 := ReconnectBackoff(4)
	if d4 != 16*time.Second {
		t.Errorf("attempt 4: expected 16s, got %v", d4)
	}

	// Attempt 5: should cap at 30s (2^5 = 32 > 30)
	d5 := ReconnectBackoff(5)
	if d5 != 30*time.Second {
		t.Errorf("attempt 5: expected 30s (cap), got %v", d5)
	}

	// Very large attempt: still capped at 30s
	d100 := ReconnectBackoff(100)
	if d100 != 30*time.Second {
		t.Errorf("attempt 100: expected 30s (cap), got %v", d100)
	}

	// Verify monotonic increase up to cap.
	prev := ReconnectBackoff(0)
	for i := 1; i <= 10; i++ {
		cur := ReconnectBackoff(i)
		if cur < prev {
			t.Errorf("attempt %d: backoff decreased from %v to %v", i, prev, cur)
		}
		if cur > 30*time.Second {
			t.Errorf("attempt %d: backoff %v exceeds cap 30s", i, cur)
		}
		prev = cur
	}
}

// ---------------------------------------------------------------------------
// TestExtractMsgType
// ---------------------------------------------------------------------------

func TestExtractMsgType(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"/cosmos.bank.v1beta1.MsgSend", "MsgSend"},
		{"/clawchain.agent.v1.MsgRegisterAgent", "MsgRegisterAgent"},
		{"MsgSend", "MsgSend"},
		{"/MsgSend", "MsgSend"},
		{"", ""},
	}
	for _, tc := range tests {
		got := extractMsgType(tc.input)
		if got != tc.want {
			t.Errorf("extractMsgType(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

// ---------------------------------------------------------------------------
// TestHandleUpstreamMessage — integration of parse + broadcast
// ---------------------------------------------------------------------------

func TestHandleUpstreamMessage_Block(t *testing.T) {
	hub := NewHub()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	c := &Client{send: make(chan []byte, 16), hub: hub}
	hub.register <- c
	time.Sleep(50 * time.Millisecond)

	raw := `{
		"result": {
			"query": "tm.event='NewBlock'",
			"data": {
				"type": "tendermint/event/NewBlock",
				"value": {
					"block": {
						"header": {
							"height": "777",
							"time": "2026-03-07T12:00:00Z",
							"proposer_address": "PROP123"
						},
						"data": {"txs": ["a"]}
					}
				}
			}
		}
	}`

	handleUpstreamMessage([]byte(raw), hub)

	select {
	case msg := <-c.send:
		var out OutboundEvent
		if err := json.Unmarshal(msg, &out); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if out.Type != "new_block" {
			t.Errorf("expected type new_block, got %s", out.Type)
		}
		// Check the data fields.
		data, _ := json.Marshal(out.Data)
		var be BlockEvent
		json.Unmarshal(data, &be)
		if be.Height != 777 {
			t.Errorf("expected height 777, got %d", be.Height)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for broadcast")
	}

	if hub.blocksRelayed.Load() != 1 {
		t.Errorf("expected blocksRelayed=1, got %d", hub.blocksRelayed.Load())
	}
}

func TestHandleUpstreamMessage_Tx(t *testing.T) {
	hub := NewHub()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	c := &Client{send: make(chan []byte, 16), hub: hub}
	hub.register <- c
	time.Sleep(50 * time.Millisecond)

	raw := `{
		"result": {
			"query": "tm.event='Tx'",
			"events": {
				"tx.hash": ["HASH123"],
				"message.sender": ["claw1sender"],
				"message.action": ["/cosmos.bank.v1beta1.MsgSend"]
			},
			"data": {
				"type": "tendermint/event/Tx",
				"value": {
					"TxResult": {
						"height": "888",
						"result": {"gas_used": "75000", "events": []}
					}
				}
			}
		}
	}`

	handleUpstreamMessage([]byte(raw), hub)

	select {
	case msg := <-c.send:
		var out OutboundEvent
		if err := json.Unmarshal(msg, &out); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if out.Type != "new_tx" {
			t.Errorf("expected type new_tx, got %s", out.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for broadcast")
	}

	if hub.txsRelayed.Load() != 1 {
		t.Errorf("expected txsRelayed=1, got %d", hub.txsRelayed.Load())
	}
}

// ---------------------------------------------------------------------------
// TestWSEndpoint — full round-trip through httptest WebSocket server
// ---------------------------------------------------------------------------

func TestWSEndpoint(t *testing.T) {
	hub := NewHub()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)

	// Create an httptest server with the /ws handler.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serveWS(hub, w, r)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/"

	// Connect two clients.
	var wg sync.WaitGroup
	received := make([]chan string, 2)
	for i := 0; i < 2; i++ {
		received[i] = make(chan string, 10)
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			dialer := websocket.Dialer{}
			conn, _, err := dialer.Dial(wsURL, nil)
			if err != nil {
				t.Errorf("client %d dial: %v", i, err)
				return
			}
			defer conn.Close()

			// Read one message.
			_, msg, err := conn.ReadMessage()
			if err != nil {
				t.Errorf("client %d read: %v", i, err)
				return
			}
			received[i] <- string(msg)
		}()
	}

	// Wait for clients to connect.
	time.Sleep(100 * time.Millisecond)

	// Broadcast a test event.
	testEvent := `{"type":"new_block","data":{"height":1}}`
	hub.Broadcast([]byte(testEvent))

	// Verify both clients received it.
	for i := 0; i < 2; i++ {
		select {
		case msg := <-received[i]:
			if msg != testEvent {
				t.Errorf("client %d: expected %s, got %s", i, testEvent, msg)
			}
		case <-time.After(2 * time.Second):
			t.Errorf("client %d: timeout waiting for message", i)
		}
	}
}

// ---------------------------------------------------------------------------
// TestCORSHeaders — CORS middleware sets correct headers
// ---------------------------------------------------------------------------

func TestCORSHeaders(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := corsMiddleware(inner)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("expected ACAO=*, got %q", got)
	}

	// OPTIONS preflight.
	optReq := httptest.NewRequest(http.MethodOptions, "/health", nil)
	optRec := httptest.NewRecorder()
	handler.ServeHTTP(optRec, optReq)

	if optRec.Code != http.StatusOK {
		t.Errorf("expected 200 for OPTIONS, got %d", optRec.Code)
	}
}

// ---------------------------------------------------------------------------
// TestLoadConfig — environment variable overrides
// ---------------------------------------------------------------------------

func TestLoadConfig(t *testing.T) {
	// Defaults.
	cfg := loadConfig()
	if cfg.Listen != ":8891" {
		t.Errorf("expected default listen :8891, got %s", cfg.Listen)
	}
	if cfg.ChainRPC != "http://localhost:26657" {
		t.Errorf("expected default ChainRPC, got %s", cfg.ChainRPC)
	}
	if cfg.ChainWS != "ws://localhost:26657/websocket" {
		t.Errorf("expected default ChainWS, got %s", cfg.ChainWS)
	}

	// Override via env.
	t.Setenv("EVENTSD_LISTEN", ":9999")
	t.Setenv("CHAIN_RPC", "http://custom:26657")
	t.Setenv("CHAIN_WS", "ws://custom:26657/websocket")

	cfg2 := loadConfig()
	if cfg2.Listen != ":9999" {
		t.Errorf("expected :9999, got %s", cfg2.Listen)
	}
	if cfg2.ChainRPC != "http://custom:26657" {
		t.Errorf("expected custom ChainRPC, got %s", cfg2.ChainRPC)
	}
	if cfg2.ChainWS != "ws://custom:26657/websocket" {
		t.Errorf("expected custom ChainWS, got %s", cfg2.ChainWS)
	}
}
