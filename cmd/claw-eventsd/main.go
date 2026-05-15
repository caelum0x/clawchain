// Package main implements claw-eventsd, a WebSocket event proxy that connects
// to CometBFT's WebSocket and relays real-time block/tx events to browser
// clients.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Config holds the service configuration derived from environment variables.
type Config struct {
	Listen  string // EVENTSD_LISTEN  (default ":8891")
	ChainRPC string // CHAIN_RPC       (default "http://localhost:26657")
	ChainWS  string // CHAIN_WS        (default "ws://localhost:26657/websocket")
}

func loadConfig() Config {
	c := Config{
		Listen:   ":8891",
		ChainRPC: "http://localhost:26657",
		ChainWS:  "ws://localhost:26657/websocket",
	}
	if v := os.Getenv("EVENTSD_LISTEN"); v != "" {
		c.Listen = v
	}
	if v := os.Getenv("CHAIN_RPC"); v != "" {
		c.ChainRPC = v
	}
	if v := os.Getenv("CHAIN_WS"); v != "" {
		c.ChainWS = v
	}
	return c
}

// ---------------------------------------------------------------------------
// Event types sent to browser clients
// ---------------------------------------------------------------------------

// BlockEvent is the JSON payload for a new_block event.
type BlockEvent struct {
	Height   int64  `json:"height"`
	Time     string `json:"time"`
	NumTxs   int    `json:"num_txs"`
	Proposer string `json:"proposer"`
}

// TxEvent is the JSON payload for a new_tx event.
type TxEvent struct {
	Hash    string `json:"hash"`
	Height  int64  `json:"height"`
	Type    string `json:"type"`
	Sender  string `json:"sender"`
	GasUsed int64  `json:"gas_used"`
}

// OutboundEvent is the top-level envelope sent over the WebSocket to browsers.
type OutboundEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// ---------------------------------------------------------------------------
// Hub — fan-out broadcaster
// ---------------------------------------------------------------------------

// Client represents a single connected browser WebSocket.
type Client struct {
	send chan []byte
	hub  *Hub
}

// Hub maintains the set of active clients and broadcasts messages to them.
type Hub struct {
	mu         sync.RWMutex
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client

	// Stats
	blocksRelayed atomic.Int64
	txsRelayed    atomic.Int64
}

// NewHub creates and returns a new Hub.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run starts the hub's main loop. It should be called in its own goroutine.
func (h *Hub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			h.mu.Lock()
			for c := range h.clients {
				close(c.send)
				delete(h.clients, c)
			}
			h.mu.Unlock()
			return
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				close(client.send)
				delete(h.clients, client)
			}
			h.mu.Unlock()
		case msg := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- msg:
				default:
					// Slow client — drop and clean up.
					go func(c *Client) {
						h.unregister <- c
					}(client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// ClientCount returns the number of connected clients.
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Broadcast sends a raw JSON message to all connected clients.
func (h *Hub) Broadcast(data []byte) {
	select {
	case h.broadcast <- data:
	default:
		// broadcast channel full — drop
	}
}

// ---------------------------------------------------------------------------
// CometBFT event parsing
// ---------------------------------------------------------------------------

// ParseNewBlockEvent extracts a BlockEvent from a raw CometBFT JSON-RPC
// NewBlock event message.
func ParseNewBlockEvent(raw []byte) (*BlockEvent, error) {
	var msg struct {
		Result struct {
			Data struct {
				Value struct {
					Block struct {
						Header struct {
							Height          string `json:"height"`
							Time            string `json:"time"`
							ProposerAddress string `json:"proposer_address"`
						} `json:"header"`
						Data struct {
							Txs []interface{} `json:"txs"`
						} `json:"data"`
					} `json:"block"`
				} `json:"value"`
			} `json:"data"`
		} `json:"result"`
	}

	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil, fmt.Errorf("unmarshal block event: %w", err)
	}

	header := msg.Result.Data.Value.Block.Header
	if header.Height == "" {
		return nil, fmt.Errorf("missing height in block event")
	}

	height, err := strconv.ParseInt(header.Height, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("parse height: %w", err)
	}

	return &BlockEvent{
		Height:   height,
		Time:     header.Time,
		NumTxs:   len(msg.Result.Data.Value.Block.Data.Txs),
		Proposer: header.ProposerAddress,
	}, nil
}

// ParseNewTxEvent extracts a TxEvent from a raw CometBFT JSON-RPC Tx event
// message.
func ParseNewTxEvent(raw []byte) (*TxEvent, error) {
	// CometBFT Tx event structure:
	// { result: { events: {"tx.hash": [...], "message.sender": [...], ...},
	//             data: { value: { TxResult: { height, tx, result: { gas_used, events } } } } } }
	var msg struct {
		Result struct {
			Events map[string][]string `json:"events"`
			Data   struct {
				Value struct {
					TxResult struct {
						Height string `json:"height"`
						Result struct {
							GasUsed string `json:"gas_used"`
							Events  []struct {
								Type       string `json:"type"`
								Attributes []struct {
									Key   string `json:"key"`
									Value string `json:"value"`
								} `json:"attributes"`
							} `json:"events"`
						} `json:"result"`
					} `json:"TxResult"`
				} `json:"value"`
			} `json:"data"`
		} `json:"result"`
	}

	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil, fmt.Errorf("unmarshal tx event: %w", err)
	}

	txResult := msg.Result.Data.Value.TxResult
	if txResult.Height == "" {
		return nil, fmt.Errorf("missing height in tx event")
	}

	height, err := strconv.ParseInt(txResult.Height, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("parse height: %w", err)
	}

	gasUsed, _ := strconv.ParseInt(txResult.Result.GasUsed, 10, 64)

	// Extract tx hash from top-level events map.
	txHash := ""
	if hashes, ok := msg.Result.Events["tx.hash"]; ok && len(hashes) > 0 {
		txHash = hashes[0]
	}

	// Extract sender from events map.
	sender := ""
	if senders, ok := msg.Result.Events["message.sender"]; ok && len(senders) > 0 {
		sender = senders[0]
	}

	// Extract message type — look for "message" event with "action" attribute,
	// or fall back to the top-level events map.
	msgType := ""
	if actions, ok := msg.Result.Events["message.action"]; ok && len(actions) > 0 {
		msgType = extractMsgType(actions[0])
	}
	if msgType == "" {
		// Scan inner events for "message" type with action attribute.
		for _, ev := range txResult.Result.Events {
			if ev.Type == "message" {
				for _, attr := range ev.Attributes {
					if attr.Key == "action" && attr.Value != "" {
						msgType = extractMsgType(attr.Value)
						break
					}
				}
			}
			if msgType != "" {
				break
			}
		}
	}

	return &TxEvent{
		Hash:    txHash,
		Height:  height,
		Type:    msgType,
		Sender:  sender,
		GasUsed: gasUsed,
	}, nil
}

// extractMsgType takes a full protobuf message URL like
// "/cosmos.bank.v1beta1.MsgSend" and returns just "MsgSend".
func extractMsgType(action string) string {
	if idx := strings.LastIndex(action, "."); idx >= 0 {
		return action[idx+1:]
	}
	// Strip leading slash if present.
	return strings.TrimPrefix(action, "/")
}

// ---------------------------------------------------------------------------
// Upstream CometBFT connection with reconnect
// ---------------------------------------------------------------------------

const (
	// Backoff parameters for upstream reconnection.
	baseReconnectDelay = 1 * time.Second
	maxReconnectDelay  = 30 * time.Second
	backoffMultiplier  = 2.0

	// Ping interval for upstream connection keepalive.
	upstreamPingInterval = 20 * time.Second
)

// ReconnectBackoff computes the delay for the given attempt number, capped at
// maxReconnectDelay.
func ReconnectBackoff(attempt int) time.Duration {
	delay := float64(baseReconnectDelay) * math.Pow(backoffMultiplier, float64(attempt))
	if delay > float64(maxReconnectDelay) {
		delay = float64(maxReconnectDelay)
	}
	return time.Duration(delay)
}

// UpstreamState tracks the upstream CometBFT WebSocket connection status.
type UpstreamState struct {
	connected atomic.Bool
}

// runUpstream connects to the CometBFT WebSocket and reads events, broadcasting
// them to the hub. It automatically reconnects with exponential backoff on
// disconnection.
func runUpstream(ctx context.Context, wsURL string, hub *Hub, state *UpstreamState) {
	attempt := 0
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if attempt > 0 {
			delay := ReconnectBackoff(attempt)
			log.Printf("upstream: reconnecting in %v (attempt %d)", delay, attempt)
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return
			}
		}

		err := connectAndStream(ctx, wsURL, hub, state)
		if err != nil {
			log.Printf("upstream: connection error: %v", err)
		}
		state.connected.Store(false)
		attempt++
	}
}

func connectAndStream(ctx context.Context, wsURL string, hub *Hub, state *UpstreamState) error {
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, _, err := dialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	state.connected.Store(true)
	log.Printf("upstream: connected to %s", wsURL)

	// Subscribe to NewBlock events.
	blockSub := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "subscribe",
		"id":      1,
		"params":  map[string]string{"query": "tm.event='NewBlock'"},
	}
	if err := conn.WriteJSON(blockSub); err != nil {
		return fmt.Errorf("subscribe NewBlock: %w", err)
	}

	// Subscribe to Tx events.
	txSub := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "subscribe",
		"id":      2,
		"params":  map[string]string{"query": "tm.event='Tx'"},
	}
	if err := conn.WriteJSON(txSub); err != nil {
		return fmt.Errorf("subscribe Tx: %w", err)
	}

	// Ping ticker for keepalive.
	pingTicker := time.NewTicker(upstreamPingInterval)
	defer pingTicker.Stop()

	// Read messages in a goroutine so we can also handle context cancellation
	// and pings.
	msgCh := make(chan []byte, 64)
	errCh := make(chan error, 1)

	go func() {
		for {
			_, message, readErr := conn.ReadMessage()
			if readErr != nil {
				errCh <- readErr
				return
			}
			msgCh <- message
		}
	}()

	for {
		select {
		case <-ctx.Done():
			_ = conn.WriteMessage(
				websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
			)
			return ctx.Err()

		case <-pingTicker.C:
			if writeErr := conn.WriteMessage(websocket.PingMessage, nil); writeErr != nil {
				return fmt.Errorf("ping: %w", writeErr)
			}

		case readErr := <-errCh:
			return fmt.Errorf("read: %w", readErr)

		case raw := <-msgCh:
			handleUpstreamMessage(raw, hub)
		}
	}
}

func handleUpstreamMessage(raw []byte, hub *Hub) {
	// Quick peek to determine event type.
	var peek struct {
		Result struct {
			Query string `json:"query"`
			Data  struct {
				Type string `json:"type"`
			} `json:"data"`
		} `json:"result"`
	}
	if err := json.Unmarshal(raw, &peek); err != nil {
		return
	}

	switch {
	case strings.Contains(peek.Result.Query, "NewBlock") ||
		peek.Result.Data.Type == "tendermint/event/NewBlock":
		be, err := ParseNewBlockEvent(raw)
		if err != nil {
			log.Printf("parse block event: %v", err)
			return
		}
		out := OutboundEvent{Type: "new_block", Data: be}
		data, _ := json.Marshal(out)
		hub.Broadcast(data)
		hub.blocksRelayed.Add(1)

	case strings.Contains(peek.Result.Query, "Tx") ||
		peek.Result.Data.Type == "tendermint/event/Tx":
		te, err := ParseNewTxEvent(raw)
		if err != nil {
			log.Printf("parse tx event: %v", err)
			return
		}
		out := OutboundEvent{Type: "new_tx", Data: te}
		data, _ := json.Marshal(out)
		hub.Broadcast(data)
		hub.txsRelayed.Add(1)
	}
}

// ---------------------------------------------------------------------------
// HTTP / WebSocket handlers
// ---------------------------------------------------------------------------

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev/local use.
	},
}

const (
	// Time allowed to write a message to the peer.
	clientWriteWait = 10 * time.Second
	// Time allowed to read the next pong message from the peer.
	clientPongWait = 60 * time.Second
	// Send pings to peer with this period (must be less than pongWait).
	clientPingPeriod = 54 * time.Second
)

func serveWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}

	client := &Client{
		send: make(chan []byte, 256),
		hub:  hub,
	}
	hub.register <- client

	go clientWritePump(conn, client)
	go clientReadPump(conn, client)
}

func clientReadPump(conn *websocket.Conn, client *Client) {
	defer func() {
		client.hub.unregister <- client
		conn.Close()
	}()

	conn.SetReadDeadline(time.Now().Add(clientPongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(clientPongWait))
		return nil
	})

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func clientWritePump(conn *websocket.Conn, client *Client) {
	ticker := time.NewTicker(clientPingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case msg, ok := <-client.send:
			conn.SetWriteDeadline(time.Now().Add(clientWriteWait))
			if !ok {
				// Hub closed the channel.
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(clientWriteWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// HealthResponse is the JSON payload for the /health endpoint.
type HealthResponse struct {
	Status            string `json:"status"`
	UpstreamConnected bool   `json:"upstream_connected"`
}

// StatsResponse is the JSON payload for the /stats endpoint.
type StatsResponse struct {
	ConnectedClients  int   `json:"connected_clients"`
	UpstreamConnected bool  `json:"upstream_connected"`
	BlocksRelayed     int64 `json:"blocks_relayed"`
	TxsRelayed        int64 `json:"txs_relayed"`
}

func makeHealthHandler(upstream *UpstreamState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp := HealthResponse{
			Status:            "ok",
			UpstreamConnected: upstream.connected.Load(),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func makeStatsHandler(hub *Hub, upstream *UpstreamState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp := StatsResponse{
			ConnectedClients:  hub.ClientCount(),
			UpstreamConnected: upstream.connected.Load(),
			BlocksRelayed:     hub.blocksRelayed.Load(),
			TxsRelayed:        hub.txsRelayed.Load(),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	cfg := loadConfig()

	hub := NewHub()
	upstream := &UpstreamState{}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go hub.Run(ctx)
	go runUpstream(ctx, cfg.ChainWS, hub, upstream)

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWS(hub, w, r)
	})
	mux.HandleFunc("/health", makeHealthHandler(upstream))
	mux.HandleFunc("/stats", makeStatsHandler(hub, upstream))

	server := &http.Server{
		Addr:    cfg.Listen,
		Handler: corsMiddleware(mux),
	}

	// Graceful shutdown on SIGINT/SIGTERM.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("claw-eventsd listening on %s", cfg.Listen)
		log.Printf("upstream CometBFT WS: %s", cfg.ChainWS)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-sigCh
	log.Println("shutting down...")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("server shutdown: %v", err)
	}
}
