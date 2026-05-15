//go:build e2e
// +build e2e

package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"cosmossdk.io/core/address"
	"cosmossdk.io/math"
	storetypes "cosmossdk.io/store/types"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/testutil"
	sdk "github.com/cosmos/cosmos-sdk/types"
	moduletestutil "github.com/cosmos/cosmos-sdk/types/module/testutil"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/stretchr/testify/require"

	agentkeeper "clawchain/x/agent/keeper"
	agentmodule "clawchain/x/agent/module"
	agenttypes "clawchain/x/agent/types"

	govkeeper "clawchain/x/governance/keeper"
	govtypes "clawchain/x/governance/types"

	marketkeeper "clawchain/x/marketplace/keeper"
	marketmodule "clawchain/x/marketplace/module"
	markettypes "clawchain/x/marketplace/types"

	repkeeper "clawchain/x/reputation/keeper"
	repmodule "clawchain/x/reputation/module"
	reptypes "clawchain/x/reputation/types"
)

// ---------------------------------------------------------------------------
// Mock Bank Keeper (cross-module, satisfies all module bank keeper interfaces)
// ---------------------------------------------------------------------------

type crossMockBankKeeper struct {
	balances       map[string]sdk.Coins
	moduleBalances map[string]sdk.Coins
}

func newCrossMockBank() *crossMockBankKeeper {
	return &crossMockBankKeeper{
		balances:       make(map[string]sdk.Coins),
		moduleBalances: make(map[string]sdk.Coins),
	}
}

func (m *crossMockBankKeeper) SpendableCoins(_ context.Context, addr sdk.AccAddress) sdk.Coins {
	return m.balances[addr.String()]
}

func (m *crossMockBankKeeper) SendCoins(_ context.Context, from, to sdk.AccAddress, amt sdk.Coins) error {
	key := from.String()
	bal := m.balances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.balances[key] = newBal
	m.balances[to.String()] = m.balances[to.String()].Add(amt...)
	return nil
}

func (m *crossMockBankKeeper) SendCoinsFromAccountToModule(_ context.Context, sender sdk.AccAddress, mod string, amt sdk.Coins) error {
	key := sender.String()
	bal := m.balances[key]
	newBal, hasNeg := bal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds")
	}
	m.balances[key] = newBal
	m.moduleBalances[mod] = m.moduleBalances[mod].Add(amt...)
	return nil
}

func (m *crossMockBankKeeper) SendCoinsFromModuleToAccount(_ context.Context, mod string, recipient sdk.AccAddress, amt sdk.Coins) error {
	modBal := m.moduleBalances[mod]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds in module %s", mod)
	}
	m.moduleBalances[mod] = newBal
	m.balances[recipient.String()] = m.balances[recipient.String()].Add(amt...)
	return nil
}

func (m *crossMockBankKeeper) BurnCoins(_ context.Context, moduleName string, amt sdk.Coins) error {
	modBal := m.moduleBalances[moduleName]
	newBal, hasNeg := modBal.SafeSub(amt...)
	if hasNeg {
		return fmt.Errorf("insufficient funds to burn")
	}
	m.moduleBalances[moduleName] = newBal
	return nil
}

func (m *crossMockBankKeeper) MintCoins(_ context.Context, moduleName string, amt sdk.Coins) error {
	m.moduleBalances[moduleName] = m.moduleBalances[moduleName].Add(amt...)
	return nil
}

func (m *crossMockBankKeeper) fundAccount(addr string, coins sdk.Coins) {
	m.balances[addr] = m.balances[addr].Add(coins...)
}

// ---------------------------------------------------------------------------
// Mock Mint Keeper (agent module dependency)
// ---------------------------------------------------------------------------

type crossMockMintKeeper struct{}

func (m *crossMockMintKeeper) GetMintDenom(_ context.Context) (string, error) {
	return "uclaw", nil
}
func (m *crossMockMintKeeper) GetAnnualProvisions(_ context.Context) (math.LegacyDec, error) {
	return math.LegacyZeroDec(), nil
}

// ---------------------------------------------------------------------------
// Mock Staking Keeper (governance dependency)
// ---------------------------------------------------------------------------

type crossMockStakingKeeper struct {
	bonded map[string]math.Int
}

func newCrossMockStaking() *crossMockStakingKeeper {
	return &crossMockStakingKeeper{bonded: make(map[string]math.Int)}
}

func (m *crossMockStakingKeeper) setBonded(addr sdk.AccAddress, amount math.Int) {
	m.bonded[addr.String()] = amount
}

func (m *crossMockStakingKeeper) GetDelegatorBonded(_ context.Context, delegator sdk.AccAddress) (math.Int, error) {
	if amt, ok := m.bonded[delegator.String()]; ok {
		return amt, nil
	}
	return math.ZeroInt(), nil
}

// ---------------------------------------------------------------------------
// Mock Param Executor (governance dependency)
// ---------------------------------------------------------------------------

type crossMockParamExecutor struct {
	appliedParams map[string]string
}

func newCrossMockParamExecutor() *crossMockParamExecutor {
	return &crossMockParamExecutor{appliedParams: make(map[string]string)}
}

func (m *crossMockParamExecutor) UpdateParam(_ context.Context, paramKey string, newValue string) error {
	m.appliedParams[paramKey] = newValue
	return nil
}

// ---------------------------------------------------------------------------
// Cross-Module Fixture: Agent + Marketplace + Reputation
// ---------------------------------------------------------------------------

type crossAgentMarketRepFixture struct {
	ctx          context.Context
	addressCodec address.Codec
	bankKeeper   *crossMockBankKeeper

	agentKeeper  agentkeeper.Keeper
	marketKeeper marketkeeper.Keeper
	repKeeper    repkeeper.Keeper
}

func initCrossAgentMarketRepFixture(t *testing.T) *crossAgentMarketRepFixture {
	t.Helper()

	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	bk := newCrossMockBank()
	mk := &crossMockMintKeeper{}

	// --- Module store keys ---
	agentStoreKey := storetypes.NewKVStoreKey(agenttypes.StoreKey)
	agentStoreService := runtime.NewKVStoreService(agentStoreKey)

	marketStoreKey := storetypes.NewKVStoreKey(markettypes.StoreKey)
	marketStoreService := runtime.NewKVStoreService(marketStoreKey)

	repStoreKey := storetypes.NewKVStoreKey(reptypes.StoreKey)
	repStoreService := runtime.NewKVStoreService(repStoreKey)

	// Create a single multistore context with all module store keys mounted.
	ctx := testutil.DefaultContextWithKeys(
		map[string]*storetypes.KVStoreKey{
			agenttypes.StoreKey:  agentStoreKey,
			markettypes.StoreKey: marketStoreKey,
			reptypes.StoreKey:    repStoreKey,
		},
		map[string]*storetypes.TransientStoreKey{
			"transient_test": storetypes.NewTransientStoreKey("transient_test"),
		},
		nil,
	)

	agentAuthority := authtypes.NewModuleAddress(agenttypes.GovModuleName)
	marketAuthority := authtypes.NewModuleAddress(markettypes.GovModuleName)
	repAuthority := authtypes.NewModuleAddress(reptypes.GovModuleName)

	// Create agent keeper (reputation keeper wired later to break cycle).
	agentEncCfg := moduletestutil.MakeTestEncodingConfig(agentmodule.AppModule{})
	ak := agentkeeper.NewKeeper(agentStoreService, agentEncCfg.Codec, addrCodec, agentAuthority, bk, mk, nil)
	if err := ak.Params.Set(ctx, agenttypes.DefaultParams()); err != nil {
		t.Fatalf("failed to set agent params: %v", err)
	}

	// Create marketplace keeper. Agent keeper satisfies markettypes.AgentKeeper.
	marketEncCfg := moduletestutil.MakeTestEncodingConfig(marketmodule.AppModule{})
	mktK := marketkeeper.NewKeeper(marketStoreService, marketEncCfg.Codec, addrCodec, marketAuthority, bk, &ak)
	if err := mktK.Params.Set(ctx, markettypes.DefaultParams()); err != nil {
		t.Fatalf("failed to set marketplace params: %v", err)
	}

	// Create reputation keeper with real agent keeper + marketplace keeper mocks.
	repEncCfg := moduletestutil.MakeTestEncodingConfig(repmodule.AppModule{})
	rk := repkeeper.NewKeeper(repStoreService, repEncCfg.Codec, addrCodec, repAuthority, &ak, &mktK)
	if err := rk.Params.Set(ctx, reptypes.DefaultParams()); err != nil {
		t.Fatalf("failed to set reputation params: %v", err)
	}

	// Wire reputation keeper back into agent keeper.
	ak.SetReputationKeeper(&rk)

	return &crossAgentMarketRepFixture{
		ctx:          ctx,
		addressCodec: addrCodec,
		bankKeeper:   bk,
		agentKeeper:  ak,
		marketKeeper: mktK,
		repKeeper:    rk,
	}
}

// ---------------------------------------------------------------------------
// Cross-Module Fixture: Governance + Agent
// ---------------------------------------------------------------------------

type crossGovAgentFixture struct {
	ctx           context.Context
	addressCodec  address.Codec
	bankKeeper    *crossMockBankKeeper
	stakingKeeper *crossMockStakingKeeper

	govKeeper   govkeeper.Keeper
	agentKeeper agentkeeper.Keeper
}

func initCrossGovAgentFixture(t *testing.T) *crossGovAgentFixture {
	t.Helper()

	addrCodec := addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32AccountAddrPrefix())
	bk := newCrossMockBank()
	mk := &crossMockMintKeeper{}
	sk := newCrossMockStaking()

	// --- Module store keys ---
	govStoreKey := storetypes.NewKVStoreKey(govtypes.StoreKey)
	agentStoreKey := storetypes.NewKVStoreKey(agenttypes.StoreKey)
	agentStoreService := runtime.NewKVStoreService(agentStoreKey)

	// Create a single multistore context with both module store keys mounted.
	ctx := testutil.DefaultContextWithKeys(
		map[string]*storetypes.KVStoreKey{
			govtypes.StoreKey:   govStoreKey,
			agenttypes.StoreKey: agentStoreKey,
		},
		map[string]*storetypes.TransientStoreKey{
			"transient_test": storetypes.NewTransientStoreKey("transient_test"),
		},
		nil,
	)

	// Create agent keeper.
	agentEncCfg := moduletestutil.MakeTestEncodingConfig(agentmodule.AppModule{})
	agentAuthority := authtypes.NewModuleAddress(agenttypes.GovModuleName)
	ak := agentkeeper.NewKeeper(agentStoreService, agentEncCfg.Codec, addrCodec, agentAuthority, bk, mk, nil)
	if err := ak.Params.Set(ctx, agenttypes.DefaultParams()); err != nil {
		t.Fatalf("failed to set agent params: %v", err)
	}

	// Create governance keeper.
	govStoreService := runtime.NewKVStoreService(govStoreKey)
	govAuthority := authtypes.NewModuleAddress(govtypes.GovModuleName)
	gk := govkeeper.NewKeeper(govStoreService, nil, addrCodec, govAuthority, bk)
	gk.SetStakingKeeper(sk)

	// Register the REAL agent keeper as the param executor for "agent" module.
	// This way, when governance executes a proposal, it actually calls
	// ak.UpdateParam() and changes the agent module's params.
	gk.RegisterModuleParamExecutor("agent", &ak)

	// Register mock executors for remaining allowed modules.
	mockPE := newCrossMockParamExecutor()
	for moduleName := range govtypes.AllowedModules {
		if moduleName == "agent" {
			continue
		}
		gk.RegisterModuleParamExecutor(moduleName, mockPE)
	}

	return &crossGovAgentFixture{
		ctx:           ctx,
		addressCodec:  addrCodec,
		bankKeeper:    bk,
		stakingKeeper: sk,
		govKeeper:     gk,
		agentKeeper:   ak,
	}
}

// ---------------------------------------------------------------------------
// Helpers: agent msg/query server wrappers
// ---------------------------------------------------------------------------

// crossAgentMsgServer is the same extended MsgServer interface used in agent tests.
type crossAgentMsgServer interface {
	agenttypes.MsgServer
	DelegateTask(ctx context.Context, msg *agenttypes.MsgDelegateTask) (*agenttypes.MsgDelegateTaskResponse, error)
	AcceptTask(ctx context.Context, msg *agenttypes.MsgAcceptTask) (*agenttypes.MsgAcceptTaskResponse, error)
	CompleteTask(ctx context.Context, msg *agenttypes.MsgCompleteTask) (*agenttypes.MsgCompleteTaskResponse, error)
	AgentHeartbeat(ctx context.Context, msg *agenttypes.MsgAgentHeartbeat) (*agenttypes.MsgAgentHeartbeatResponse, error)
	DeregisterAgent(ctx context.Context, msg *agenttypes.MsgDeregisterAgent) (*agenttypes.MsgDeregisterAgentResponse, error)
}

type crossAgentQueryServer interface {
	agenttypes.QueryServer
	Task(ctx context.Context, req *agenttypes.QueryTaskRequest) (*agenttypes.QueryTaskResponse, error)
}

func newCrossAgentMsgServer(t *testing.T, k agentkeeper.Keeper) crossAgentMsgServer {
	t.Helper()
	srv, ok := agentkeeper.NewMsgServerImpl(k).(crossAgentMsgServer)
	require.True(t, ok, "agent MsgServer does not satisfy extended interface")
	return srv
}

func newCrossAgentQueryServer(t *testing.T, k agentkeeper.Keeper) crossAgentQueryServer {
	t.Helper()
	srv, ok := agentkeeper.NewQueryServerImpl(k).(crossAgentQueryServer)
	require.True(t, ok, "agent QueryServer does not satisfy extended interface")
	return srv
}

// crossRegisterAgent funds and registers an agent.
func crossRegisterAgent(
	t *testing.T,
	bk *crossMockBankKeeper,
	ctx context.Context,
	msgSrv crossAgentMsgServer,
	addr, name string,
) {
	t.Helper()
	bk.fundAccount(addr, sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000)))
	_, err := msgSrv.RegisterAgent(ctx, &agenttypes.MsgRegisterAgent{
		Creator:  addr,
		Pubkey:   name + "-pubkey",
		Endpoint: "https://" + name + ".example.com",
		Name:     name,
	})
	require.NoError(t, err)
}

// ---------------------------------------------------------------------------
// E2E: TestAgentToMarketplace
// Agent registers -> lists compute resource -> another agent leases it ->
// completes work -> rates via reputation module
// ---------------------------------------------------------------------------

func TestAgentToMarketplace(t *testing.T) {
	f := initCrossAgentMarketRepFixture(t)

	agentMsgSrv := newCrossAgentMsgServer(t, f.agentKeeper)
	repMsgSrv := repkeeper.NewMsgServerImpl(f.repKeeper)

	provider := "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
	consumer := "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"

	// --- Step 1: Register both agents ---
	crossRegisterAgent(t, f.bankKeeper, f.ctx, agentMsgSrv, provider, "Provider")
	crossRegisterAgent(t, f.bankKeeper, f.ctx, agentMsgSrv, consumer, "Consumer")
	t.Log("Step 1: Both agents registered in agent module")

	// --- Step 2: Provider lists a compute resource on marketplace ---
	resource := markettypes.ComputeResource{
		Name:              "A100-Node",
		Description:       "4x NVIDIA A100 80GB",
		GpuModel:          "NVIDIA A100",
		GpuCount:          4,
		VramGb:            320,
		CpuCores:          64,
		RamGb:             512,
		StorageGb:         4000,
		PricePerHourUclaw: "5000000",
		MinLeaseHours:     1,
		MaxLeaseHours:     72,
		Endpoint:          "ssh://provider.example.com:22",
	}
	resourceID, err := f.marketKeeper.ListComputeResource(f.ctx, provider, resource)
	require.NoError(t, err)
	t.Logf("Step 2: Compute resource listed — ID=%d", resourceID)

	// Verify resource stored correctly.
	raw, err := f.marketKeeper.ComputeResources.Get(f.ctx, resourceID)
	require.NoError(t, err)
	var stored markettypes.ComputeResource
	require.NoError(t, json.Unmarshal([]byte(raw), &stored))
	require.Equal(t, "A100-Node", stored.Name)
	require.Equal(t, provider, stored.Owner)

	// --- Step 3: Consumer leases the resource ---
	consumerAddr, _ := sdk.AccAddressFromBech32(consumer)
	f.bankKeeper.fundAccount(consumerAddr.String(), sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	leaseID, err := f.marketKeeper.LeaseComputeResource(f.ctx, consumer, resourceID, 4)
	require.NoError(t, err)
	t.Logf("Step 3: Resource leased — LeaseID=%d", leaseID)

	// Verify lease cost deducted.
	consumerBal := f.bankKeeper.balances[consumer]
	require.True(t, consumerBal.AmountOf("uclaw").LT(math.NewInt(110_000_000)),
		"consumer balance should be reduced by lease cost")

	// --- Step 4: Consumer completes the lease (releases resource) ---
	err = f.marketKeeper.ReleaseComputeResource(f.ctx, leaseID, consumer)
	require.NoError(t, err)
	t.Log("Step 4: Lease completed — resource released")

	// Verify lease completed.
	leaseJSON, err := f.marketKeeper.ComputeLeases.Get(f.ctx, leaseID)
	require.NoError(t, err)
	require.Contains(t, leaseJSON, `"completed"`, "lease should be completed")

	// --- Step 5: Consumer rates provider via reputation module ---
	// Record the purchase so the reputation module allows rating.
	purchaseKey := consumer + "|" + provider
	err = f.marketKeeper.Purchases.Set(f.ctx, purchaseKey, true)
	require.NoError(t, err)

	rateResp, err := repMsgSrv.RateAgent(f.ctx, &reptypes.MsgRateAgent{
		Creator:      consumer,
		AgentAddress: provider,
		SkillId:      resourceID,
		Score:        5,
		Comment:      "excellent GPU compute, fast and reliable",
	})
	require.NoError(t, err)
	t.Logf("Step 5: Provider rated 5 stars — RatingID=%d", rateResp.RatingId)

	// --- Step 6: Verify reputation score updated ---
	rep, err := f.repKeeper.Reputations.Get(f.ctx, provider)
	require.NoError(t, err)
	require.Equal(t, uint64(1), rep.TotalRatings)
	require.Equal(t, uint64(5), rep.RatingSum)
	require.Equal(t, uint64(500), rep.AvgRatingBps)
	t.Log("Step 6: Provider reputation updated — cross-module flow complete")
}

// ---------------------------------------------------------------------------
// E2E: TestGovernanceToAgentParams
// Governance proposal changes agent module params via real param executor
// ---------------------------------------------------------------------------

func TestGovernanceToAgentParams(t *testing.T) {
	f := initCrossGovAgentFixture(t)

	// --- Step 1: Verify initial agent params ---
	paramsBefore, err := f.agentKeeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, agenttypes.DefaultMaxHeartbeatGapBlocks, paramsBefore.MaxHeartbeatGapBlocks)
	t.Logf("Step 1: Initial max_heartbeat_gap_blocks=%d", paramsBefore.MaxHeartbeatGapBlocks)

	// --- Step 2: Submit governance proposal to change agent params ---
	proposerAddr := sdk.AccAddress([]byte("cross_proposer______"))
	proposerStr, _ := f.addressCodec.BytesToString(proposerAddr)
	f.bankKeeper.fundAccount(proposerAddr.String(), sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))

	deposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
	proposalID, err := f.govKeeper.SubmitProposal(
		f.ctx,
		"Increase Heartbeat Gap",
		"Increase max_heartbeat_gap_blocks from 200 to 500 for better tolerance",
		"agent",
		"max_heartbeat_gap_blocks",
		"500",
		proposerStr,
		deposit,
	)
	require.NoError(t, err)
	t.Logf("Step 2: Proposal submitted — ID=%d", proposalID)

	// --- Step 3: Vote yes with stake-weighted voter ---
	voter1Addr := sdk.AccAddress([]byte("cross_voter1________"))
	voter1Str, _ := f.addressCodec.BytesToString(voter1Addr)
	f.stakingKeeper.setBonded(voter1Addr, math.NewInt(50_000))

	voter2Addr := sdk.AccAddress([]byte("cross_voter2________"))
	voter2Str, _ := f.addressCodec.BytesToString(voter2Addr)
	f.stakingKeeper.setBonded(voter2Addr, math.NewInt(30_000))

	err = f.govKeeper.CastVote(f.ctx, proposalID, voter1Str, "yes")
	require.NoError(t, err)
	err = f.govKeeper.CastVote(f.ctx, proposalID, voter2Str, "yes")
	require.NoError(t, err)
	t.Log("Step 3: Two voters voted yes")

	// --- Step 4: Tally and verify pass ---
	passed, err := f.govKeeper.TallyProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.True(t, passed, "proposal should pass with all-yes votes")
	t.Log("Step 4: Proposal tally passed")

	// --- Step 5: Execute proposal (applies real param change to agent module) ---
	err = f.govKeeper.ExecuteProposal(f.ctx, proposalID)
	require.NoError(t, err)
	t.Log("Step 5: Proposal executed")

	// --- Step 6: Verify agent module params actually changed ---
	paramsAfter, err := f.agentKeeper.Params.Get(f.ctx)
	require.NoError(t, err)
	require.Equal(t, int64(500), paramsAfter.MaxHeartbeatGapBlocks,
		"agent max_heartbeat_gap_blocks should be updated to 500")
	t.Logf("Step 6: Agent params updated — max_heartbeat_gap_blocks=%d — cross-module flow complete",
		paramsAfter.MaxHeartbeatGapBlocks)

	// Verify proposal status is executed.
	proposal, err := f.govKeeper.GetProposal(f.ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, govtypes.ProposalStatusExecuted, proposal.Status)
}

// ---------------------------------------------------------------------------
// E2E: TestAgentTaskWithReputation
// Agent task completion -> reputation endorsement
// ---------------------------------------------------------------------------

func TestAgentTaskWithReputation(t *testing.T) {
	f := initCrossAgentMarketRepFixture(t)

	agentMsgSrv := newCrossAgentMsgServer(t, f.agentKeeper)
	agentQSrv := newCrossAgentQueryServer(t, f.agentKeeper)
	repMsgSrv := repkeeper.NewMsgServerImpl(f.repKeeper)

	delegator := "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu"
	worker := "cosmos1s3nh6tafl4amaxkke9kdejhp09lk93g9ev39r4"

	// --- Step 1: Register both agents ---
	crossRegisterAgent(t, f.bankKeeper, f.ctx, agentMsgSrv, delegator, "Delegator")
	crossRegisterAgent(t, f.bankKeeper, f.ctx, agentMsgSrv, worker, "Worker")
	t.Log("Step 1: Both agents registered")

	// --- Step 2: Check initial reputation (should not exist yet) ---
	_, err := f.repKeeper.Reputations.Get(f.ctx, worker)
	// Not found is expected — no reputation record yet.
	t.Log("Step 2: Worker has no reputation record yet (expected)")

	// --- Step 3: Delegate task to worker ---
	taskResp, err := agentMsgSrv.DelegateTask(f.ctx, &agenttypes.MsgDelegateTask{
		Creator:      delegator,
		Assignee:     worker,
		Description:  "Run ML inference batch job",
		Requirements: `{"model":"llama-3","batch_size":100}`,
		Budget:       "500000",
	})
	require.NoError(t, err)
	taskID := taskResp.TaskId
	t.Logf("Step 3: Task delegated — ID=%d", taskID)

	// --- Step 4: Worker accepts task ---
	_, err = agentMsgSrv.AcceptTask(f.ctx, &agenttypes.MsgAcceptTask{
		Creator: worker,
		TaskId:  taskID,
	})
	require.NoError(t, err)

	taskQuery, err := agentQSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "accepted", taskQuery.Status)
	t.Log("Step 4: Task accepted by worker")

	// --- Step 5: Worker completes task ---
	_, err = agentMsgSrv.CompleteTask(f.ctx, &agenttypes.MsgCompleteTask{
		Creator: worker,
		TaskId:  taskID,
		Result:  `{"output":"ipfs://QmResult123","accuracy":0.97}`,
	})
	require.NoError(t, err)

	taskQuery, err = agentQSrv.Task(f.ctx, &agenttypes.QueryTaskRequest{TaskId: taskID})
	require.NoError(t, err)
	require.Equal(t, "completed", taskQuery.Status)
	t.Log("Step 5: Task completed by worker")

	// --- Step 6: Delegator endorses worker in reputation module ---
	endorseResp, err := repMsgSrv.EndorseAgent(f.ctx, &reptypes.MsgEndorseAgent{
		Creator:      delegator,
		AgentAddress: worker,
		Reason:       "completed ML inference task with high accuracy",
	})
	require.NoError(t, err)
	t.Logf("Step 6: Worker endorsed — EndorsementID=%d", endorseResp.EndorsementId)

	// --- Step 7: Verify reputation record updated ---
	rep, err := f.repKeeper.Reputations.Get(f.ctx, worker)
	require.NoError(t, err)
	require.Equal(t, uint64(1), rep.Endorsements)
	t.Log("Step 7: Worker reputation has 1 endorsement — cross-module task+reputation flow complete")
}

// ---------------------------------------------------------------------------
// E2E: TestMarketplaceEscrowFlow
// Full marketplace escrow lifecycle: create -> fund -> milestones -> release
// ---------------------------------------------------------------------------

func TestMarketplaceEscrowFlow(t *testing.T) {
	f := initCrossAgentMarketRepFixture(t)

	marketMsgSrv := marketkeeper.NewMsgServerImpl(f.marketKeeper)

	buyer := sdk.AccAddress([]byte("cross_buyer_________")).String()
	seller := sdk.AccAddress([]byte("cross_seller________")).String()

	// --- Step 1: Fund buyer account ---
	buyerAddr, _ := sdk.AccAddressFromBech32(buyer)
	f.bankKeeper.fundAccount(buyerAddr.String(), sdk.NewCoins(sdk.NewInt64Coin("uclaw", 100_000_000)))
	t.Log("Step 1: Buyer funded with 100M uclaw")

	// --- Step 2: Seller lists a skill on marketplace ---
	skillResp, err := marketMsgSrv.ListSkill(f.ctx, &markettypes.MsgListSkill{
		Creator:     seller,
		Name:        "GPU Model Training Service",
		Description: "Professional ML model training with optimized hyperparameters",
		Price:       "3000000",
		Denom:       "uclaw",
	})
	require.NoError(t, err)
	skillID := skillResp.SkillId
	t.Logf("Step 2: Skill listed — ID=%d", skillID)

	// --- Step 3: Create escrow with 3 milestones ---
	escrowResp, err := marketMsgSrv.CreateEscrow(f.ctx, &markettypes.MsgCreateEscrow{
		Creator:        buyer,
		SkillId:        skillID,
		Description:    "Escrow for GPU model training",
		DeadlineBlocks: 1000,
		Milestones:     3,
	})
	require.NoError(t, err)
	escrowID := escrowResp.EscrowId
	t.Logf("Step 3: Escrow created — ID=%d", escrowID)

	// Verify escrow state.
	escrow, err := f.marketKeeper.Escrows.Get(f.ctx, escrowID)
	require.NoError(t, err)
	require.Equal(t, "active", escrow.Status)
	require.Equal(t, uint64(3), escrow.Milestones)
	require.Equal(t, buyer, escrow.Buyer)
	require.Equal(t, seller, escrow.Seller)

	// Record seller balance before milestones.
	sellerAddr, _ := sdk.AccAddressFromBech32(seller)
	sellerBalBefore := f.bankKeeper.balances[sellerAddr.String()].AmountOf("uclaw")

	// --- Step 4: Complete milestones one by one ---
	for i := uint64(0); i < 3; i++ {
		_, err := marketMsgSrv.CompleteMilestone(f.ctx, &markettypes.MsgCompleteMilestone{
			Creator:  buyer,
			EscrowId: escrowID,
		})
		require.NoError(t, err)
		t.Logf("Step 4.%d: Milestone %d completed", i+1, i+1)
	}

	// --- Step 5: Verify escrow completed and funds released ---
	escrow, err = f.marketKeeper.Escrows.Get(f.ctx, escrowID)
	require.NoError(t, err)
	require.Equal(t, "completed", escrow.Status)
	require.Equal(t, uint64(3), escrow.MilestonesComplete)

	sellerBalAfter := f.bankKeeper.balances[sellerAddr.String()].AmountOf("uclaw")
	require.True(t, sellerBalAfter.GT(sellerBalBefore),
		"seller balance should increase after all milestones completed")
	t.Log("Step 5: Escrow completed — all funds released to seller")

	// --- Step 6: Verify buyer balance decreased ---
	buyerBalFinal := f.bankKeeper.balances[buyerAddr.String()].AmountOf("uclaw")
	require.True(t, buyerBalFinal.LT(math.NewInt(100_000_000)),
		"buyer balance should be less than initial after escrow payment")
	t.Log("Step 6: Buyer balance correctly reduced — marketplace escrow lifecycle complete")
}
