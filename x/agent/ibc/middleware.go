package ibc

import (
	"encoding/json"
	"fmt"

	sdk "github.com/cosmos/cosmos-sdk/types"
	channeltypes "github.com/cosmos/ibc-go/v10/modules/core/04-channel/types"
	porttypes "github.com/cosmos/ibc-go/v10/modules/core/05-port/types"
	ibcexported "github.com/cosmos/ibc-go/v10/modules/core/exported"

	transfertypes "github.com/cosmos/ibc-go/v10/modules/apps/transfer/types"
)

// AgentKeeper defines the interface the middleware uses from the agent keeper.
// This avoids a direct dependency on the full keeper type.
type AgentKeeper interface {
	// DiscoverAgents queries active agents matching the given capabilities.
	DiscoverAgents(ctx sdk.Context, capabilities []string, maxResults int) []DiscoveredAgent
	// StoreRemoteAgent persists a remote agent announcement from a cross-chain source.
	StoreRemoteAgent(ctx sdk.Context, sourceChain string, sourceChannel string, agent RemoteAgentInfo) error
	// CreateTaskFromIBC creates a task delegated from a remote chain via IBC.
	CreateTaskFromIBC(ctx sdk.Context, delegator string, sourceChain string, assignee string, description string, requirements string, skillId uint64, budget string, deadlineBlocks int64) (uint64, error)
	// QueryTaskResult returns the status and result of a task.
	QueryTaskResult(ctx sdk.Context, taskId uint64) (status string, result string, err error)
}

// AgentIBCMiddleware implements the ICS-26 IBCModule interface (IBC-go v10).
// It wraps an underlying IBC module (typically the ICS-20 transfer module)
// and intercepts OnRecvPacket to handle cross-chain agent discovery requests.
type AgentIBCMiddleware struct {
	app         porttypes.IBCModule
	agentKeeper AgentKeeper
}

// NewAgentIBCMiddleware creates a new AgentIBCMiddleware wrapping the given IBC module.
func NewAgentIBCMiddleware(app porttypes.IBCModule, keeper AgentKeeper) AgentIBCMiddleware {
	return AgentIBCMiddleware{
		app:         app,
		agentKeeper: keeper,
	}
}

// ---------------------------------------------------------------------------
// ICS-26 callbacks -- Channel handshake (delegated to underlying module)
// ---------------------------------------------------------------------------

func (im AgentIBCMiddleware) OnChanOpenInit(
	ctx sdk.Context,
	order channeltypes.Order,
	connectionHops []string,
	portID string,
	channelID string,
	counterparty channeltypes.Counterparty,
	version string,
) (string, error) {
	return im.app.OnChanOpenInit(ctx, order, connectionHops, portID, channelID, counterparty, version)
}

func (im AgentIBCMiddleware) OnChanOpenTry(
	ctx sdk.Context,
	order channeltypes.Order,
	connectionHops []string,
	portID,
	channelID string,
	counterparty channeltypes.Counterparty,
	counterpartyVersion string,
) (string, error) {
	return im.app.OnChanOpenTry(ctx, order, connectionHops, portID, channelID, counterparty, counterpartyVersion)
}

func (im AgentIBCMiddleware) OnChanOpenAck(
	ctx sdk.Context,
	portID,
	channelID string,
	counterpartyChannelID string,
	counterpartyVersion string,
) error {
	return im.app.OnChanOpenAck(ctx, portID, channelID, counterpartyChannelID, counterpartyVersion)
}

func (im AgentIBCMiddleware) OnChanOpenConfirm(ctx sdk.Context, portID, channelID string) error {
	return im.app.OnChanOpenConfirm(ctx, portID, channelID)
}

func (im AgentIBCMiddleware) OnChanCloseInit(ctx sdk.Context, portID, channelID string) error {
	return im.app.OnChanCloseInit(ctx, portID, channelID)
}

func (im AgentIBCMiddleware) OnChanCloseConfirm(ctx sdk.Context, portID, channelID string) error {
	return im.app.OnChanCloseConfirm(ctx, portID, channelID)
}

// ---------------------------------------------------------------------------
// ICS-26 callbacks -- Packet handling
// ---------------------------------------------------------------------------

// OnRecvPacket is the core middleware hook. It:
//  1. Delegates to the underlying transfer module to process the packet.
//  2. If successful and the memo contains agent discovery metadata, processes
//     the discovery or announcement request and enriches the acknowledgement.
func (im AgentIBCMiddleware) OnRecvPacket(
	ctx sdk.Context,
	channelVersion string,
	packet channeltypes.Packet,
	relayer sdk.AccAddress,
) ibcexported.Acknowledgement {
	// Let the underlying transfer module handle the packet first.
	ack := im.app.OnRecvPacket(ctx, channelVersion, packet, relayer)
	if ack == nil || !ack.Success() {
		return ack
	}

	// Parse the ICS-20 transfer data from the packet.
	var data transfertypes.FungibleTokenPacketData
	if err := json.Unmarshal(packet.GetData(), &data); err != nil {
		// Not a valid ICS-20 packet; return the original acknowledgement.
		return ack
	}

	// Check for agent discovery metadata in the memo.
	req := ParseAgentDiscovery(data.GetMemo())
	if req == nil {
		return ack
	}

	switch req.Action {
	case "discover":
		return im.handleDiscover(ctx, packet, req)
	case "announce":
		return im.handleAnnounce(ctx, packet, req)
	case "delegate_task":
		return im.handleDelegateTask(ctx, channelVersion, packet, data, req)
	case "query_task":
		return im.handleQueryTask(ctx, channelVersion, packet, data, req)
	default:
		// Unknown action; return the original acknowledgement.
		return ack
	}
}

// handleDiscover queries the agent keeper for active agents matching the
// requested capabilities and returns the results in a custom acknowledgement.
func (im AgentIBCMiddleware) handleDiscover(
	ctx sdk.Context,
	packet channeltypes.Packet,
	req *AgentDiscoveryRequest,
) ibcexported.Acknowledgement {
	maxResults := req.MaxResults
	if maxResults <= 0 {
		maxResults = 10
	}
	if maxResults > 50 {
		maxResults = 50
	}

	agents := im.agentKeeper.DiscoverAgents(ctx, req.Capabilities, maxResults)

	resp := AgentDiscoveryResponse{
		Agents: agents,
	}
	respBytes, err := json.Marshal(resp)
	if err != nil {
		errResp := AgentDiscoveryResponse{Error: "failed to marshal discovery response"}
		errBytes, _ := json.Marshal(errResp)
		return channeltypes.NewResultAcknowledgement(errBytes)
	}

	ctx.EventManager().EmitEvent(
		sdk.NewEvent(
			"ibc_agent_discovery",
			sdk.NewAttribute("source_channel", packet.GetSourceChannel()),
			sdk.NewAttribute("source_port", packet.GetSourcePort()),
			sdk.NewAttribute("agents_found", fmt.Sprintf("%d", len(agents))),
		),
	)

	return channeltypes.NewResultAcknowledgement(respBytes)
}

// handleAnnounce stores the remote agent info and returns an acknowledgement.
func (im AgentIBCMiddleware) handleAnnounce(
	ctx sdk.Context,
	packet channeltypes.Packet,
	req *AgentDiscoveryRequest,
) ibcexported.Acknowledgement {
	if req.RemoteAgent == nil {
		errResp := AgentDiscoveryResponse{Error: "announce action requires remote_agent field"}
		errBytes, _ := json.Marshal(errResp)
		return channeltypes.NewResultAcknowledgement(errBytes)
	}

	agent := *req.RemoteAgent
	sourceChannel := packet.GetDestChannel()

	// Derive source chain from the remote agent info if available,
	// otherwise use the channel ID as identifier.
	sourceChain := agent.ChainID
	if sourceChain == "" {
		sourceChain = sourceChannel
	}

	if err := im.agentKeeper.StoreRemoteAgent(ctx, sourceChain, sourceChannel, agent); err != nil {
		errResp := AgentDiscoveryResponse{Error: fmt.Sprintf("failed to store remote agent: %s", err.Error())}
		errBytes, _ := json.Marshal(errResp)
		return channeltypes.NewResultAcknowledgement(errBytes)
	}

	ctx.EventManager().EmitEvent(
		sdk.NewEvent(
			"ibc_agent_announce",
			sdk.NewAttribute("source_chain", sourceChain),
			sdk.NewAttribute("source_channel", sourceChannel),
			sdk.NewAttribute("agent_address", agent.Address),
			sdk.NewAttribute("agent_name", agent.Name),
		),
	)

	resp := AgentDiscoveryResponse{Acknowledged: true}
	respBytes, _ := json.Marshal(resp)
	return channeltypes.NewResultAcknowledgement(respBytes)
}

// handleDelegateTask creates a task on behalf of a remote chain delegator.
// The ICS-20 transfer amount serves as the task budget sent cross-chain.
func (im AgentIBCMiddleware) handleDelegateTask(
	ctx sdk.Context,
	_ string,
	packet channeltypes.Packet,
	data transfertypes.FungibleTokenPacketData,
	req *AgentDiscoveryRequest,
) ibcexported.Acknowledgement {
	if req.Task == nil {
		resp := TaskDelegationResponse{Error: "delegate_task action requires task field"}
		respBytes, _ := json.Marshal(resp)
		return channeltypes.NewResultAcknowledgement(respBytes)
	}

	task := req.Task

	if task.Assignee == "" {
		resp := TaskDelegationResponse{Error: "task assignee is required"}
		respBytes, _ := json.Marshal(resp)
		return channeltypes.NewResultAcknowledgement(respBytes)
	}

	if task.Description == "" {
		resp := TaskDelegationResponse{Error: "task description is required"}
		respBytes, _ := json.Marshal(resp)
		return channeltypes.NewResultAcknowledgement(respBytes)
	}

	// Derive source chain from the channel.
	sourceChannel := packet.GetDestChannel()
	sourceChain := sourceChannel

	// The delegator is the ICS-20 sender on the remote chain.
	delegator := data.GetSender()

	// The budget is the ICS-20 transfer amount + denom.
	budget := data.GetAmount() + data.GetDenom()
	if task.Budget != "" {
		budget = task.Budget
	}

	deadlineBlocks := task.DeadlineBlocks
	if deadlineBlocks <= 0 {
		deadlineBlocks = 200 // ~20 min at 6s blocks
	}

	taskID, err := im.agentKeeper.CreateTaskFromIBC(
		ctx,
		delegator,
		sourceChain,
		task.Assignee,
		task.Description,
		task.Requirements,
		task.SkillId,
		budget,
		deadlineBlocks,
	)
	if err != nil {
		resp := TaskDelegationResponse{Error: fmt.Sprintf("failed to create task: %s", err.Error())}
		respBytes, _ := json.Marshal(resp)
		return channeltypes.NewResultAcknowledgement(respBytes)
	}

	ctx.EventManager().EmitEvent(
		sdk.NewEvent(
			"ibc_task_delegated",
			sdk.NewAttribute("source_channel", sourceChannel),
			sdk.NewAttribute("delegator", delegator),
			sdk.NewAttribute("assignee", task.Assignee),
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", taskID)),
		),
	)

	resp := TaskDelegationResponse{
		TaskId:  taskID,
		Success: true,
	}
	respBytes, _ := json.Marshal(resp)
	return channeltypes.NewResultAcknowledgement(respBytes)
}

// handleQueryTask queries the status and result of a task on behalf of a remote chain.
func (im AgentIBCMiddleware) handleQueryTask(
	ctx sdk.Context,
	_ string,
	packet channeltypes.Packet,
	_ transfertypes.FungibleTokenPacketData,
	req *AgentDiscoveryRequest,
) ibcexported.Acknowledgement {
	if req.TaskResult == nil {
		resp := TaskResultResponse{Error: "query_task action requires task_result field"}
		respBytes, _ := json.Marshal(resp)
		return channeltypes.NewResultAcknowledgement(respBytes)
	}

	taskId := req.TaskResult.TaskId
	status, result, err := im.agentKeeper.QueryTaskResult(ctx, taskId)
	if err != nil {
		resp := TaskResultResponse{
			TaskId: taskId,
			Error:  fmt.Sprintf("failed to query task: %s", err.Error()),
		}
		respBytes, _ := json.Marshal(resp)
		return channeltypes.NewResultAcknowledgement(respBytes)
	}

	ctx.EventManager().EmitEvent(
		sdk.NewEvent(
			"ibc_task_queried",
			sdk.NewAttribute("source_channel", packet.GetDestChannel()),
			sdk.NewAttribute("task_id", fmt.Sprintf("%d", taskId)),
			sdk.NewAttribute("status", status),
		),
	)

	resp := TaskResultResponse{
		TaskId: taskId,
		Status: status,
		Result: result,
	}
	respBytes, _ := json.Marshal(resp)
	return channeltypes.NewResultAcknowledgement(respBytes)
}

// OnAcknowledgementPacket processes IBC acknowledgements. If the original
// packet contained a task delegation memo, the ACK is parsed for task
// completion status and the corresponding task is updated.
func (im AgentIBCMiddleware) OnAcknowledgementPacket(
	ctx sdk.Context,
	channelVersion string,
	packet channeltypes.Packet,
	acknowledgement []byte,
	relayer sdk.AccAddress,
) error {
	// First, delegate to the underlying module.
	if err := im.app.OnAcknowledgementPacket(ctx, channelVersion, packet, acknowledgement, relayer); err != nil {
		return err
	}

	// Check if the original packet contained an agent memo.
	var data transfertypes.FungibleTokenPacketData
	if err := json.Unmarshal(packet.GetData(), &data); err != nil {
		return nil // Not an ICS-20 packet; nothing to do.
	}

	req := ParseAgentDiscovery(data.GetMemo())
	if req == nil {
		return nil
	}

	// Process task-related ACK errors.
	if req.Action == "delegate_task" {
		taskAck := ParseIBCTaskACK(acknowledgement)
		if taskAck != nil && taskAck.Error != "" {
			ctx.EventManager().EmitEvent(
				sdk.NewEvent(
					"ibc_task_ack_error",
					sdk.NewAttribute("source_channel", packet.GetSourceChannel()),
					sdk.NewAttribute("task_id", fmt.Sprintf("%d", taskAck.TaskId)),
					sdk.NewAttribute("error", taskAck.Error),
				),
			)
		}
	}

	return nil
}

// OnTimeoutPacket handles IBC packet timeouts. If the timed-out packet
// contained a task delegation memo, the corresponding task is marked as
// "timeout" and an event is emitted.
func (im AgentIBCMiddleware) OnTimeoutPacket(
	ctx sdk.Context,
	channelVersion string,
	packet channeltypes.Packet,
	relayer sdk.AccAddress,
) error {
	// First, delegate to the underlying module.
	if err := im.app.OnTimeoutPacket(ctx, channelVersion, packet, relayer); err != nil {
		return err
	}

	// Check if the timed-out packet contained an agent memo.
	var data transfertypes.FungibleTokenPacketData
	if err := json.Unmarshal(packet.GetData(), &data); err != nil {
		return nil // Not an ICS-20 packet; nothing to do.
	}

	req := ParseAgentDiscovery(data.GetMemo())
	if req == nil {
		return nil
	}

	// Emit timeout events for task delegations.
	if req.Action == "delegate_task" && req.Task != nil {
		ctx.EventManager().EmitEvent(
			sdk.NewEvent(
				"ibc_task_timeout",
				sdk.NewAttribute("source_channel", packet.GetSourceChannel()),
				sdk.NewAttribute("assignee", req.Task.Assignee),
				sdk.NewAttribute("description", req.Task.Description),
			),
		)
	}

	return nil
}
