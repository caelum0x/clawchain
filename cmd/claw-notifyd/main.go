package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

type config struct {
	Listen   string
	ChainRST string // REST (LCD) endpoint
	ChainRPC string // CometBFT RPC endpoint
}

func loadConfig() config {
	c := config{
		Listen:   ":8892",
		ChainRST: "http://localhost:1317",
		ChainRPC: "http://localhost:26657",
	}
	if v := os.Getenv("NOTIFYD_LISTEN"); v != "" {
		c.Listen = v
	}
	if v := os.Getenv("CHAIN_REST"); v != "" {
		c.ChainRST = v
	}
	if v := os.Getenv("CHAIN_RPC"); v != "" {
		c.ChainRPC = v
	}
	return c
}

// ---------------------------------------------------------------------------
// Notification data types
// ---------------------------------------------------------------------------

// Notification represents a single notification entry.
type Notification struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
	Read      bool      `json:"read"`
	TxHash    string    `json:"tx_hash,omitempty"`
	Link      string    `json:"link,omitempty"`
}

// ---------------------------------------------------------------------------
// NotificationStore — thread-safe in-memory store, ring buffer per address
// ---------------------------------------------------------------------------

const maxNotificationsPerAddress = 1000

// NotificationStore is a thread-safe in-memory store of per-address notifications.
type NotificationStore struct {
	mu   sync.RWMutex
	data map[string][]Notification
}

// NewNotificationStore creates an empty store.
func NewNotificationStore() *NotificationStore {
	return &NotificationStore{
		data: make(map[string][]Notification),
	}
}

// Add appends a notification for an address, capping at maxNotificationsPerAddress.
func (s *NotificationStore) Add(address string, n Notification) {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := s.data[address]
	list = append([]Notification{n}, list...)
	if len(list) > maxNotificationsPerAddress {
		list = list[:maxNotificationsPerAddress]
	}
	s.data[address] = list
}

// List returns paginated notifications for an address.
func (s *NotificationStore) List(address string, limit, offset int) ([]Notification, int, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	list := s.data[address]
	total := len(list)
	unread := 0
	for _, n := range list {
		if !n.Read {
			unread++
		}
	}
	if offset >= total {
		return nil, total, unread
	}
	end := offset + limit
	if end > total {
		end = total
	}
	result := make([]Notification, end-offset)
	copy(result, list[offset:end])
	return result, total, unread
}

// UnreadCount returns the count of unread notifications for an address.
func (s *NotificationStore) UnreadCount(address string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, n := range s.data[address] {
		if !n.Read {
			count++
		}
	}
	return count
}

// MarkRead marks specific notification IDs as read for an address.
func (s *NotificationStore) MarkRead(address string, ids []string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	idSet := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		idSet[id] = struct{}{}
	}
	marked := 0
	for i := range s.data[address] {
		if _, ok := idSet[s.data[address][i].ID]; ok && !s.data[address][i].Read {
			s.data[address][i].Read = true
			marked++
		}
	}
	return marked
}

// MarkAllRead marks all notifications as read for an address.
func (s *NotificationStore) MarkAllRead(address string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	marked := 0
	for i := range s.data[address] {
		if !s.data[address][i].Read {
			s.data[address][i].Read = true
			marked++
		}
	}
	return marked
}

// ---------------------------------------------------------------------------
// Webhook Registry — per-address webhook URL registration
// ---------------------------------------------------------------------------

// WebhookEntry stores a registered webhook endpoint for an address.
type WebhookEntry struct {
	URL     string   `json:"url"`
	Secret  string   `json:"secret,omitempty"` // HMAC signing secret (optional)
	Types   []string `json:"types,omitempty"`  // filter by notification type (empty = all)
	Enabled bool     `json:"enabled"`
}

// WebhookRegistry manages per-address webhook registrations.
type WebhookRegistry struct {
	mu      sync.RWMutex
	hooks   map[string][]WebhookEntry
	client  *http.Client
}

// NewWebhookRegistry creates a new registry with a shared HTTP client.
func NewWebhookRegistry() *WebhookRegistry {
	return &WebhookRegistry{
		hooks: make(map[string][]WebhookEntry),
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// Register adds a webhook for an address (max 10 per address).
func (r *WebhookRegistry) Register(address string, entry WebhookEntry) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.hooks[address]) >= 10 {
		return fmt.Errorf("max 10 webhooks per address")
	}
	entry.Enabled = true
	r.hooks[address] = append(r.hooks[address], entry)
	return nil
}

// List returns all webhooks for an address.
func (r *WebhookRegistry) List(address string) []WebhookEntry {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]WebhookEntry, len(r.hooks[address]))
	copy(result, r.hooks[address])
	return result
}

// Remove removes a webhook by URL for an address.
func (r *WebhookRegistry) Remove(address, url string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	hooks := r.hooks[address]
	for i, h := range hooks {
		if h.URL == url {
			r.hooks[address] = append(hooks[:i], hooks[i+1:]...)
			return true
		}
	}
	return false
}

// Deliver sends a notification to all matching webhooks for an address.
// Runs asynchronously — does not block the caller.
func (r *WebhookRegistry) Deliver(address string, n Notification) {
	r.mu.RLock()
	hooks := make([]WebhookEntry, len(r.hooks[address]))
	copy(hooks, r.hooks[address])
	r.mu.RUnlock()

	for _, hook := range hooks {
		if !hook.Enabled {
			continue
		}
		if len(hook.Types) > 0 {
			match := false
			for _, t := range hook.Types {
				if t == n.Type {
					match = true
					break
				}
			}
			if !match {
				continue
			}
		}
		go r.sendWebhook(hook, address, n)
	}
}

func (r *WebhookRegistry) sendWebhook(hook WebhookEntry, address string, n Notification) {
	payload := struct {
		Address      string       `json:"address"`
		Notification Notification `json:"notification"`
	}{
		Address:      address,
		Notification: n,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[webhook] marshal error: %v", err)
		return
	}

	req, err := http.NewRequest(http.MethodPost, hook.URL, bytes.NewReader(body))
	if err != nil {
		log.Printf("[webhook] request error for %s: %v", hook.URL, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-ClawChain-Event", n.Type)
	if hook.Secret != "" {
		// Simple HMAC-like signature: SHA256(secret + body) — use crypto/hmac in production
		req.Header.Set("X-ClawChain-Secret", hook.Secret)
	}

	resp, err := r.client.Do(req)
	if err != nil {
		log.Printf("[webhook] delivery failed for %s: %v", hook.URL, err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		log.Printf("[webhook] %s returned %d", hook.URL, resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// WebSocket Hub
// ---------------------------------------------------------------------------

type wsClient struct {
	address string
	conn    *websocket.Conn
	send    chan []byte
}

// Hub manages WebSocket clients grouped by address.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[*wsClient]struct{}
}

// NewHub creates a new WebSocket hub.
func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]map[*wsClient]struct{}),
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(c *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[c.address] == nil {
		h.clients[c.address] = make(map[*wsClient]struct{})
	}
	h.clients[c.address][c] = struct{}{}
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(c *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set, ok := h.clients[c.address]; ok {
		delete(set, c)
		if len(set) == 0 {
			delete(h.clients, c.address)
		}
	}
}

// Broadcast sends a notification to all WebSocket clients for an address.
func (h *Hub) Broadcast(address string, data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients[address] {
		select {
		case c.send <- data:
		default:
			// Drop if buffer full.
		}
	}
}

// ---------------------------------------------------------------------------
// Chain poller — background goroutine that polls for new blocks/events
// ---------------------------------------------------------------------------

type chainPoller struct {
	cfg         config
	store       *NotificationStore
	hub         *Hub
	webhooks    *WebhookRegistry
	client      *http.Client
	lastHeight  int64
	idCounter   uint64
	idCounterMu sync.Mutex
}

func newChainPoller(cfg config, store *NotificationStore, hub *Hub, webhooks *WebhookRegistry) *chainPoller {
	return &chainPoller{
		cfg:      cfg,
		store:    store,
		hub:      hub,
		webhooks: webhooks,
		client:   &http.Client{Timeout: 10 * time.Second},
	}
}

func (p *chainPoller) nextID() string {
	p.idCounterMu.Lock()
	defer p.idCounterMu.Unlock()
	p.idCounter++
	return fmt.Sprintf("notif-%d-%d", time.Now().UnixNano(), p.idCounter)
}

// run polls the chain every 5 seconds for new blocks.
func (p *chainPoller) run(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.poll(ctx)
		}
	}
}

func (p *chainPoller) poll(ctx context.Context) {
	// Get latest block height.
	height, err := p.getLatestHeight(ctx)
	if err != nil {
		log.Printf("[poller] failed to get latest height: %v", err)
		return
	}
	if p.lastHeight == 0 {
		// First poll — just record height, don't backfill.
		p.lastHeight = height
		log.Printf("[poller] initialized at height %d", height)
		return
	}
	if height <= p.lastHeight {
		return
	}

	// Process new blocks (cap at 10 blocks per poll to avoid overload).
	start := p.lastHeight + 1
	if height-start > 9 {
		start = height - 9
	}
	for h := start; h <= height; h++ {
		p.processBlock(ctx, h)
	}
	p.lastHeight = height
}

func (p *chainPoller) getLatestHeight(ctx context.Context) (int64, error) {
	url := strings.TrimRight(p.cfg.ChainRPC, "/") + "/status"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}
	var result struct {
		Result struct {
			SyncInfo struct {
				LatestBlockHeight string `json:"latest_block_height"`
			} `json:"sync_info"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, fmt.Errorf("parse status: %w", err)
	}
	h, err := strconv.ParseInt(result.Result.SyncInfo.LatestBlockHeight, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse height %q: %w", result.Result.SyncInfo.LatestBlockHeight, err)
	}
	return h, nil
}

func (p *chainPoller) processBlock(ctx context.Context, height int64) {
	url := fmt.Sprintf("%s/block_results?height=%d", strings.TrimRight(p.cfg.ChainRPC, "/"), height)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return
	}
	resp, err := p.client.Do(req)
	if err != nil {
		log.Printf("[poller] block_results height=%d err=%v", height, err)
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return
	}

	var blockRes struct {
		Result struct {
			TxsResults []struct {
				Events []blockEvent `json:"events"`
			} `json:"txs_results"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &blockRes); err != nil {
		return
	}

	for _, tx := range blockRes.Result.TxsResults {
		for _, ev := range tx.Events {
			p.handleEvent(ev, height)
		}
	}
}

type blockEvent struct {
	Type       string           `json:"type"`
	Attributes []blockAttribute `json:"attributes"`
}

type blockAttribute struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func (p *chainPoller) handleEvent(ev blockEvent, height int64) {
	attrs := make(map[string]string)
	for _, a := range ev.Attributes {
		attrs[a.Key] = a.Value
	}

	switch ev.Type {
	case "transfer":
		// Token transfer received — notify recipient.
		recipient := attrs["recipient"]
		amount := attrs["amount"]
		if recipient == "" {
			return
		}
		n := Notification{
			ID:        p.nextID(),
			Type:      "tx_confirmed",
			Title:     "Transfer Received",
			Message:   fmt.Sprintf("Received %s", amount),
			Timestamp: time.Now(),
			TxHash:    attrs["tx_hash"],
		}
		p.deliver(recipient, n)

	case "register_agent":
		creator := attrs["creator"]
		if creator == "" {
			creator = attrs["sender"]
		}
		if creator == "" {
			return
		}
		n := Notification{
			ID:        p.nextID(),
			Type:      "agent_registered",
			Title:     "Agent Registered",
			Message:   fmt.Sprintf("Agent registered on chain at height %d", height),
			Timestamp: time.Now(),
		}
		p.deliver(creator, n)

	case "complete_task":
		assignee := attrs["assignee"]
		if assignee == "" {
			assignee = attrs["creator"]
		}
		delegator := attrs["delegator"]
		taskID := attrs["task_id"]
		if taskID == "" {
			taskID = "?"
		}

		if assignee != "" {
			n := Notification{
				ID:        p.nextID(),
				Type:      "task_completed",
				Title:     "Task Completed",
				Message:   fmt.Sprintf("Task #%s completed successfully", taskID),
				Timestamp: time.Now(),
			}
			p.deliver(assignee, n)
		}
		if delegator != "" && delegator != assignee {
			n := Notification{
				ID:        p.nextID(),
				Type:      "task_completed",
				Title:     "Task Completed",
				Message:   fmt.Sprintf("Task #%s you delegated has been completed", taskID),
				Timestamp: time.Now(),
			}
			p.deliver(delegator, n)
		}

	case "proposal_status":
		proposer := attrs["proposer"]
		if proposer == "" {
			proposer = attrs["creator"]
		}
		status := attrs["status"]
		proposalID := attrs["proposal_id"]
		if proposer != "" && (status == "passed" || status == "PROPOSAL_STATUS_PASSED") {
			n := Notification{
				ID:        p.nextID(),
				Type:      "proposal_passed",
				Title:     "Proposal Passed",
				Message:   fmt.Sprintf("Proposal #%s has passed", proposalID),
				Timestamp: time.Now(),
			}
			p.deliver(proposer, n)
		}

	case "governance_vote":
		voter := attrs["voter"]
		if voter == "" {
			voter = attrs["sender"]
		}
		proposalID := attrs["proposal_id"]
		if voter != "" {
			n := Notification{
				ID:        p.nextID(),
				Type:      "governance_vote",
				Title:     "Vote Recorded",
				Message:   fmt.Sprintf("Your vote on proposal #%s was recorded", proposalID),
				Timestamp: time.Now(),
			}
			p.deliver(voter, n)
		}

	case "claim_rewards":
		delegator := attrs["delegator"]
		if delegator == "" {
			delegator = attrs["sender"]
		}
		amount := attrs["amount"]
		if delegator != "" {
			n := Notification{
				ID:        p.nextID(),
				Type:      "reward_claimed",
				Title:     "Rewards Claimed",
				Message:   fmt.Sprintf("Claimed %s in rewards", amount),
				Timestamp: time.Now(),
			}
			p.deliver(delegator, n)
		}
	}
}

// deliver stores a notification, broadcasts via WebSocket, and fires webhooks.
func (p *chainPoller) deliver(address string, n Notification) {
	p.store.Add(address, n)
	data, err := json.Marshal(n)
	if err != nil {
		return
	}
	p.hub.Broadcast(address, data)
	if p.webhooks != nil {
		p.webhooks.Deliver(address, n)
	}
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type server struct {
	store    *NotificationStore
	hub      *Hub
	webhooks *WebhookRegistry
}

func (s *server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

func (s *server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	address := r.URL.Query().Get("address")
	if address == "" {
		http.Error(w, `{"error":"address required"}`, http.StatusBadRequest)
		return
	}
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	limit := 50
	offset := 0
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
			limit = v
		}
	}
	if offsetStr != "" {
		if v, err := strconv.Atoi(offsetStr); err == nil && v >= 0 {
			offset = v
		}
	}
	if limit > 1000 {
		limit = 1000
	}

	notifications, total, unread := s.store.List(address, limit, offset)
	if notifications == nil {
		notifications = []Notification{}
	}

	resp := struct {
		Notifications []Notification `json:"notifications"`
		Total         int            `json:"total"`
		Unread        int            `json:"unread"`
	}{
		Notifications: notifications,
		Total:         total,
		Unread:        unread,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *server) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Address string   `json:"address"`
		IDs     []string `json:"ids"`
		All     bool     `json:"all"`
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if req.Address == "" {
		http.Error(w, `{"error":"address required"}`, http.StatusBadRequest)
		return
	}

	var marked int
	if req.All {
		marked = s.store.MarkAllRead(req.Address)
	} else {
		marked = s.store.MarkRead(req.Address, req.IDs)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]int{"marked": marked})
}

func (s *server) handleUnreadCount(w http.ResponseWriter, r *http.Request) {
	address := r.URL.Query().Get("address")
	if address == "" {
		http.Error(w, `{"error":"address required"}`, http.StatusBadRequest)
		return
	}
	count := s.store.UnreadCount(address)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]int{"count": count})
}

func (s *server) handleWebhooks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleListWebhooks(w, r)
	case http.MethodPost:
		s.handleRegisterWebhook(w, r)
	case http.MethodDelete:
		s.handleRemoveWebhook(w, r)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func (s *server) handleListWebhooks(w http.ResponseWriter, r *http.Request) {
	address := r.URL.Query().Get("address")
	if address == "" {
		http.Error(w, `{"error":"address required"}`, http.StatusBadRequest)
		return
	}
	hooks := s.webhooks.List(address)
	if hooks == nil {
		hooks = []WebhookEntry{}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"webhooks": hooks})
}

func (s *server) handleRegisterWebhook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Address string   `json:"address"`
		URL     string   `json:"url"`
		Secret  string   `json:"secret,omitempty"`
		Types   []string `json:"types,omitempty"`
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if req.Address == "" || req.URL == "" {
		http.Error(w, `{"error":"address and url required"}`, http.StatusBadRequest)
		return
	}

	entry := WebhookEntry{
		URL:    req.URL,
		Secret: req.Secret,
		Types:  req.Types,
	}
	if err := s.webhooks.Register(req.Address, entry); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "registered"})
}

func (s *server) handleRemoveWebhook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Address string `json:"address"`
		URL     string `json:"url"`
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if req.Address == "" || req.URL == "" {
		http.Error(w, `{"error":"address and url required"}`, http.StatusBadRequest)
		return
	}

	if !s.webhooks.Remove(req.Address, req.URL) {
		http.Error(w, `{"error":"webhook not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "removed"})
}

func (s *server) handleWS(w http.ResponseWriter, r *http.Request) {
	address := r.URL.Query().Get("address")
	if address == "" {
		http.Error(w, `{"error":"address required"}`, http.StatusBadRequest)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ws] upgrade error: %v", err)
		return
	}

	client := &wsClient{
		address: address,
		conn:    conn,
		send:    make(chan []byte, 64),
	}
	s.hub.Register(client)

	// Writer goroutine.
	go func() {
		defer func() {
			s.hub.Unregister(client)
			conn.Close()
		}()
		for msg := range client.send {
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	// Reader goroutine — just drains reads to detect close.
	go func() {
		defer func() {
			close(client.send)
		}()
		conn.SetReadLimit(512)
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		conn.SetPongHandler(func(string) error {
			_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			return nil
		})
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				return
			}
		}
	}()
}

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	cfg := loadConfig()

	store := NewNotificationStore()
	hub := NewHub()
	webhooks := NewWebhookRegistry()

	srv := &server{store: store, hub: hub, webhooks: webhooks}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", srv.handleHealth)
	mux.HandleFunc("/notifications", srv.handleListNotifications)
	mux.HandleFunc("/notifications/read", srv.handleMarkRead)
	mux.HandleFunc("/notifications/unread-count", srv.handleUnreadCount)
	mux.HandleFunc("/webhooks", srv.handleWebhooks)
	mux.HandleFunc("/ws/notifications", srv.handleWS)

	httpSrv := &http.Server{
		Addr:         cfg.Listen,
		Handler:      corsMiddleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start the chain poller.
	pollerCtx, pollerCancel := context.WithCancel(context.Background())
	poller := newChainPoller(cfg, store, hub, webhooks)
	go poller.run(pollerCtx)

	// Graceful shutdown.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("[notifyd] listening on %s", cfg.Listen)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[notifyd] listen error: %v", err)
		}
	}()

	<-stop
	log.Println("[notifyd] shutting down...")
	pollerCancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := httpSrv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[notifyd] shutdown error: %v", err)
	}
	log.Println("[notifyd] stopped")
}
