package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Store unit tests
// ---------------------------------------------------------------------------

func TestNotificationStore_Add(t *testing.T) {
	s := NewNotificationStore()
	n := Notification{
		ID:        "n1",
		Type:      "tx_confirmed",
		Title:     "Transfer Received",
		Message:   "Received 100uclaw",
		Timestamp: time.Now(),
	}
	s.Add("claw1abc", n)

	list, total, unread := s.List("claw1abc", 50, 0)
	if total != 1 {
		t.Fatalf("expected total=1, got %d", total)
	}
	if unread != 1 {
		t.Fatalf("expected unread=1, got %d", unread)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(list))
	}
	if list[0].ID != "n1" {
		t.Fatalf("expected ID=n1, got %s", list[0].ID)
	}
	if list[0].Type != "tx_confirmed" {
		t.Fatalf("expected Type=tx_confirmed, got %s", list[0].Type)
	}
}

func TestNotificationStore_MaxLimit(t *testing.T) {
	s := NewNotificationStore()
	addr := "claw1ring"

	// Add 1005 notifications — only 1000 should be kept.
	for i := 0; i < 1005; i++ {
		s.Add(addr, Notification{
			ID:        fmt.Sprintf("n-%d", i),
			Type:      "tx_confirmed",
			Title:     "Test",
			Message:   fmt.Sprintf("msg %d", i),
			Timestamp: time.Now(),
		})
	}

	_, total, _ := s.List(addr, 1, 0)
	if total != maxNotificationsPerAddress {
		t.Fatalf("expected total=%d, got %d", maxNotificationsPerAddress, total)
	}

	// The most recent notification should be first (prepend order).
	list, _, _ := s.List(addr, 1, 0)
	if list[0].ID != "n-1004" {
		t.Fatalf("expected newest notification n-1004 first, got %s", list[0].ID)
	}

	// The oldest kept notification should be n-5 (n-0 through n-4 were dropped).
	all, _, _ := s.List(addr, maxNotificationsPerAddress, 0)
	last := all[len(all)-1]
	if last.ID != "n-5" {
		t.Fatalf("expected oldest kept notification n-5, got %s", last.ID)
	}
}

func TestNotificationStore_MarkRead(t *testing.T) {
	s := NewNotificationStore()
	addr := "claw1mark"

	s.Add(addr, Notification{ID: "a", Type: "tx_confirmed", Title: "A", Timestamp: time.Now()})
	s.Add(addr, Notification{ID: "b", Type: "tx_confirmed", Title: "B", Timestamp: time.Now()})
	s.Add(addr, Notification{ID: "c", Type: "tx_confirmed", Title: "C", Timestamp: time.Now()})

	// Mark single.
	marked := s.MarkRead(addr, []string{"b"})
	if marked != 1 {
		t.Fatalf("expected marked=1, got %d", marked)
	}
	if s.UnreadCount(addr) != 2 {
		t.Fatalf("expected unread=2, got %d", s.UnreadCount(addr))
	}

	// Mark all.
	marked = s.MarkAllRead(addr)
	if marked != 2 {
		t.Fatalf("expected marked=2, got %d", marked)
	}
	if s.UnreadCount(addr) != 0 {
		t.Fatalf("expected unread=0, got %d", s.UnreadCount(addr))
	}

	// Mark again — nothing to mark.
	marked = s.MarkAllRead(addr)
	if marked != 0 {
		t.Fatalf("expected marked=0, got %d", marked)
	}
}

func TestNotificationStore_UnreadCount(t *testing.T) {
	s := NewNotificationStore()
	addr := "claw1count"

	if s.UnreadCount(addr) != 0 {
		t.Fatalf("expected 0 unread for new address")
	}

	s.Add(addr, Notification{ID: "x1", Type: "tx_confirmed", Timestamp: time.Now()})
	s.Add(addr, Notification{ID: "x2", Type: "agent_registered", Timestamp: time.Now()})
	s.Add(addr, Notification{ID: "x3", Type: "task_completed", Timestamp: time.Now(), Read: true})

	if s.UnreadCount(addr) != 2 {
		t.Fatalf("expected 2 unread, got %d", s.UnreadCount(addr))
	}

	s.MarkRead(addr, []string{"x1"})
	if s.UnreadCount(addr) != 1 {
		t.Fatalf("expected 1 unread, got %d", s.UnreadCount(addr))
	}
}

// ---------------------------------------------------------------------------
// HTTP endpoint tests
// ---------------------------------------------------------------------------

func newTestServer() (*server, *http.ServeMux) {
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
	return srv, mux
}

func TestListEndpoint(t *testing.T) {
	srv, mux := newTestServer()
	addr := "claw1list"

	// Seed data.
	for i := 0; i < 5; i++ {
		srv.store.Add(addr, Notification{
			ID:        fmt.Sprintf("ln-%d", i),
			Type:      "tx_confirmed",
			Title:     fmt.Sprintf("Notification %d", i),
			Message:   fmt.Sprintf("Message %d", i),
			Timestamp: time.Now(),
		})
	}
	// Mark one as read.
	srv.store.MarkRead(addr, []string{"ln-0"})

	// Test paginated fetch.
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/notifications?address=%s&limit=3&offset=0", addr), nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Notifications []Notification `json:"notifications"`
		Total         int            `json:"total"`
		Unread        int            `json:"unread"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(resp.Notifications) != 3 {
		t.Fatalf("expected 3 notifications, got %d", len(resp.Notifications))
	}
	if resp.Total != 5 {
		t.Fatalf("expected total=5, got %d", resp.Total)
	}
	if resp.Unread != 4 {
		t.Fatalf("expected unread=4, got %d", resp.Unread)
	}

	// Test missing address.
	req2 := httptest.NewRequest(http.MethodGet, "/notifications", nil)
	w2 := httptest.NewRecorder()
	mux.ServeHTTP(w2, req2)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing address, got %d", w2.Code)
	}

	// Test empty address returns empty list.
	req3 := httptest.NewRequest(http.MethodGet, "/notifications?address=claw1nobody&limit=10&offset=0", nil)
	w3 := httptest.NewRecorder()
	mux.ServeHTTP(w3, req3)
	if w3.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w3.Code)
	}
	var resp3 struct {
		Notifications []Notification `json:"notifications"`
		Total         int            `json:"total"`
	}
	if err := json.NewDecoder(w3.Body).Decode(&resp3); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(resp3.Notifications) != 0 {
		t.Fatalf("expected 0 notifications for unknown address, got %d", len(resp3.Notifications))
	}
}

func TestUnreadCountEndpoint(t *testing.T) {
	srv, mux := newTestServer()
	addr := "claw1unread"

	srv.store.Add(addr, Notification{ID: "u1", Type: "tx_confirmed", Timestamp: time.Now()})
	srv.store.Add(addr, Notification{ID: "u2", Type: "agent_registered", Timestamp: time.Now()})
	srv.store.Add(addr, Notification{ID: "u3", Type: "task_completed", Timestamp: time.Now(), Read: true})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/notifications/unread-count?address=%s", addr), nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]int
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp["count"] != 2 {
		t.Fatalf("expected count=2, got %d", resp["count"])
	}

	// Missing address.
	req2 := httptest.NewRequest(http.MethodGet, "/notifications/unread-count", nil)
	w2 := httptest.NewRecorder()
	mux.ServeHTTP(w2, req2)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w2.Code)
	}
}

func TestMarkReadEndpoint(t *testing.T) {
	srv, mux := newTestServer()
	addr := "claw1markread"

	srv.store.Add(addr, Notification{ID: "mr1", Type: "tx_confirmed", Timestamp: time.Now()})
	srv.store.Add(addr, Notification{ID: "mr2", Type: "agent_registered", Timestamp: time.Now()})
	srv.store.Add(addr, Notification{ID: "mr3", Type: "task_completed", Timestamp: time.Now()})

	// Mark specific IDs.
	body, _ := json.Marshal(map[string]any{
		"address": addr,
		"ids":     []string{"mr1", "mr3"},
	})
	req := httptest.NewRequest(http.MethodPost, "/notifications/read", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]int
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp["marked"] != 2 {
		t.Fatalf("expected marked=2, got %d", resp["marked"])
	}

	// Verify unread count.
	if srv.store.UnreadCount(addr) != 1 {
		t.Fatalf("expected 1 unread, got %d", srv.store.UnreadCount(addr))
	}

	// Mark all.
	body2, _ := json.Marshal(map[string]any{
		"address": addr,
		"all":     true,
	})
	req2 := httptest.NewRequest(http.MethodPost, "/notifications/read", bytes.NewReader(body2))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	mux.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w2.Code, w2.Body.String())
	}
	if srv.store.UnreadCount(addr) != 0 {
		t.Fatalf("expected 0 unread after mark all, got %d", srv.store.UnreadCount(addr))
	}

	// Wrong method.
	req3 := httptest.NewRequest(http.MethodGet, "/notifications/read", nil)
	w3 := httptest.NewRecorder()
	mux.ServeHTTP(w3, req3)
	if w3.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 for GET, got %d", w3.Code)
	}

	// Missing address.
	body4, _ := json.Marshal(map[string]any{
		"ids": []string{"mr1"},
	})
	req4 := httptest.NewRequest(http.MethodPost, "/notifications/read", bytes.NewReader(body4))
	w4 := httptest.NewRecorder()
	mux.ServeHTTP(w4, req4)
	if w4.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing address, got %d", w4.Code)
	}
}

func TestHealthEndpoint(t *testing.T) {
	_, mux := newTestServer()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if resp["status"] != "ok" {
		t.Fatalf("expected status=ok, got %s", resp["status"])
	}
}

// ---------------------------------------------------------------------------
// Webhook tests
// ---------------------------------------------------------------------------

func TestWebhookRegistry_RegisterAndList(t *testing.T) {
	reg := NewWebhookRegistry()
	addr := "claw1hook"

	if err := reg.Register(addr, WebhookEntry{URL: "https://example.com/hook1"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := reg.Register(addr, WebhookEntry{URL: "https://example.com/hook2", Types: []string{"tx_confirmed"}}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	hooks := reg.List(addr)
	if len(hooks) != 2 {
		t.Fatalf("expected 2 hooks, got %d", len(hooks))
	}
	if !hooks[0].Enabled {
		t.Fatal("expected hook to be enabled")
	}
}

func TestWebhookRegistry_MaxLimit(t *testing.T) {
	reg := NewWebhookRegistry()
	addr := "claw1max"

	for i := 0; i < 10; i++ {
		if err := reg.Register(addr, WebhookEntry{URL: fmt.Sprintf("https://example.com/h%d", i)}); err != nil {
			t.Fatalf("unexpected error on %d: %v", i, err)
		}
	}

	err := reg.Register(addr, WebhookEntry{URL: "https://example.com/h10"})
	if err == nil {
		t.Fatal("expected error for 11th webhook")
	}
}

func TestWebhookRegistry_Remove(t *testing.T) {
	reg := NewWebhookRegistry()
	addr := "claw1rm"

	_ = reg.Register(addr, WebhookEntry{URL: "https://example.com/a"})
	_ = reg.Register(addr, WebhookEntry{URL: "https://example.com/b"})

	if !reg.Remove(addr, "https://example.com/a") {
		t.Fatal("expected Remove to return true")
	}
	if reg.Remove(addr, "https://example.com/a") {
		t.Fatal("expected Remove to return false for already-removed")
	}

	hooks := reg.List(addr)
	if len(hooks) != 1 {
		t.Fatalf("expected 1 hook, got %d", len(hooks))
	}
	if hooks[0].URL != "https://example.com/b" {
		t.Fatalf("expected b to remain, got %s", hooks[0].URL)
	}
}

func TestWebhookRegistry_Deliver(t *testing.T) {
	reg := NewWebhookRegistry()
	addr := "claw1deliver"

	// Set up a test HTTP server to receive webhook deliveries.
	received := make(chan struct{}, 1)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-ClawChain-Event") != "tx_confirmed" {
			t.Errorf("expected event header tx_confirmed, got %s", r.Header.Get("X-ClawChain-Event"))
		}
		var payload struct {
			Address      string       `json:"address"`
			Notification Notification `json:"notification"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decode error: %v", err)
		}
		if payload.Address != addr {
			t.Errorf("expected address %s, got %s", addr, payload.Address)
		}
		if payload.Notification.Type != "tx_confirmed" {
			t.Errorf("expected type tx_confirmed, got %s", payload.Notification.Type)
		}
		w.WriteHeader(http.StatusOK)
		received <- struct{}{}
	}))
	defer ts.Close()

	_ = reg.Register(addr, WebhookEntry{URL: ts.URL})
	reg.Deliver(addr, Notification{
		ID:        "wh1",
		Type:      "tx_confirmed",
		Title:     "Transfer",
		Message:   "Received 100uclaw",
		Timestamp: time.Now(),
	})

	select {
	case <-received:
		// OK
	case <-time.After(5 * time.Second):
		t.Fatal("webhook delivery timed out")
	}
}

func TestWebhookRegistry_TypeFilter(t *testing.T) {
	reg := NewWebhookRegistry()
	addr := "claw1filter"

	received := make(chan string, 5)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received <- r.Header.Get("X-ClawChain-Event")
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	// Register webhook that only accepts tx_confirmed.
	_ = reg.Register(addr, WebhookEntry{URL: ts.URL, Types: []string{"tx_confirmed"}})

	// Send a matching event.
	reg.Deliver(addr, Notification{ID: "f1", Type: "tx_confirmed", Timestamp: time.Now()})

	// Send a non-matching event.
	reg.Deliver(addr, Notification{ID: "f2", Type: "agent_registered", Timestamp: time.Now()})

	// Should receive exactly one delivery.
	select {
	case ev := <-received:
		if ev != "tx_confirmed" {
			t.Fatalf("expected tx_confirmed, got %s", ev)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected delivery for tx_confirmed")
	}

	// Give a short window to ensure agent_registered is NOT delivered.
	select {
	case ev := <-received:
		t.Fatalf("unexpected delivery for %s", ev)
	case <-time.After(200 * time.Millisecond):
		// OK — no delivery for filtered type
	}
}

func TestWebhookEndpoints(t *testing.T) {
	_, mux := newTestServer()
	addr := "claw1api"

	// Register a webhook via POST.
	body, _ := json.Marshal(map[string]any{
		"address": addr,
		"url":     "https://example.com/hook",
		"types":   []string{"tx_confirmed"},
	})
	req := httptest.NewRequest(http.MethodPost, "/webhooks", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	// List webhooks via GET.
	req2 := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/webhooks?address=%s", addr), nil)
	w2 := httptest.NewRecorder()
	mux.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w2.Code)
	}
	var listResp struct {
		Webhooks []WebhookEntry `json:"webhooks"`
	}
	if err := json.NewDecoder(w2.Body).Decode(&listResp); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(listResp.Webhooks) != 1 {
		t.Fatalf("expected 1 webhook, got %d", len(listResp.Webhooks))
	}
	if listResp.Webhooks[0].URL != "https://example.com/hook" {
		t.Fatalf("expected url https://example.com/hook, got %s", listResp.Webhooks[0].URL)
	}

	// Remove webhook via DELETE.
	delBody, _ := json.Marshal(map[string]string{
		"address": addr,
		"url":     "https://example.com/hook",
	})
	req3 := httptest.NewRequest(http.MethodDelete, "/webhooks", bytes.NewReader(delBody))
	req3.Header.Set("Content-Type", "application/json")
	w3 := httptest.NewRecorder()
	mux.ServeHTTP(w3, req3)

	if w3.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w3.Code, w3.Body.String())
	}

	// List again — should be empty.
	req4 := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/webhooks?address=%s", addr), nil)
	w4 := httptest.NewRecorder()
	mux.ServeHTTP(w4, req4)
	var listResp2 struct {
		Webhooks []WebhookEntry `json:"webhooks"`
	}
	if err := json.NewDecoder(w4.Body).Decode(&listResp2); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if len(listResp2.Webhooks) != 0 {
		t.Fatalf("expected 0 webhooks after delete, got %d", len(listResp2.Webhooks))
	}
}

func TestWebhookEndpoints_Validation(t *testing.T) {
	_, mux := newTestServer()

	// Missing address on GET.
	req := httptest.NewRequest(http.MethodGet, "/webhooks", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}

	// Missing url on POST.
	body, _ := json.Marshal(map[string]string{"address": "claw1x"})
	req2 := httptest.NewRequest(http.MethodPost, "/webhooks", bytes.NewReader(body))
	w2 := httptest.NewRecorder()
	mux.ServeHTTP(w2, req2)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing url, got %d", w2.Code)
	}

	// Remove non-existent webhook.
	delBody, _ := json.Marshal(map[string]string{"address": "claw1x", "url": "https://nope.com"})
	req3 := httptest.NewRequest(http.MethodDelete, "/webhooks", bytes.NewReader(delBody))
	w3 := httptest.NewRecorder()
	mux.ServeHTTP(w3, req3)
	if w3.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for non-existent webhook, got %d", w3.Code)
	}

	// Unsupported method.
	req4 := httptest.NewRequest(http.MethodPut, "/webhooks", nil)
	w4 := httptest.NewRecorder()
	mux.ServeHTTP(w4, req4)
	if w4.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 for PUT, got %d", w4.Code)
	}
}

func TestPollerDeliverWithWebhooks(t *testing.T) {
	store := NewNotificationStore()
	hub := NewHub()
	webhooks := NewWebhookRegistry()
	addr := "claw1poller"

	received := make(chan struct{}, 1)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		received <- struct{}{}
	}))
	defer ts.Close()

	_ = webhooks.Register(addr, WebhookEntry{URL: ts.URL})

	p := newChainPoller(config{}, store, hub, webhooks)
	p.deliver(addr, Notification{
		ID:        "pd1",
		Type:      "tx_confirmed",
		Title:     "Test",
		Message:   "via poller",
		Timestamp: time.Now(),
	})

	// Verify stored.
	_, total, _ := store.List(addr, 10, 0)
	if total != 1 {
		t.Fatalf("expected 1 stored notification, got %d", total)
	}

	// Verify webhook fired.
	select {
	case <-received:
		// OK
	case <-time.After(5 * time.Second):
		t.Fatal("webhook not delivered from poller")
	}
}
