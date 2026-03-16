package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"
)

// MockConfig configures the mock inference sidecar behavior.
type MockConfig struct {
	ListenAddr  string  // HTTP listen address (default: :8090)
	FailureRate float64 // Probability of job failure (0.0 - 1.0)
	LatencyMs   int     // Simulated inference latency in ms (default: 500)
}

// MockServer is a mock inference sidecar that simulates job processing
// without requiring a real GPU runtime or chain connection. It implements
// the same HTTP API surface as the real sidecar for E2E testing.
type MockServer struct {
	cfg  MockConfig
	mu   sync.RWMutex
	jobs map[string]*MockJob
}

// MockJob tracks a mock inference job.
type MockJob struct {
	JobID      string `json:"job_id"`
	ModelID    string `json:"model_id"`
	Input      string `json:"input"`
	Status     string `json:"status"` // queued, running, completed, failed
	Output     string `json:"output,omitempty"`
	OutputHash string `json:"output_hash,omitempty"`
	Error      string `json:"error,omitempty"`
	TokensUsed uint64 `json:"tokens_used"`
	CreatedAt  int64  `json:"created_at"`
}

// NewMockServer creates a mock inference sidecar.
func NewMockServer(cfg MockConfig) *MockServer {
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = ":8090"
	}
	if cfg.LatencyMs <= 0 {
		cfg.LatencyMs = 500
	}
	return &MockServer{
		cfg:  cfg,
		jobs: make(map[string]*MockJob),
	}
}

// Handler returns the HTTP handler for the mock server.
func (s *MockServer) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/v1/inference", s.handleInference)
	mux.HandleFunc("/v1/jobs", s.handleListJobs)
	mux.HandleFunc("/v1/job/", s.handleJobStatus)
	mux.HandleFunc("/v1/submit", s.handleSubmitJob)
	return withCORS(mux)
}

// Serve starts the mock server.
func (s *MockServer) Serve() error {
	handler := s.Handler()
	server := &http.Server{
		Addr:         s.cfg.ListenAddr,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	log.Printf("[MockSidecar] Listening on %s (failure_rate=%.2f, latency=%dms)",
		s.cfg.ListenAddr, s.cfg.FailureRate, s.cfg.LatencyMs)
	return server.ListenAndServe()
}

// handleHealth returns a health check response.
func (s *MockServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"mode":   "mock",
		"uptime": time.Now().Unix(),
	})
}

// handleInference simulates a streaming inference call, returning SSE events.
func (s *MockServer) handleInference(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ModelID     interface{} `json:"model_id"`
		Input       string      `json:"input"`
		MaxTokens   uint64      `json:"max_tokens"`
		Temperature string      `json:"temperature"`
		Stream      bool        `json:"stream"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Simulate failure based on configured rate.
	if s.cfg.FailureRate > 0 && rand.Float64() < s.cfg.FailureRate {
		http.Error(w, `{"error":"simulated inference failure"}`, http.StatusInternalServerError)
		return
	}

	// Generate mock output tokens.
	tokens := generateMockTokens(req.Input, int(req.MaxTokens))

	if req.Stream {
		// SSE streaming response.
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, `{"error":"streaming not supported"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		var tokensUsed uint64
		for i, token := range tokens {
			tokensUsed++
			done := i == len(tokens)-1

			chunk := map[string]interface{}{
				"token":       token,
				"tokens_used": tokensUsed,
				"done":        done,
			}
			data, _ := json.Marshal(chunk)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()

			// Simulate token generation latency.
			time.Sleep(time.Duration(s.cfg.LatencyMs/len(tokens)) * time.Millisecond)
		}
		fmt.Fprintf(w, "data: [DONE]\n\n")
		flusher.Flush()
	} else {
		// Non-streaming response.
		output := strings.Join(tokens, "")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"output":      output,
			"tokens_used": len(tokens),
			"model_id":    req.ModelID,
		})
	}
}

// handleSubmitJob accepts a job submission and processes it asynchronously.
func (s *MockServer) handleSubmitJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		JobID         string            `json:"job_id"`
		ExecutionType string            `json:"execution_type"`
		Params        map[string]string `json:"params"`
		DurationSecs  int64             `json:"estimated_duration_secs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.JobID == "" {
		req.JobID = fmt.Sprintf("mock-%d", time.Now().UnixNano())
	}

	job := &MockJob{
		JobID:     req.JobID,
		Status:    "queued",
		CreatedAt: time.Now().Unix(),
	}

	s.mu.Lock()
	s.jobs[req.JobID] = job
	s.mu.Unlock()

	// Process job asynchronously.
	go s.processJob(job, req.DurationSecs)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"job_id": req.JobID,
		"status": "queued",
	})
}

// processJob simulates job execution.
func (s *MockServer) processJob(job *MockJob, durationSecs int64) {
	s.mu.Lock()
	job.Status = "running"
	s.mu.Unlock()

	// Simulate job execution.
	if durationSecs <= 0 {
		durationSecs = 1
	}
	time.Sleep(time.Duration(durationSecs) * time.Second)

	s.mu.Lock()
	defer s.mu.Unlock()

	// Simulate failure based on configured rate.
	if s.cfg.FailureRate > 0 && rand.Float64() < s.cfg.FailureRate {
		job.Status = "failed"
		job.Error = "simulated job failure"
		return
	}

	output := fmt.Sprintf("mock_output_%s_%d", job.JobID, time.Now().UnixNano())
	hash := sha256.Sum256([]byte(output))
	job.Status = "completed"
	job.Output = output
	job.OutputHash = fmt.Sprintf("%x", hash)
	job.TokensUsed = uint64(100 + rand.Intn(900))
}

// handleJobStatus returns the status of a single job.
func (s *MockServer) handleJobStatus(w http.ResponseWriter, r *http.Request) {
	jobID := strings.TrimPrefix(r.URL.Path, "/v1/job/")
	if jobID == "" {
		http.Error(w, `{"error":"job_id required"}`, http.StatusBadRequest)
		return
	}

	s.mu.RLock()
	job, exists := s.jobs[jobID]
	s.mu.RUnlock()

	if !exists {
		http.Error(w, `{"error":"job not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

// handleListJobs returns all tracked jobs.
func (s *MockServer) handleListJobs(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	jobs := make([]*MockJob, 0, len(s.jobs))
	for _, j := range s.jobs {
		jobs = append(jobs, j)
	}
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"jobs":  jobs,
		"total": len(jobs),
	})
}

// generateMockTokens creates mock inference tokens from the input.
func generateMockTokens(input string, maxTokens int) []string {
	if maxTokens <= 0 {
		maxTokens = 10
	}
	if maxTokens > 50 {
		maxTokens = 50 // Cap for mock mode
	}

	words := []string{
		"The ", "mock ", "inference ", "result ", "for ", "your ", "query ",
		"is ", "as ", "follows: ", "the ", "system ", "processed ",
		"the ", "input ", "successfully. ",
	}

	tokens := make([]string, 0, maxTokens)
	for i := 0; i < maxTokens && i < len(words); i++ {
		tokens = append(tokens, words[i])
	}

	return tokens
}

// RunMockMode starts the sidecar in mock mode, which simulates a model
// runtime without requiring any external dependencies (no chain, no GPU).
func RunMockMode() {
	listenAddr := envOr("LISTEN_ADDR", ":8090")
	failureRateStr := envOr("MOCK_FAILURE_RATE", "0.0")
	latencyMsStr := envOr("MOCK_LATENCY_MS", "500")

	var failureRate float64
	fmt.Sscanf(failureRateStr, "%f", &failureRate)

	var latencyMs int
	fmt.Sscanf(latencyMsStr, "%d", &latencyMs)

	cfg := MockConfig{
		ListenAddr:  listenAddr,
		FailureRate: failureRate,
		LatencyMs:   latencyMs,
	}

	server := NewMockServer(cfg)
	if err := server.Serve(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[MockSidecar] Server error: %v", err)
	}
}
