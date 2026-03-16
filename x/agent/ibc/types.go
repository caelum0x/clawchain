// Package ibc implements an IBC middleware for cross-chain agent discovery on ClawChain.
//
// The middleware wraps an underlying IBC module (typically the ICS-20 transfer module)
// and intercepts incoming token transfers. When a packet contains agent discovery
// metadata in the memo field, the middleware queries the agent registry and returns
// matching agents in the acknowledgement, or stores remote agent announcements.
package ibc

import "encoding/json"

const (
	// MetadataKey is the JSON key in the ICS-20 memo field for agent discovery.
	MetadataKey = "clawchain_agent"
)

// AgentDiscoveryRequest is embedded in the ICS-20 transfer memo.
// Example: {"clawchain_agent":{"action":"discover","capabilities":["transfer","query"],"max_results":10}}
// For task delegation: {"clawchain_agent":{"action":"delegate_task","task":{...}}}
// For task query: {"clawchain_agent":{"action":"query_task","task_result":{"task_id":42}}}
type AgentDiscoveryRequest struct {
	// Action: "discover" to find agents, "announce" to register presence,
	// "delegate_task" to delegate a task cross-chain, "query_task" to query task results.
	Action string `json:"action"`
	// Capabilities filter -- only return agents supporting these tools.
	Capabilities []string `json:"capabilities,omitempty"`
	// MaxResults limits the number of agents returned (default 10, max 50).
	MaxResults int `json:"max_results,omitempty"`
	// RemoteAgent is populated when action="announce" -- the remote agent's info.
	RemoteAgent *RemoteAgentInfo `json:"remote_agent,omitempty"`
	// Task is populated when action="delegate_task" -- the task delegation request.
	Task *TaskDelegationRequest `json:"task,omitempty"`
	// TaskResult is populated when action="query_task" -- the task result query.
	TaskResult *TaskResultRequest `json:"task_result,omitempty"`
}

// RemoteAgentInfo describes an agent from a remote chain announcing itself.
type RemoteAgentInfo struct {
	ChainID       string   `json:"chain_id"`
	Address       string   `json:"address"`
	Name          string   `json:"name"`
	Endpoint      string   `json:"endpoint"`
	Tools         []string `json:"tools,omitempty"`
	Status        string   `json:"status,omitempty"`         // "active", "inactive", "expired"
	LastHeartbeat int64    `json:"last_heartbeat,omitempty"` // block height of last heartbeat
}

// DefaultRemoteAgentTTL is the default number of blocks after which a
// remote agent without a heartbeat update is considered expired.
const DefaultRemoteAgentTTL int64 = 1000

// AgentDiscoveryResponse is returned in the acknowledgement data.
type AgentDiscoveryResponse struct {
	// Agents found matching the discovery request.
	Agents []DiscoveredAgent `json:"agents,omitempty"`
	// Acknowledged indicates if an announce was accepted.
	Acknowledged bool `json:"acknowledged,omitempty"`
	// Error message if any.
	Error string `json:"error,omitempty"`
}

// DiscoveredAgent is a single agent returned in discovery results.
type DiscoveredAgent struct {
	Address    string   `json:"address"`
	Name       string   `json:"name"`
	Endpoint   string   `json:"endpoint"`
	Tools      []string `json:"tools,omitempty"`
	Active     bool     `json:"active"`
	Heartbeats uint64   `json:"heartbeats"`
	Reputation string   `json:"reputation,omitempty"`
}

// TaskDelegationRequest is embedded in an ICS-20 transfer memo to delegate a task cross-chain.
// Example: {"clawchain_agent":{"action":"delegate_task","task":{"description":"...","assignee":"claw1...","budget":"1000000uclaw","deadline_blocks":200}}}
type TaskDelegationRequest struct {
	Description    string `json:"description"`
	Requirements   string `json:"requirements,omitempty"`
	Assignee       string `json:"assignee"`
	SkillId        uint64 `json:"skill_id,omitempty"`
	Budget         string `json:"budget"`
	DeadlineBlocks int64  `json:"deadline_blocks"`
}

// TaskDelegationResponse is returned in acknowledgement when a task is created.
type TaskDelegationResponse struct {
	TaskId  uint64 `json:"task_id"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// TaskResultRequest is used to query task results cross-chain.
type TaskResultRequest struct {
	TaskId uint64 `json:"task_id"`
}

// TaskResultResponse returns the task result.
type TaskResultResponse struct {
	TaskId uint64 `json:"task_id"`
	Status string `json:"status"`
	Result string `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

// ParseAgentDiscovery extracts AgentDiscoveryRequest from an ICS-20 memo string.
func ParseAgentDiscovery(memo string) *AgentDiscoveryRequest {
	if memo == "" {
		return nil
	}
	var outer map[string]json.RawMessage
	if err := json.Unmarshal([]byte(memo), &outer); err != nil {
		return nil
	}
	raw, ok := outer[MetadataKey]
	if !ok {
		return nil
	}
	var req AgentDiscoveryRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return nil
	}
	return &req
}
