package metering

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
)

// NATSSubscriber abstracts the NATS subscription mechanism for testability.
// Implementations wrap a real NATS connection; tests use a mock.
type NATSSubscriber interface {
	Subscribe(subject string, handler func(subject string, data []byte)) error
	Close()
}

// JobStatusEvent is the JSON payload published on NATS job status subjects.
// It matches DanteGPU's canonical event format.
type JobStatusEvent struct {
	JobID      string `json:"job_id"`
	ProviderID string `json:"provider_id"`
	Status     string `json:"status"`
	GPUType    string `json:"gpu_type"`
	GPUCount   int    `json:"gpu_count"`
	TaskID     string `json:"task_id,omitempty"`
}

// EventSubscriber wires NATS job-status events to the metering pipeline.
// It starts/stops meters, persists usage records, and calculates settlements
// in response to job lifecycle events.
type EventSubscriber struct {
	meter    *Meter
	store    *UsageStore
	nats     NATSSubscriber
	priceMap map[string]int64 // gpuType -> uclaw per GPU-hour
	logger   *log.Logger
	mu       sync.Mutex
	running  bool
}

// NewEventSubscriber creates an EventSubscriber with the given dependencies.
// priceMap maps GPU type names (e.g. "A100") to uclaw-per-GPU-hour rates.
func NewEventSubscriber(meter *Meter, store *UsageStore, nats NATSSubscriber, priceMap map[string]int64) *EventSubscriber {
	return &EventSubscriber{
		meter:    meter,
		store:    store,
		nats:     nats,
		priceMap: priceMap,
		logger:   log.New(os.Stdout, "[metering-events] ", log.LstdFlags),
	}
}

// Start subscribes to all relevant NATS job-status subjects.
// It is safe to call only once; subsequent calls return an error.
func (es *EventSubscriber) Start() error {
	es.mu.Lock()
	defer es.mu.Unlock()

	if es.running {
		return fmt.Errorf("event subscriber already running")
	}

	subjects := []string{
		"jobs.status.*.running",
		"jobs.status.*.completed",
		"jobs.status.*.failed",
		"jobs.status.*.cancelled",
	}

	for _, subj := range subjects {
		if err := es.nats.Subscribe(subj, es.handleEvent); err != nil {
			return fmt.Errorf("subscribe to %s: %w", subj, err)
		}
	}

	es.running = true
	es.logger.Println("subscribed to job status events")
	return nil
}

// Close unsubscribes from NATS and marks the subscriber as stopped.
func (es *EventSubscriber) Close() {
	es.mu.Lock()
	defer es.mu.Unlock()

	if !es.running {
		return
	}

	es.nats.Close()
	es.running = false
	es.logger.Println("unsubscribed from job status events")
}

// handleEvent dispatches a raw NATS message to the appropriate handler
// based on the event's Status field.
func (es *EventSubscriber) handleEvent(subject string, data []byte) {
	var evt JobStatusEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		es.logger.Printf("ERROR: unmarshal event on %s: %v", subject, err)
		return
	}

	if evt.JobID == "" {
		es.logger.Printf("ERROR: received event with empty job_id on %s", subject)
		return
	}

	switch evt.Status {
	case "running":
		es.handleRunning(evt)
	case "completed":
		es.handleCompleted(evt)
	case "failed":
		es.handleFailed(evt)
	case "cancelled":
		es.handleCancelled(evt)
	default:
		es.logger.Printf("WARN: unknown status %q for job %s", evt.Status, evt.JobID)
	}
}

// handleRunning starts metering for a newly running job.
func (es *EventSubscriber) handleRunning(evt JobStatusEvent) {
	if evt.GPUCount <= 0 {
		evt.GPUCount = 1 // default to 1 GPU if not specified
	}

	es.meter.StartMeter(evt.JobID, evt.ProviderID, evt.GPUType, evt.GPUCount)
	es.logger.Printf("started meter: job=%s provider=%s gpu=%s count=%d",
		evt.JobID, evt.ProviderID, evt.GPUType, evt.GPUCount)
}

// handleCompleted stops the meter, persists usage, and calculates settlement.
func (es *EventSubscriber) handleCompleted(evt JobStatusEvent) {
	usage, err := es.meter.StopMeter(evt.JobID)
	if err != nil {
		es.logger.Printf("WARN: stop meter for completed job %s: %v", evt.JobID, err)
		return
	}

	if err := es.store.SaveUsage(usage); err != nil {
		es.logger.Printf("ERROR: save usage for job %s: %v", evt.JobID, err)
		return
	}

	price, ok := es.priceMap[usage.GPUType]
	if !ok {
		es.logger.Printf("WARN: no price for GPU type %q, using 0 for job %s", usage.GPUType, evt.JobID)
		price = 0
	}

	settlement := CalculateSettlement(usage, price)
	es.logger.Printf("settlement: job=%s provider=%s gpu_seconds=%.2f cost=%d uclaw",
		settlement.JobID, settlement.ProviderID, settlement.GPUSeconds, settlement.TotalCostUclaw)
}

// handleFailed stops the meter for a failed job. No settlement is generated.
func (es *EventSubscriber) handleFailed(evt JobStatusEvent) {
	usage, err := es.meter.StopMeter(evt.JobID)
	if err != nil {
		es.logger.Printf("WARN: stop meter for failed job %s: %v", evt.JobID, err)
		return
	}

	es.logger.Printf("job failed (no settlement): job=%s provider=%s gpu_seconds=%.2f",
		evt.JobID, usage.ProviderID, usage.GPUSeconds)
}

// handleCancelled stops the meter for a cancelled job. No settlement is generated.
func (es *EventSubscriber) handleCancelled(evt JobStatusEvent) {
	usage, err := es.meter.StopMeter(evt.JobID)
	if err != nil {
		es.logger.Printf("WARN: stop meter for cancelled job %s: %v", evt.JobID, err)
		return
	}

	es.logger.Printf("job cancelled (no settlement): job=%s provider=%s gpu_seconds=%.2f",
		evt.JobID, usage.ProviderID, usage.GPUSeconds)
}
