package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestFetchAndExecuteJobs_DanteBridgeE2E(t *testing.T) {
	var mu sync.Mutex
	submittedTaskIDs := make([]string, 0, 1)
	seenStatuses := make([]string, 0, 2)

	job := ComputeJob{
		Id:            1,
		ResourceId:    10,
		LeaseId:       99,
		Submitter:     "claw1submitter",
		Name:          "gpu-infer",
		ExecutionType: "docker",
		DockerImage:   "alpine:latest",
		Status:        "pending",
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/clawchain/marketplace/v1/compute/jobs":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []ComputeJob{job}})
			return
		case r.Method == http.MethodPost && r.URL.Path == "/clawchain/marketplace/v1/compute/job/status":
			var payload struct {
				Status string `json:"status"`
			}
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			mu.Lock()
			seenStatuses = append(seenStatuses, payload.Status)
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
			return
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/tasks":
			var task DanteTask
			require.NoError(t, json.NewDecoder(r.Body).Decode(&task))
			mu.Lock()
			submittedTaskIDs = append(submittedTaskIDs, task.ID)
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
			return
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/tasks/claw-1/status":
			_ = json.NewEncoder(w).Encode(DanteTaskStatus{
				ID:       "claw-1",
				Status:   "completed",
				Progress: 100,
				Output:   "ok",
			})
			return
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	provider := NewProvider(Config{
		ChainREST:       srv.URL,
		ProviderAddress: "claw1provider",
		MaxConcurrent:   1,
	})
	provider.danteAdapter = NewDanteGPUAdapter(srv.URL, "test-key", "")
	provider.dantePollInterval = 10 * time.Millisecond

	provider.FetchAndExecuteJobs(context.Background())

	require.Eventually(t, func() bool {
		mu.Lock()
		defer mu.Unlock()
		hasSubmitted := len(submittedTaskIDs) == 1 && submittedTaskIDs[0] == "claw-1"
		hasRunning := false
		hasCompleted := false
		for _, s := range seenStatuses {
			if s == "running" {
				hasRunning = true
			}
			if s == "completed" {
				hasCompleted = true
			}
		}
		return hasSubmitted && hasRunning && hasCompleted
	}, 2*time.Second, 20*time.Millisecond)
}

func TestFetchAndExecuteJobs_DanteSubmitFails_FallsBackToLocal(t *testing.T) {
	var mu sync.Mutex
	seenStatuses := make([]string, 0, 2)

	job := ComputeJob{
		Id:            2,
		ResourceId:    10,
		LeaseId:       100,
		Submitter:     "claw1submitter",
		Name:          "gpu-script-fallback",
		ExecutionType: "script",
		ScriptContent: "print('fallback-ok')",
		Status:        "pending",
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/clawchain/marketplace/v1/compute/jobs":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"jobs": []ComputeJob{job}})
			return
		case r.Method == http.MethodPost && r.URL.Path == "/clawchain/marketplace/v1/compute/job/status":
			var payload struct {
				Status string `json:"status"`
			}
			require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
			mu.Lock()
			seenStatuses = append(seenStatuses, payload.Status)
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
			return
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/tasks":
			// Force Dante submit failure so provider takes local fallback path.
			http.Error(w, "scheduler unavailable", http.StatusInternalServerError)
			return
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	provider := NewProvider(Config{
		ChainREST:       srv.URL,
		ProviderAddress: "claw1provider",
		MaxConcurrent:   1,
		WorkDir:         t.TempDir(),
	})
	provider.danteAdapter = NewDanteGPUAdapter(srv.URL, "test-key", "")

	provider.FetchAndExecuteJobs(context.Background())

	require.Eventually(t, func() bool {
		mu.Lock()
		defer mu.Unlock()
		hasRunning := false
		hasCompleted := false
		for _, s := range seenStatuses {
			if s == "running" {
				hasRunning = true
			}
			if s == "completed" {
				hasCompleted = true
			}
		}
		return hasRunning && hasCompleted
	}, 3*time.Second, 25*time.Millisecond)
}
