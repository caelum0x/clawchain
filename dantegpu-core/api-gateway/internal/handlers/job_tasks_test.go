package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dante-gpu/dante-backend/api-gateway/internal/config"
	"github.com/go-chi/chi/v5"
	"github.com/nats-io/nats.go"
	"go.uber.org/zap"
)

func TestTaskLifecycleDrivenByStatusUpdates(t *testing.T) {
	h := NewJobHandler(zap.NewNop(), &config.Config{}, nil)

	submitReq := httptest.NewRequest(http.MethodPost, "/api/v1/tasks", strings.NewReader(`{
		"id":"claw-42",
		"name":"gpu-infer",
		"type":"script",
		"script":"print('ok')"
	}`))
	submitRes := httptest.NewRecorder()
	h.SubmitTask(submitRes, submitReq)
	if submitRes.Code != http.StatusAccepted {
		t.Fatalf("expected 202 on submit, got %d", submitRes.Code)
	}

	// No simulation: should remain queued until external status update arrives.
	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/tasks/claw-42/status", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("taskID", "claw-42")
	getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, rctx))
	getRes := httptest.NewRecorder()
	h.GetTaskStatus(getRes, getReq)
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected 200 on status, got %d", getRes.Code)
	}
	var queued TaskState
	if err := json.NewDecoder(getRes.Body).Decode(&queued); err != nil {
		t.Fatalf("decode queued status: %v", err)
	}
	if queued.Status != "queued" {
		t.Fatalf("expected queued initial status, got %q", queued.Status)
	}

	// Apply provider status update via NATS message.
	upd := TaskStatusUpdate{
		JobID:      "claw-42",
		ProviderID: "provider-daemon-01",
		Status:     "in_progress",
		Progress:   0.4,
		Message:    "running",
	}
	payload, err := json.Marshal(upd)
	if err != nil {
		t.Fatalf("marshal update: %v", err)
	}
	h.HandleTaskStatusMessage(&nats.Msg{Subject: "jobs.status.claw-42", Data: payload})

	getRes = httptest.NewRecorder()
	h.GetTaskStatus(getRes, getReq)
	var running TaskState
	if err := json.NewDecoder(getRes.Body).Decode(&running); err != nil {
		t.Fatalf("decode running status: %v", err)
	}
	if running.Status != "running" || running.Progress != 40 {
		t.Fatalf("expected running 40%%, got status=%q progress=%d", running.Status, running.Progress)
	}

	upd = TaskStatusUpdate{
		JobID:      "claw-42",
		ProviderID: "provider-daemon-01",
		Status:     "completed",
		Progress:   1.0,
		Message:    "done",
	}
	payload, _ = json.Marshal(upd)
	h.HandleTaskStatusMessage(&nats.Msg{Subject: "jobs.status.claw-42", Data: payload})

	getRes = httptest.NewRecorder()
	h.GetTaskStatus(getRes, getReq)
	var done TaskState
	if err := json.NewDecoder(getRes.Body).Decode(&done); err != nil {
		t.Fatalf("decode done status: %v", err)
	}
	if done.Status != "completed" || done.Progress != 100 || done.Output == "" {
		t.Fatalf("expected completed with output, got %+v", done)
	}
}

func TestTaskCancelTransitionsToCancellationRequested(t *testing.T) {
	h := NewJobHandler(zap.NewNop(), &config.Config{}, nil)

	submitReq := httptest.NewRequest(http.MethodPost, "/api/v1/tasks", strings.NewReader(`{
		"id":"claw-7",
		"name":"gpu-cancel",
		"type":"script",
		"script":"import time; time.sleep(1)"
	}`))
	submitRes := httptest.NewRecorder()
	h.SubmitTask(submitRes, submitReq)
	if submitRes.Code != http.StatusAccepted {
		t.Fatalf("expected 202 on submit, got %d", submitRes.Code)
	}

	cancelReq := httptest.NewRequest(http.MethodPost, "/api/v1/tasks/claw-7/cancel", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("taskID", "claw-7")
	cancelReq = cancelReq.WithContext(context.WithValue(cancelReq.Context(), chi.RouteCtxKey, rctx))
	cancelRes := httptest.NewRecorder()
	h.CancelTask(cancelRes, cancelReq)
	if cancelRes.Code != http.StatusAccepted {
		t.Fatalf("expected 202 on cancel, got %d", cancelRes.Code)
	}

	var state TaskState
	if err := json.NewDecoder(cancelRes.Body).Decode(&state); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if state.Status != "cancellation_requested" {
		t.Fatalf("expected cancellation_requested status, got %q", state.Status)
	}
}

func TestTaskCancelFinalizedByStatusUpdate(t *testing.T) {
	h := NewJobHandler(zap.NewNop(), &config.Config{}, nil)

	h.setTaskState(TaskState{
		ID:         "claw-8",
		Status:     "running",
		ProviderID: "provider-daemon-01",
		UpdatedAt:  testNow(),
	})

	cancelReq := httptest.NewRequest(http.MethodPost, "/api/v1/tasks/claw-8/cancel", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("taskID", "claw-8")
	cancelReq = cancelReq.WithContext(context.WithValue(cancelReq.Context(), chi.RouteCtxKey, rctx))
	cancelRes := httptest.NewRecorder()
	h.CancelTask(cancelRes, cancelReq)
	if cancelRes.Code != http.StatusAccepted {
		t.Fatalf("expected 202 on cancel, got %d", cancelRes.Code)
	}

	upd := TaskStatusUpdate{
		JobID:      "claw-8",
		ProviderID: "provider-daemon-01",
		Status:     "cancelled",
		Message:    "Task cancellation requested",
		Timestamp:  testNow().Add(time.Second),
	}
	payload, err := json.Marshal(upd)
	if err != nil {
		t.Fatalf("marshal update: %v", err)
	}
	h.HandleTaskStatusMessage(&nats.Msg{Subject: "jobs.status.claw-8", Data: payload})

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/tasks/claw-8/status", nil)
	getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, rctx))
	getRes := httptest.NewRecorder()
	h.GetTaskStatus(getRes, getReq)
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected 200 on status, got %d", getRes.Code)
	}

	var state TaskState
	if err := json.NewDecoder(getRes.Body).Decode(&state); err != nil {
		t.Fatalf("decode status: %v", err)
	}
	if state.Status != "cancelled" {
		t.Fatalf("expected cancelled after status update, got %q", state.Status)
	}
}

func TestGetJobStatusReadsLiveState(t *testing.T) {
	h := NewJobHandler(zap.NewNop(), &config.Config{}, nil)
	h.setTaskState(TaskState{
		ID:        "job-1",
		Status:    "running",
		Progress:  60,
		Message:   "executing",
		UpdatedAt: testNow(),
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/job-1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("jobID", "job-1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	res := httptest.NewRecorder()
	h.GetJobStatus(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}

	var state TaskState
	if err := json.NewDecoder(res.Body).Decode(&state); err != nil {
		t.Fatalf("decode status response: %v", err)
	}
	if state.Status != "running" || state.Progress != 60 {
		t.Fatalf("unexpected job state: %+v", state)
	}
}

func TestCancelJobTransitionsToCancellationRequested(t *testing.T) {
	h := NewJobHandler(zap.NewNop(), &config.Config{}, nil)
	h.setTaskState(TaskState{
		ID:        "job-2",
		Status:    "running",
		Progress:  35,
		UpdatedAt: testNow(),
	})

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/jobs/job-2", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("jobID", "job-2")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	res := httptest.NewRecorder()
	h.CancelJob(res, req)
	if res.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", res.Code)
	}

	var state TaskState
	if err := json.NewDecoder(res.Body).Decode(&state); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if state.Status != "cancellation_requested" {
		t.Fatalf("expected cancellation_requested status, got %q", state.Status)
	}
	if _, ok := h.getTaskState("job-2"); !ok {
		t.Fatalf("expected cancelled state to be persisted")
	}
}

func TestCancelJobFinalizedByStatusUpdate(t *testing.T) {
	h := NewJobHandler(zap.NewNop(), &config.Config{}, nil)
	h.setTaskState(TaskState{
		ID:        "job-3",
		Status:    "running",
		Progress:  10,
		UpdatedAt: testNow(),
	})

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/jobs/job-3", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("jobID", "job-3")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	res := httptest.NewRecorder()
	h.CancelJob(res, req)
	if res.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", res.Code)
	}

	update := TaskStatusUpdate{
		JobID:      "job-3",
		ProviderID: "provider-daemon-01",
		Status:     "cancelled",
		Message:    "Task cancellation requested",
		Timestamp:  testNow().Add(time.Second),
	}
	payload, err := json.Marshal(update)
	if err != nil {
		t.Fatalf("marshal update: %v", err)
	}
	h.HandleTaskStatusMessage(&nats.Msg{Subject: "jobs.status.job-3", Data: payload})

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/job-3", nil)
	getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, rctx))
	getRes := httptest.NewRecorder()
	h.GetJobStatus(getRes, getReq)
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", getRes.Code)
	}

	var state TaskState
	if err := json.NewDecoder(getRes.Body).Decode(&state); err != nil {
		t.Fatalf("decode status response: %v", err)
	}
	if state.Status != "cancelled" {
		t.Fatalf("expected cancelled after status update, got %q", state.Status)
	}
}

func testNow() time.Time {
	return time.Unix(1700000000, 0)
}
