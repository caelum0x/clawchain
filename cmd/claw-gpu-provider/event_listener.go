package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// EventType identifies the chain event category.
type EventType string

const (
	EventComputeJobSubmitted EventType = "submit_compute_job"
	EventLeaseCreated        EventType = "lease_compute_resource"
	EventLeaseExpired        EventType = "expire_compute_lease"
)

// ChainEvent represents a parsed chain event relevant to the GPU provider.
type ChainEvent struct {
	Type       EventType
	Height     int64
	TxHash     string
	Attributes map[string]string
}

// EventHandler is called when a relevant chain event is received.
type EventHandler func(event ChainEvent)

// EventListener subscribes to CometBFT WebSocket events and dispatches them
// to registered handlers. It automatically reconnects on disconnect and falls
// back to HTTP polling when WebSocket is unavailable.
type EventListener struct {
	rpcURL       string
	restURL      string
	providerAddr string
	resourceID   uint64
	reconnectSec int

	handlers   map[EventType][]EventHandler
	handlersMu sync.RWMutex

	conn      *websocket.Conn
	connMu    sync.Mutex
	connected bool

	cursor *EventCursor
}

// NewEventListener creates a new CometBFT event listener.
func NewEventListener(cfg Config) *EventListener {
	return &EventListener{
		rpcURL:       cfg.ChainRPC,
		restURL:      cfg.ChainREST,
		providerAddr: cfg.ProviderAddress,
		resourceID:   cfg.ResourceID,
		reconnectSec: cfg.WSReconnectSec,
		handlers:     make(map[EventType][]EventHandler),
	}
}

// SetCursor attaches an EventCursor for restart-safe height tracking.
func (el *EventListener) SetCursor(c *EventCursor) {
	el.cursor = c
}

// On registers a handler for the given event type.
func (el *EventListener) On(eventType EventType, handler EventHandler) {
	el.handlersMu.Lock()
	defer el.handlersMu.Unlock()
	el.handlers[eventType] = append(el.handlers[eventType], handler)
}

// IsConnected returns whether the WebSocket connection is active.
func (el *EventListener) IsConnected() bool {
	el.connMu.Lock()
	defer el.connMu.Unlock()
	return el.connected
}

// Listen starts the WebSocket event subscription loop. It blocks until the
// context is cancelled. On disconnect, it waits reconnectSec before retrying.
func (el *EventListener) Listen(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			el.close()
			return
		default:
		}

		if err := el.connect(ctx); err != nil {
			log.Printf("[Events] WebSocket connect failed: %v — retrying in %ds", err, el.reconnectSec)
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Duration(el.reconnectSec) * time.Second):
				continue
			}
		}

		el.readLoop(ctx)

		// readLoop exited — connection lost.
		el.close()
		log.Printf("[Events] WebSocket disconnected — reconnecting in %ds", el.reconnectSec)
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Duration(el.reconnectSec) * time.Second):
		}
	}
}

func (el *EventListener) connect(ctx context.Context) error {
	// Convert HTTP URL to WebSocket URL.
	wsURL := strings.Replace(el.rpcURL, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	u, err := url.Parse(wsURL + "/websocket")
	if err != nil {
		return fmt.Errorf("parse ws url: %w", err)
	}

	dialer := websocket.DefaultDialer
	conn, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("ws dial: %w", err)
	}

	el.connMu.Lock()
	el.conn = conn
	el.connected = true
	el.connMu.Unlock()

	// Subscribe to new block events and tx events for our provider.
	subscriptions := []string{
		// Subscribe to all Tx events — we filter by attributes locally.
		`tm.event='Tx'`,
	}

	for i, query := range subscriptions {
		subMsg := map[string]interface{}{
			"jsonrpc": "2.0",
			"method":  "subscribe",
			"id":      i + 1,
			"params": map[string]interface{}{
				"query": query,
			},
		}
		if err := conn.WriteJSON(subMsg); err != nil {
			return fmt.Errorf("subscribe: %w", err)
		}
	}

	log.Printf("[Events] WebSocket connected to %s", u.String())
	return nil
}

func (el *EventListener) close() {
	el.connMu.Lock()
	defer el.connMu.Unlock()
	if el.conn != nil {
		el.conn.Close()
		el.conn = nil
	}
	el.connected = false
}

func (el *EventListener) readLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		el.connMu.Lock()
		conn := el.conn
		el.connMu.Unlock()
		if conn == nil {
			return
		}

		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("[Events] WebSocket read error: %v", err)
			}
			return
		}

		el.processMessage(message)
	}
}

// processMessage parses a CometBFT WebSocket message and dispatches matching events.
func (el *EventListener) processMessage(data []byte) {
	var msg struct {
		Result struct {
			Events map[string][]string `json:"events"`
			Data   struct {
				Value struct {
					TxResult struct {
						Height string `json:"height"`
						Tx     string `json:"tx"`
						Result struct {
							Events []struct {
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

	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	txResult := msg.Result.Data.Value.TxResult
	if txResult.Height == "" {
		return // Not a tx event.
	}

	var height int64
	fmt.Sscanf(txResult.Height, "%d", &height)

	for _, event := range txResult.Result.Events {
		attrs := make(map[string]string)
		for _, attr := range event.Attributes {
			attrs[attr.Key] = attr.Value
		}

		// Only process events relevant to this provider.
		if !el.isRelevantEvent(event.Type, attrs) {
			continue
		}

		ce := ChainEvent{
			Type:       EventType(event.Type),
			Height:     height,
			Attributes: attrs,
		}

		el.dispatch(ce)
	}

	// Update cursor after dispatching all events for this tx.
	if el.cursor != nil && height > 0 {
		_ = el.cursor.Update(height, "")
	}
}

// isRelevantEvent checks if the event is relevant to this provider.
func (el *EventListener) isRelevantEvent(eventType string, attrs map[string]string) bool {
	switch EventType(eventType) {
	case EventComputeJobSubmitted:
		// Check if the job is for our resource.
		if resourceID, ok := attrs["resource_id"]; ok {
			return resourceID == fmt.Sprintf("%d", el.resourceID)
		}
		// Also accept if provider address matches.
		if provider, ok := attrs["provider"]; ok {
			return provider == el.providerAddr
		}
		return false

	case EventLeaseCreated:
		if resourceID, ok := attrs["resource_id"]; ok {
			return resourceID == fmt.Sprintf("%d", el.resourceID)
		}
		return false

	case EventLeaseExpired:
		if resourceID, ok := attrs["resource_id"]; ok {
			return resourceID == fmt.Sprintf("%d", el.resourceID)
		}
		return false
	}

	return false
}

func (el *EventListener) dispatch(event ChainEvent) {
	el.handlersMu.RLock()
	handlers := el.handlers[event.Type]
	el.handlersMu.RUnlock()

	for _, h := range handlers {
		h(event)
	}

	log.Printf("[Events] Dispatched %s at height %d (%d attrs)",
		event.Type, event.Height, len(event.Attributes))
}

// ReplayMissedEvents fetches events for blocks that were missed while the
// provider was offline, using the cursor's last processed height as the
// starting point and the current chain height as the end.
func (el *EventListener) ReplayMissedEvents(ctx context.Context, chainClient *ChainClient) error {
	if el.cursor == nil {
		return fmt.Errorf("no cursor configured")
	}

	currentHeight, err := chainClient.GetBlockHeight(ctx)
	if err != nil {
		return fmt.Errorf("get block height: %w", err)
	}

	lastHeight := el.cursor.GetLastHeight()
	if lastHeight >= currentHeight {
		return nil // Nothing to replay.
	}

	gap := currentHeight - lastHeight
	log.Printf("[Events] Replaying missed events from height %d to %d", lastHeight+1, currentHeight)

	if gap > 1000 {
		log.Printf("[Events] WARNING: gap of %d blocks exceeds 1000 — capping replay to last 1000 blocks", gap)
		lastHeight = currentHeight - 1000
	}

	for h := lastHeight + 1; h <= currentHeight; h++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		events, err := el.fetchBlockEvents(ctx, h)
		if err != nil {
			log.Printf("[Events] Replay fetch error at height %d: %v", h, err)
			continue
		}

		for _, ce := range events {
			el.dispatch(ce)
		}

		_ = el.cursor.Update(h, "")
	}

	log.Printf("[Events] Replay complete — cursor at height %d", currentHeight)
	return nil
}

// fetchBlockEvents queries the REST API for transactions at a given block
// height and extracts relevant events.
func (el *EventListener) fetchBlockEvents(ctx context.Context, height int64) ([]ChainEvent, error) {
	queryURL := fmt.Sprintf("%s/cosmos/tx/v1beta1/txs?events=tx.height=%d&order_by=ORDER_BY_ASC",
		el.restURL, height)

	req, err := http.NewRequestWithContext(ctx, "GET", queryURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		TxResponses []struct {
			Height string `json:"height"`
			TxHash string `json:"txhash"`
			Logs   []struct {
				Events []struct {
					Type       string `json:"type"`
					Attributes []struct {
						Key   string `json:"key"`
						Value string `json:"value"`
					} `json:"attributes"`
				} `json:"events"`
			} `json:"logs"`
		} `json:"tx_responses"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode tx response: %w", err)
	}

	var events []ChainEvent
	for _, txResp := range result.TxResponses {
		var txHeight int64
		fmt.Sscanf(txResp.Height, "%d", &txHeight)

		for _, logEntry := range txResp.Logs {
			for _, event := range logEntry.Events {
				attrs := make(map[string]string)
				for _, attr := range event.Attributes {
					attrs[attr.Key] = attr.Value
				}

				if !el.isRelevantEvent(event.Type, attrs) {
					continue
				}

				events = append(events, ChainEvent{
					Type:       EventType(event.Type),
					Height:     txHeight,
					TxHash:     txResp.TxHash,
					Attributes: attrs,
				})
			}
		}
	}

	return events, nil
}
