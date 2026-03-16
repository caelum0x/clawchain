package keeper_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	sdk "github.com/cosmos/cosmos-sdk/types"

	agentibc "clawchain/x/agent/ibc"
)

func TestRemoteAgentExpiry(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	// Store a remote agent at block 0.
	err := f.keeper.StoreRemoteAgent(sdkCtx, "chain-b", "channel-0", agentibc.RemoteAgentInfo{
		ChainID: "chain-b", Address: "agent1", Name: "Remote Agent",
	})
	require.NoError(t, err)

	// Verify agent is active.
	agents, err := f.keeper.QueryRemoteAgents(f.ctx)
	require.NoError(t, err)
	require.Len(t, agents, 1)
	var info agentibc.RemoteAgentInfo
	err = json.Unmarshal([]byte(agents[0]), &info)
	require.NoError(t, err)
	require.Equal(t, "active", info.Status)

	// Advance blocks past TTL (default 1000).
	advancedCtx := sdkCtx.WithBlockHeight(1001)

	// Run remote agent cleanup.
	err = f.keeper.ExpireRemoteAgents(advancedCtx)
	require.NoError(t, err)

	// Agent should now be inactive.
	agents, err = f.keeper.QueryRemoteAgents(advancedCtx)
	require.NoError(t, err)
	require.Len(t, agents, 1)
	err = json.Unmarshal([]byte(agents[0]), &info)
	require.NoError(t, err)
	require.Equal(t, "inactive", info.Status)
}

func TestRemoteAgentExpiry_NoExpireIfRecent(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx).WithBlockHeight(500)

	// Store a remote agent at block 500.
	err := f.keeper.StoreRemoteAgent(sdkCtx, "chain-c", "channel-1", agentibc.RemoteAgentInfo{
		ChainID: "chain-c", Address: "agent2", Name: "Recent Agent",
	})
	require.NoError(t, err)

	// Check at block 1000 (only 500 blocks passed, TTL is 1000).
	checkCtx := sdkCtx.WithBlockHeight(1000)
	err = f.keeper.ExpireRemoteAgents(checkCtx)
	require.NoError(t, err)

	// Agent should still be active.
	agents, err := f.keeper.QueryRemoteAgents(checkCtx)
	require.NoError(t, err)
	require.Len(t, agents, 1)
	var info agentibc.RemoteAgentInfo
	err = json.Unmarshal([]byte(agents[0]), &info)
	require.NoError(t, err)
	require.Equal(t, "active", info.Status)
}

func TestRemoteAgentExpiry_AlreadyInactive(t *testing.T) {
	f := initFixture(t)
	sdkCtx := sdk.UnwrapSDKContext(f.ctx)

	// Store an agent and make it inactive.
	err := f.keeper.StoreRemoteAgent(sdkCtx, "chain-d", "channel-2", agentibc.RemoteAgentInfo{
		ChainID: "chain-d", Address: "agent3", Name: "Inactive Agent",
		Status: "inactive",
	})
	require.NoError(t, err)

	// Advance past TTL.
	advancedCtx := sdkCtx.WithBlockHeight(2000)
	err = f.keeper.ExpireRemoteAgents(advancedCtx)
	require.NoError(t, err)

	// Agent should still be inactive (not double-processed).
	agents, err := f.keeper.QueryRemoteAgents(advancedCtx)
	require.NoError(t, err)
	require.Len(t, agents, 1)
	var info agentibc.RemoteAgentInfo
	err = json.Unmarshal([]byte(agents[0]), &info)
	require.NoError(t, err)
	require.Equal(t, "inactive", info.Status)
}
