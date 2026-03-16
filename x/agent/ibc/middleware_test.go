package ibc

import (
	"encoding/json"
	"testing"
)

func TestParseAgentDiscovery_EmptyMemo(t *testing.T) {
	result := ParseAgentDiscovery("")
	if result != nil {
		t.Fatal("expected nil for empty memo")
	}
}

func TestParseAgentDiscovery_InvalidJSON(t *testing.T) {
	result := ParseAgentDiscovery("not json")
	if result != nil {
		t.Fatal("expected nil for invalid JSON")
	}
}

func TestParseAgentDiscovery_NoAgentKey(t *testing.T) {
	result := ParseAgentDiscovery(`{"other_key": "value"}`)
	if result != nil {
		t.Fatal("expected nil when clawchain_agent key is missing")
	}
}

func TestParseAgentDiscovery_DiscoverAction(t *testing.T) {
	memo := `{"clawchain_agent":{"action":"discover","capabilities":["transfer","query"],"max_results":10}}`
	result := ParseAgentDiscovery(memo)
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Action != "discover" {
		t.Fatalf("expected action 'discover', got %q", result.Action)
	}
	if len(result.Capabilities) != 2 {
		t.Fatalf("expected 2 capabilities, got %d", len(result.Capabilities))
	}
	if result.Capabilities[0] != "transfer" {
		t.Fatalf("expected first capability 'transfer', got %q", result.Capabilities[0])
	}
	if result.Capabilities[1] != "query" {
		t.Fatalf("expected second capability 'query', got %q", result.Capabilities[1])
	}
	if result.MaxResults != 10 {
		t.Fatalf("expected max_results 10, got %d", result.MaxResults)
	}
}

func TestParseAgentDiscovery_AnnounceAction(t *testing.T) {
	memo := `{"clawchain_agent":{"action":"announce","remote_agent":{"chain_id":"osmosis-1","address":"osmo1abc","name":"test-agent","endpoint":"https://agent.example.com","tools":["transfer"]}}}`
	result := ParseAgentDiscovery(memo)
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Action != "announce" {
		t.Fatalf("expected action 'announce', got %q", result.Action)
	}
	if result.RemoteAgent == nil {
		t.Fatal("expected non-nil RemoteAgent")
	}
	if result.RemoteAgent.ChainID != "osmosis-1" {
		t.Fatalf("expected chain_id 'osmosis-1', got %q", result.RemoteAgent.ChainID)
	}
	if result.RemoteAgent.Address != "osmo1abc" {
		t.Fatalf("expected address 'osmo1abc', got %q", result.RemoteAgent.Address)
	}
	if result.RemoteAgent.Name != "test-agent" {
		t.Fatalf("expected name 'test-agent', got %q", result.RemoteAgent.Name)
	}
	if len(result.RemoteAgent.Tools) != 1 || result.RemoteAgent.Tools[0] != "transfer" {
		t.Fatalf("unexpected tools: %v", result.RemoteAgent.Tools)
	}
}

func TestParseAgentDiscovery_MixedMemo(t *testing.T) {
	// Memo with both privacy and agent metadata (both middlewares should work)
	memo := `{"clawchain_privacy":{"auto_shield":true},"clawchain_agent":{"action":"discover","max_results":5}}`
	result := ParseAgentDiscovery(memo)
	if result == nil {
		t.Fatal("expected non-nil result from mixed memo")
	}
	if result.Action != "discover" {
		t.Fatalf("expected action 'discover', got %q", result.Action)
	}
	if result.MaxResults != 5 {
		t.Fatalf("expected max_results 5, got %d", result.MaxResults)
	}
}

func TestAgentDiscoveryResponse_Marshal(t *testing.T) {
	resp := AgentDiscoveryResponse{
		Agents: []DiscoveredAgent{
			{
				Address:    "claw1abc",
				Name:       "test-agent",
				Endpoint:   "https://agent.example.com",
				Tools:      []string{"transfer", "query"},
				Active:     true,
				Heartbeats: 42,
			},
		},
	}
	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("unexpected marshal error: %v", err)
	}

	var decoded AgentDiscoveryResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unexpected unmarshal error: %v", err)
	}
	if len(decoded.Agents) != 1 {
		t.Fatalf("expected 1 agent, got %d", len(decoded.Agents))
	}
	if decoded.Agents[0].Address != "claw1abc" {
		t.Fatalf("expected address 'claw1abc', got %q", decoded.Agents[0].Address)
	}
	if decoded.Agents[0].Heartbeats != 42 {
		t.Fatalf("expected heartbeats 42, got %d", decoded.Agents[0].Heartbeats)
	}
}
