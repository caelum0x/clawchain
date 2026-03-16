package ibc

import "encoding/json"

// IBCTaskACK is the acknowledgement data sent back to the source chain
// when a cross-chain task is completed or times out.
type IBCTaskACK struct {
	TaskId     uint64 `json:"task_id"`
	Status     string `json:"status"`     // "completed", "timeout", "error"
	ResultHash string `json:"result_hash,omitempty"`
	Error      string `json:"error,omitempty"`
}

// ParseIBCTaskACK extracts an IBCTaskACK from raw acknowledgement bytes.
// Returns nil if the bytes don't contain a valid task ACK.
func ParseIBCTaskACK(ackBytes []byte) *IBCTaskACK {
	if len(ackBytes) == 0 {
		return nil
	}

	var ack IBCTaskACK
	if err := json.Unmarshal(ackBytes, &ack); err != nil {
		return nil
	}

	// Must have a task ID to be a valid task ACK.
	if ack.TaskId == 0 {
		return nil
	}

	return &ack
}
