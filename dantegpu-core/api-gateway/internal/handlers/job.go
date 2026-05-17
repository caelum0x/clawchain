package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/dante-gpu/dante-backend/api-gateway/internal/auth"
	"github.com/dante-gpu/dante-backend/api-gateway/internal/config"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"go.uber.org/zap"
)

// JobHandler holds dependencies for job-related handlers.
// I need the logger, config, and NATS connection.
type JobHandler struct {
	Logger   *zap.Logger
	Config   *config.Config
	NatsConn *nats.Conn
	taskMu   sync.RWMutex
	tasks    map[string]TaskState
	// NatsJS nats.JetStreamContext // I might need JetStream later for guaranteed delivery
}

// NewJobHandler creates a new JobHandler.
func NewJobHandler(logger *zap.Logger, cfg *config.Config, nc *nats.Conn) *JobHandler {
	return &JobHandler{
		Logger:   logger,
		Config:   cfg,
		NatsConn: nc,
		tasks:    make(map[string]TaskState),
	}
}

// SubmitJobRequest defines the structure for the job submission request body.
// Based on the provided example.
type SubmitJobRequest struct {
	Type        string                 `json:"type"`
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	GPUType     string                 `json:"gpu_type,omitempty"`
	GPUCount    int                    `json:"gpu_count,omitempty"`
	Priority    int                    `json:"priority,omitempty"`
	Params      map[string]interface{} `json:"params"`
	Tags        []string               `json:"tags,omitempty"`
	// Added internally from JWT and published to scheduler/billing pipeline.
	UserID string `json:"user_id,omitempty"`
}

// SubmitJobResponse defines the structure for the job submission response body.
type SubmitJobResponse struct {
	JobID     string    `json:"job_id"`
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Message   string    `json:"message"`
}

// SubmitTaskRequest mirrors Dante task payload accepted by claw-gpu-provider.
type SubmitTaskRequest struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Type      string            `json:"type"`
	Image     string            `json:"image,omitempty"`
	Script    string            `json:"script,omitempty"`
	InputURI  string            `json:"input_uri,omitempty"`
	OutputURI string            `json:"output_uri,omitempty"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

// TaskState tracks live task lifecycle.
type TaskState struct {
	ID           string    `json:"id"`
	Status       string    `json:"status"`
	Progress     int       `json:"progress"`
	Output       string    `json:"output,omitempty"`
	Error        string    `json:"error,omitempty"`
	ProviderID   string    `json:"provider_id,omitempty"`
	Message      string    `json:"message,omitempty"`
	ExecutionLog string    `json:"execution_log,omitempty"`
	ExitCode     *int      `json:"exit_code,omitempty"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// SubmitTaskResponse is returned for Dante-compatible task submission.
type SubmitTaskResponse struct {
	ID        string    `json:"id"`
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
}

// TaskStatusUpdate mirrors provider-daemon status messages on jobs.status.{jobID}.
type TaskStatusUpdate struct {
	JobID        string    `json:"job_id"`
	ProviderID   string    `json:"provider_id"`
	Status       string    `json:"status"`
	Timestamp    time.Time `json:"timestamp"`
	Message      string    `json:"message,omitempty"`
	Progress     float32   `json:"progress,omitempty"`
	ExitCode     *int      `json:"exit_code,omitempty"`
	ExecutionLog string    `json:"execution_log,omitempty"`
}

type cancelJobMessage struct {
	JobID     string    `json:"job_id"`
	Timestamp time.Time `json:"timestamp"`
}

// SubmitJob handles requests to submit a new job.
// It publishes the job request to a NATS subject.
func (h *JobHandler) SubmitJob(w http.ResponseWriter, r *http.Request) {
	var req SubmitJobRequest
	// I need to decode the request body.
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.Logger.Error("Failed to decode job submission request", zap.Error(err))
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// I should perform basic validation.
	if req.Type == "" || req.Name == "" || len(req.Params) == 0 {
		http.Error(w, "Type, name, and params are required fields", http.StatusBadRequest)
		return
	}

	// I should get the UserID from the JWT claims in the context.
	claims, ok := r.Context().Value(auth.ContextKeyClaims).(*auth.Claims)
	if !ok || claims == nil {
		h.Logger.Error("Claims not found in context for job submission")
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}
	req.UserID = claims.UserID

	// I need to generate a unique Job ID.
	jobID := uuid.New().String()

	// I should marshal the job request (including UserID and JobID) into JSON for NATS.
	jobData, err := json.Marshal(struct {
		SubmitJobRequest
		JobID       string    `json:"job_id"`
		SubmittedAt time.Time `json:"submitted_at"`
	}{SubmitJobRequest: req, JobID: jobID, SubmittedAt: time.Now().UTC()})

	if err != nil {
		h.Logger.Error("Failed to marshal job data for NATS", zap.Error(err))
		http.Error(w, "Failed to process job submission", http.StatusInternalServerError)
		return
	}

	// I need to determine the NATS subject (e.g., based on job type or priority).
	// Using a simple subject for now.
	natsSubject := "jobs.submitted"

	// I should publish the job data to NATS.
	if err := h.NatsConn.Publish(natsSubject, jobData); err != nil {
		h.Logger.Error("Failed to publish job to NATS",
			zap.String("subject", natsSubject),
			zap.Error(err))
		http.Error(w, "Failed to submit job via message queue", http.StatusInternalServerError)
		return
	}

	h.Logger.Info("Job submitted successfully to NATS",
		zap.String("job_id", jobID),
		zap.String("subject", natsSubject),
		zap.String("user_id", req.UserID),
	)

	h.setTaskState(TaskState{
		ID:        jobID,
		Status:    "queued",
		Progress:  0,
		Message:   "job submitted",
		UpdatedAt: time.Now(),
	})

	// Respond with success message.
	resp := SubmitJobResponse{
		JobID:     jobID,
		Status:    "queued", // Initial status
		Timestamp: time.Now(),
		Message:   "Job submitted successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted) // 202 Accepted for async processing
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		h.Logger.Error("Failed to encode job submission response", zap.Error(err))
	}
}

// SubmitTask accepts Dante-compatible task submissions.
func (h *JobHandler) SubmitTask(w http.ResponseWriter, r *http.Request) {
	var req SubmitTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	if req.Name == "" {
		req.Name = req.ID
	}
	if req.Type == "" {
		req.Type = "generic"
	}

	state := TaskState{
		ID:        req.ID,
		Status:    "queued",
		Progress:  0,
		UpdatedAt: time.Now(),
	}
	h.setTaskState(state)

	if err := h.publishTaskSubmission(req, r.Header.Get("X-User-ID")); err != nil {
		h.Logger.Error("Failed to publish task submission to scheduler",
			zap.String("task_id", req.ID),
			zap.Error(err),
		)
		http.Error(w, "Failed to submit task via message queue", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(SubmitTaskResponse{
		ID:        req.ID,
		Status:    state.Status,
		Timestamp: state.UpdatedAt,
	})
}

// GetTaskStatus returns Dante-compatible task status.
func (h *JobHandler) GetTaskStatus(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")
	state, ok := h.getTaskState(taskID)
	if !ok {
		http.Error(w, "Task not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(state)
}

func (h *JobHandler) publishTaskSubmission(req SubmitTaskRequest, userID string) error {
	if h.NatsConn == nil {
		// Allow local/unit-test mode without NATS while preserving handler behavior.
		return nil
	}

	if userID == "" {
		userID = "task-api"
	}

	params := make(map[string]interface{})
	if req.Script != "" {
		params["script_content"] = req.Script
		params["script_interpreter"] = "/bin/sh"
		params["script_filename"] = "task_script.sh"
	}
	if req.Image != "" {
		params["docker_image"] = req.Image
	}
	if req.InputURI != "" {
		params["input_uri"] = req.InputURI
	}
	if req.OutputURI != "" {
		params["output_uri"] = req.OutputURI
	}
	if len(req.Metadata) > 0 {
		params["metadata"] = req.Metadata
	}
	if len(params) == 0 {
		params["task_id"] = req.ID
	}

	jobData, err := json.Marshal(struct {
		JobID       string                 `json:"job_id"`
		UserID      string                 `json:"user_id"`
		Type        string                 `json:"type"`
		Name        string                 `json:"name"`
		Params      map[string]interface{} `json:"params"`
		SubmittedAt time.Time              `json:"submitted_at"`
	}{
		JobID:       req.ID,
		UserID:      userID,
		Type:        req.Type,
		Name:        req.Name,
		Params:      params,
		SubmittedAt: time.Now().UTC(),
	})
	if err != nil {
		return err
	}

	return h.NatsConn.Publish("jobs.submitted", jobData)
}

// CancelTask marks an in-flight task as cancelled.
func (h *JobHandler) CancelTask(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")
	state, ok := h.getTaskState(taskID)
	if !ok {
		http.Error(w, "Task not found", http.StatusNotFound)
		return
	}
	if state.Status == "completed" || state.Status == "failed" || state.Status == "cancelled" {
		http.Error(w, "Task already finalized", http.StatusConflict)
		return
	}
	if state.Status == "cancellation_requested" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(state)
		return
	}

	if err := h.publishCancelTask(taskID, state.ProviderID); err != nil {
		h.Logger.Error("Failed to publish task cancel request",
			zap.String("task_id", taskID),
			zap.String("provider_id", state.ProviderID),
			zap.Error(err),
		)
		http.Error(w, "Failed to request cancellation", http.StatusInternalServerError)
		return
	}

	state.Status = "cancellation_requested"
	state.Error = "cancel requested"
	state.Message = "task cancellation requested"
	state.UpdatedAt = time.Now()
	h.setTaskState(state)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(state)
}

func (h *JobHandler) getTaskState(taskID string) (TaskState, bool) {
	h.taskMu.RLock()
	defer h.taskMu.RUnlock()
	state, ok := h.tasks[taskID]
	return state, ok
}

func (h *JobHandler) setTaskState(state TaskState) {
	h.taskMu.Lock()
	defer h.taskMu.Unlock()
	h.tasks[state.ID] = state
}

// HandleTaskStatusMessage consumes provider-daemon status updates from NATS.
func (h *JobHandler) HandleTaskStatusMessage(msg *nats.Msg) {
	var update TaskStatusUpdate
	if err := json.Unmarshal(msg.Data, &update); err != nil {
		h.Logger.Warn("Failed to decode task status update", zap.Error(err), zap.String("subject", msg.Subject))
		return
	}
	h.applyTaskStatusUpdate(update)
}

func (h *JobHandler) applyTaskStatusUpdate(update TaskStatusUpdate) {
	if update.JobID == "" {
		return
	}

	state, ok := h.getTaskState(update.JobID)
	if !ok {
		state = TaskState{
			ID: update.JobID,
		}
	}

	state.Status = mapProviderStatus(update.Status)
	state.ProviderID = update.ProviderID
	state.Message = update.Message
	state.ExecutionLog = update.ExecutionLog
	state.ExitCode = update.ExitCode
	if update.Timestamp.IsZero() {
		state.UpdatedAt = time.Now()
	} else {
		state.UpdatedAt = update.Timestamp
	}

	// Normalize progress: provider may send [0..1] or [0..100].
	progress := update.Progress
	if progress > 0 && progress <= 1 {
		progress = progress * 100
	}
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}
	state.Progress = int(progress)

	if state.Status == "failed" {
		if update.Message != "" {
			state.Error = update.Message
		} else {
			state.Error = "task execution failed"
		}
	} else if state.Status == "completed" {
		if update.Message != "" {
			state.Output = update.Message
		}
		if state.Progress < 100 {
			state.Progress = 100
		}
	}

	h.setTaskState(state)
}

func mapProviderStatus(status string) string {
	switch status {
	case "preparing":
		return "queued"
	case "in_progress":
		return "running"
	case "completed":
		return "completed"
	case "cancelled":
		return "cancelled"
	case "failed", "timeout":
		return "failed"
	default:
		return "queued"
	}
}

// GetJobStatus returns current in-memory lifecycle state for a submitted job.
func (h *JobHandler) GetJobStatus(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobID")
	if jobID == "" {
		http.Error(w, "Missing jobID", http.StatusBadRequest)
		return
	}

	state, ok := h.getTaskState(jobID)
	if !ok {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(state); err != nil {
		h.Logger.Error("Failed to encode job status response", zap.Error(err))
	}
}

// CancelJob marks the job cancelled locally and emits a cancel command on NATS.
func (h *JobHandler) CancelJob(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobID")
	if jobID == "" {
		http.Error(w, "Missing jobID", http.StatusBadRequest)
		return
	}
	state, ok := h.getTaskState(jobID)
	if !ok {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}
	if state.Status == "completed" || state.Status == "failed" || state.Status == "cancelled" {
		http.Error(w, "Job already finalized", http.StatusConflict)
		return
	}
	if state.Status == "cancellation_requested" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		if err := json.NewEncoder(w).Encode(state); err != nil {
			h.Logger.Error("Failed to encode idempotent job cancellation response", zap.Error(err))
		}
		return
	}

	if err := h.publishCancelJob(jobID); err != nil {
		h.Logger.Error("Failed to publish cancel request",
			zap.String("job_id", jobID),
			zap.Error(err),
		)
		http.Error(w, "Failed to request cancellation", http.StatusInternalServerError)
		return
	}

	// Keep the state non-terminal until the provider/scheduler status path confirms cancellation.
	state.Status = "cancellation_requested"
	state.Error = "cancel requested"
	state.Message = "job cancellation requested"
	state.UpdatedAt = time.Now()
	h.setTaskState(state)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	if err := json.NewEncoder(w).Encode(state); err != nil {
		h.Logger.Error("Failed to encode job cancellation response", zap.Error(err))
	}
}

func (h *JobHandler) publishCancelJob(jobID string) error {
	if h.NatsConn == nil {
		return nil
	}

	payload, err := json.Marshal(cancelJobMessage{
		JobID:     jobID,
		Timestamp: time.Now(),
	})
	if err != nil {
		return err
	}

	subject := h.Config.NatsJobCancelSubject
	if subject == "" {
		subject = "jobs.cancel"
	}
	return h.NatsConn.Publish(subject, payload)
}

func (h *JobHandler) publishCancelTask(taskID, providerID string) error {
	if h.NatsConn == nil {
		return nil
	}

	payload, err := json.Marshal(cancelJobMessage{
		JobID:     taskID,
		Timestamp: time.Now(),
	})
	if err != nil {
		return err
	}

	if providerID != "" {
		subject := fmt.Sprintf("tasks.cancel.%s.%s", providerID, taskID)
		return h.NatsConn.Publish(subject, payload)
	}

	subject := h.Config.NatsJobCancelSubject
	if subject == "" {
		subject = "jobs.cancel"
	}
	return h.NatsConn.Publish(subject, payload)
}
