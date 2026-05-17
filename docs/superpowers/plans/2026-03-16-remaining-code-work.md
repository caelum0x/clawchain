# ClawChain Remaining Code Work — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

## Status Amendment — 2026-05-17

This plan is historical and should not be used as the active task board. The PRD now records the governance, IBC, oracle, GPU, mobile wallet, Paradigm tooling, OpenClaw/Claw Agent hardening, and validation phases as complete or superseded. Use `prd.md` and current code inspection before implementing follow-on work.

Known supersession: the oracle plan below sketches a new module and `/clawchain/oracle/v1/` endpoints, but the current implementation follows the Terra Classic oracle fork and `/clawchain/oracle/v1beta1/` client surface. Repository packaging also changed after this plan: dependencies and protocol forks are vendored as normal directories instead of submodules.

**Goal:** Close all code gaps to reach full feature completeness — governance, IBC, oracle, GPU E2E, mobile wallet, and Paradigm tool verification.

**Architecture:** 7 vertical slices executed in parallel where possible. Phases 1-4 (Governance, Oracle, IBC, GPU) have no shared state and run concurrently. Phase 5 (cross-cutting proto regen + CI) merges after 1-3. Phase 6 (mobile wallet) needs SDK methods from 1-3. Phase 7 (Paradigm tools) needs chain + seed data.

**Tech Stack:** Go 1.24 (Cosmos SDK v0.53.6), TypeScript/Node.js 22+, protobuf/buf, React, Expo/React Native, Commander.js, Vitest, Go testing

**Spec:** `docs/superpowers/specs/2026-03-16-remaining-code-work-design.md`

---

## CRITICAL ERRATA — Read Before Implementing

These corrections apply throughout the entire plan. An implementing agent MUST apply them.

### E1: Go Module Import Path
The Go module is `clawchain` (not `github.com/anthropic/clawchain`). Replace ALL occurrences of `github.com/anthropic/clawchain/x/` with `clawchain/x/` in Go imports.

### E2: Governance Test Setup Pattern
The plan references `setupGovernanceKeeper(t)` and `testProposer`, `testVoter1`, etc. These DO NOT EXIST. Use the existing `initFixture(t)` pattern from `x/governance/keeper/keeper_test.go`:

```go
f := initFixture(t)
k := f.keeper
ctx := f.ctx

// Address pattern:
proposer := sdk.AccAddress([]byte("proposer1___________"))
voter1 := sdk.AccAddress([]byte("voter1______________"))
voter2 := sdk.AccAddress([]byte("voter2______________"))
voter3 := sdk.AccAddress([]byte("voter3______________"))
voter4 := sdk.AccAddress([]byte("voter4______________"))

// Fund accounts via mock bank keeper before submitting proposals
```

Replace every `k, ctx := setupGovernanceKeeper(t)` with the pattern above.

### E3: SubmitProposal Deposit Type
`SubmitProposal` takes `deposit sdk.Coins`, not a string. Replace all `"10000000uclaw"` deposit arguments with:
```go
sdk.NewCoins(sdk.NewInt64Coin("uclaw", 10_000_000))
```

### E4: Proposal Vote Fields Are `math.Int`, Not Strings
`YesVotes`, `NoVotes`, `AbstainVotes` are `cosmossdk.io/math.Int` fields (not strings). The new `VetoVotes` field must also be `math.Int`. In proto, use the same annotations:
```protobuf
string veto_votes = 15 [(cosmos_proto.scalar) = "cosmos.Int", (gogoproto.customtype) = "cosmossdk.io/math.Int", (gogoproto.nullable) = false];
```
In Go tests, compare with `proposal.VetoVotes.Equal(math.NewInt(1))`, not `require.Equal(t, "1", ...)`.

In the `TallyProposal` replacement, use `proposal.YesVotes`, `proposal.NoVotes`, `proposal.VetoVotes` directly as `math.Int` (no string parsing needed).

### E5: Vote Option Validation Uses `ValidateVoteOption`
`CastVote` validates via `types.ValidateVoteOption(option)` (a switch statement in `types/proposal.go` line 121-129), NOT an inline if-check. To add `no_with_veto`:

1. Add `VoteOptionNoWithVeto` to the switch case in `ValidateVoteOption`
2. Add the `VetoVotes` tally case in the switch in `CastVote` (around line 243)

### E6: Oracle Test Setup
Oracle is a new module — create `x/oracle/keeper/oracle_test_helpers_test.go` BEFORE writing any tests. It must provide `setupOracleKeeper(t)` returning `(Keeper, context.Context)`, mock staking/bank keepers, and test constants (`testValidator`, `testValidator2`, `testValidator3`, `testFeeder`). Follow the same pattern as governance's `initFixture`.

### E7: Oracle Proto go_package
All oracle proto files must use `option go_package = "clawchain/x/oracle/types";` (matching the governance pattern), NOT `github.com/anthropic/clawchain/...`.

### E8: Proto Generation Required for Oracle
Oracle types (`OracleParams`, `ExchangeRate`, etc.) are defined in proto. Either run `buf generate` or manually create all Go struct definitions in `x/oracle/types/` with matching field names and types. The plan's `params.go` referencing `OracleParams{}` will not compile without this.

### E9: Use `math.LegacyDec` Not `sdk.Dec`
In Cosmos SDK v0.53.6, `sdk.Dec` is removed. Use `cosmossdk.io/math.LegacyDec` instead.

### E10: SetProposal Is Unexported
The keeper has `setProposal` (lowercase). Tests in `package keeper_test` cannot call it. Either export it by renaming to `SetProposal`, or use the EndBlocker/other public methods to manipulate proposal state in tests.

---

## Chunk 1: Governance Completion

### Task 1.1: Add `no_with_veto` Vote Option to Proto + Types

**Files:**
- Modify: `proto/clawchain/governance/v1/types.proto`
- Modify: `x/governance/types/proposal.go`
- Modify: `x/governance/types/genesis.pb.go` (regenerated)

- [ ] **Step 1: Add VetoVotes field to Proposal proto**

In `proto/clawchain/governance/v1/types.proto`, add field 15 to Proposal message:

```protobuf
message Proposal {
  // ... existing fields 1-14 ...
  string veto_votes = 15;  // cosmossdk.io/math.Int
}
```

- [ ] **Step 2: Add vote option constant**

In `x/governance/types/proposal.go`, after line 19 (`VoteOptionAbstain`), add:

```go
VoteOptionNoWithVeto = "no_with_veto"
```

- [ ] **Step 3: Add veto threshold default**

In `x/governance/types/proposal.go`, after `DefaultThresholdBps` (line 32), add:

```go
DefaultVetoThresholdBps = 3340 // 33.4%
```

- [ ] **Step 4: Regenerate proto**

Run: `cd /Users/arhansubasi/new-blokchain && buf generate proto/clawchain/governance/v1/`

If `buf` is not available: manually add `VetoVotes string` field to the Proposal struct in `x/governance/types/genesis.pb.go`.

- [ ] **Step 5: Commit**

```bash
git add proto/clawchain/governance/v1/types.proto x/governance/types/proposal.go x/governance/types/genesis.pb.go
git commit -m "feat(governance): add no_with_veto vote option and veto threshold"
```

### Task 1.2: Update CastVote to Accept Veto + Update Tally Logic

**Files:**
- Modify: `x/governance/keeper/keeper.go`
- Test: `x/governance/keeper/governance_veto_test.go` (create)

- [ ] **Step 1: Write failing test for veto vote**

Create `x/governance/keeper/governance_veto_test.go`:

```go
package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/anthropic/clawchain/x/governance/types"
)

func TestCastVetoVote(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	// Submit a proposal
	proposalID, err := k.SubmitProposal(ctx, "Test", "Desc", "agent", "max_heartbeat_gap_blocks", "200", testProposer, "10000000uclaw")
	require.NoError(t, err)

	// Cast a no_with_veto vote
	err = k.CastVote(ctx, proposalID, testVoter1, types.VoteOptionNoWithVeto)
	require.NoError(t, err)

	// Verify proposal has veto votes
	proposal, err := k.GetProposal(ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, "1", proposal.VetoVotes)
}

func TestTallyWithVetoBlocks(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	proposalID, err := k.SubmitProposal(ctx, "Test", "Desc", "agent", "max_heartbeat_gap_blocks", "200", testProposer, "10000000uclaw")
	require.NoError(t, err)

	// Cast 2 yes votes and 2 veto votes (>33.4% veto)
	err = k.CastVote(ctx, proposalID, testVoter1, types.VoteOptionYes)
	require.NoError(t, err)
	err = k.CastVote(ctx, proposalID, testVoter2, types.VoteOptionYes)
	require.NoError(t, err)
	err = k.CastVote(ctx, proposalID, testVoter3, types.VoteOptionNoWithVeto)
	require.NoError(t, err)
	err = k.CastVote(ctx, proposalID, testVoter4, types.VoteOptionNoWithVeto)
	require.NoError(t, err)

	// Tally should fail due to veto
	passed, err := k.TallyProposal(ctx, proposalID)
	require.NoError(t, err)
	require.False(t, passed, "proposal should be vetoed when >33.4% vote no_with_veto")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/keeper/ -run TestCastVetoVote -v`
Expected: FAIL — `VoteOptionNoWithVeto` not accepted by `CastVote`

- [ ] **Step 3: Update CastVote to accept no_with_veto**

In `x/governance/keeper/keeper.go`, find the vote option validation in `CastVote` (around line 190). Change:

```go
if option != types.VoteOptionYes && option != types.VoteOptionNo && option != types.VoteOptionAbstain {
```
to:
```go
if option != types.VoteOptionYes && option != types.VoteOptionNo && option != types.VoteOptionAbstain && option != types.VoteOptionNoWithVeto {
```

Then in the tally update section of `CastVote` (around line 215), add a case for veto:

```go
case types.VoteOptionNoWithVeto:
    vetoVotes := math.NewIntFromBigInt(new(big.Int))
    if proposal.VetoVotes != "" {
        vetoVotes, _ = math.NewIntFromString(proposal.VetoVotes)
    }
    proposal.VetoVotes = vetoVotes.Add(voteWeight).String()
```

- [ ] **Step 4: Update TallyProposal to check veto threshold**

In `x/governance/keeper/keeper.go`, in `TallyProposal` (around line 272), add veto check before the yes/no comparison:

```go
func (k Keeper) TallyProposal(ctx context.Context, proposalID uint64) (bool, error) {
    proposal, err := k.GetProposal(ctx, proposalID)
    if err != nil {
        return false, err
    }

    yesVotes, _ := math.NewIntFromString(proposal.YesVotes)
    noVotes, _ := math.NewIntFromString(proposal.NoVotes)
    vetoVotes := math.ZeroInt()
    if proposal.VetoVotes != "" {
        vetoVotes, _ = math.NewIntFromString(proposal.VetoVotes)
    }

    totalVotes := yesVotes.Add(noVotes).Add(vetoVotes)
    if totalVotes.IsZero() {
        return false, nil
    }

    // Check veto threshold: >33.4% veto blocks the proposal
    vetoThresholdBps := math.NewInt(int64(types.DefaultVetoThresholdBps))
    if vetoVotes.Mul(math.NewInt(10000)).GT(totalVotes.Mul(vetoThresholdBps)) {
        return false, nil
    }

    // Standard threshold: yes > 50% of (yes + no + veto)
    return yesVotes.Mul(math.NewInt(10000)).GT(totalVotes.Mul(math.NewInt(int64(types.DefaultThresholdBps)))), nil
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/keeper/ -run "TestCastVetoVote|TestTallyWithVetoBlocks" -v`
Expected: PASS

- [ ] **Step 6: Run all existing governance tests to verify no regressions**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/... -v`
Expected: All existing tests PASS

- [ ] **Step 7: Commit**

```bash
git add x/governance/keeper/keeper.go x/governance/keeper/governance_veto_test.go
git commit -m "feat(governance): implement no_with_veto vote option with 33.4% threshold"
```

### Task 1.3: Add MsgCancelProposal

**Files:**
- Modify: `proto/clawchain/governance/v1/tx.proto`
- Modify: `x/governance/keeper/keeper.go`
- Modify: `x/governance/keeper/msg_server.go`
- Modify: `x/governance/types/errors.go`
- Test: `x/governance/keeper/governance_cancel_test.go` (create)

- [ ] **Step 1: Add error code**

In `x/governance/types/errors.go`, add after `ErrExecutionFailed` (code 1410):

```go
ErrUnauthorizedCancel = errorsmod.Register(ModuleName, 1411, "only proposer can cancel")
ErrProposalNotCancellable = errorsmod.Register(ModuleName, 1412, "proposal cannot be cancelled in current status")
```

- [ ] **Step 2: Add proto rpc**

In `proto/clawchain/governance/v1/tx.proto`, add to the `Msg` service:

```protobuf
rpc CancelProposal(MsgCancelProposal) returns (MsgCancelProposalResponse);
```

And add the message types:

```protobuf
message MsgCancelProposal {
  string proposer = 1;
  uint64 proposal_id = 2;
}

message MsgCancelProposalResponse {}
```

- [ ] **Step 3: Regenerate proto or manually add types**

If buf available: `buf generate proto/clawchain/governance/v1/`

Otherwise manually add to `x/governance/types/tx.pb.go`:

```go
type MsgCancelProposal struct {
    Proposer   string `protobuf:"bytes,1,opt,name=proposer,proto3" json:"proposer,omitempty"`
    ProposalId uint64 `protobuf:"varint,2,opt,name=proposal_id,json=proposalId,proto3" json:"proposal_id,omitempty"`
}

type MsgCancelProposalResponse struct{}
```

- [ ] **Step 4: Write failing test**

Create `x/governance/keeper/governance_cancel_test.go`:

```go
package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/anthropic/clawchain/x/governance/types"
)

func TestCancelProposal(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	proposalID, err := k.SubmitProposal(ctx, "Test", "Desc", "agent", "max_heartbeat_gap_blocks", "200", testProposer, "10000000uclaw")
	require.NoError(t, err)

	// Cancel by proposer should succeed
	err = k.CancelProposal(ctx, proposalID, testProposer)
	require.NoError(t, err)

	// Verify status is cancelled
	proposal, err := k.GetProposal(ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, "cancelled", proposal.Status)
}

func TestCancelProposalUnauthorized(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	proposalID, err := k.SubmitProposal(ctx, "Test", "Desc", "agent", "max_heartbeat_gap_blocks", "200", testProposer, "10000000uclaw")
	require.NoError(t, err)

	// Cancel by non-proposer should fail
	err = k.CancelProposal(ctx, proposalID, testVoter1)
	require.ErrorIs(t, err, types.ErrUnauthorizedCancel)
}

func TestCancelExecutedProposal(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	proposalID, err := k.SubmitProposal(ctx, "Test", "Desc", "agent", "max_heartbeat_gap_blocks", "200", testProposer, "10000000uclaw")
	require.NoError(t, err)

	// Vote and execute
	_ = k.CastVote(ctx, proposalID, testVoter1, types.VoteOptionYes)
	proposal, _ := k.GetProposal(ctx, proposalID)
	proposal.Status = types.ProposalStatusExecuted
	_ = k.SetProposal(ctx, proposal)

	// Cancel executed proposal should fail
	err = k.CancelProposal(ctx, proposalID, testProposer)
	require.ErrorIs(t, err, types.ErrProposalNotCancellable)
}
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/keeper/ -run TestCancelProposal -v`
Expected: FAIL — `CancelProposal` method not found

- [ ] **Step 6: Implement CancelProposal keeper method**

In `x/governance/keeper/keeper.go`, add after `RejectProposal`:

```go
func (k Keeper) CancelProposal(ctx context.Context, proposalID uint64, canceller string) error {
    proposal, err := k.GetProposal(ctx, proposalID)
    if err != nil {
        return err
    }

    if proposal.Proposer != canceller {
        return types.ErrUnauthorizedCancel
    }

    if proposal.Status != types.ProposalStatusVoting {
        return types.ErrProposalNotCancellable
    }

    proposal.Status = "cancelled"

    // Refund deposit
    deposit, err := sdk.ParseCoinsNormalized(proposal.Deposit)
    if err == nil && !deposit.IsZero() {
        proposerAddr, err := k.addressCodec.StringToBytes(proposal.Proposer)
        if err == nil {
            _ = k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, proposerAddr, deposit)
        }
    }

    return k.SetProposal(ctx, proposal)
}
```

- [ ] **Step 7: Add SetProposal helper if it doesn't exist**

Check if `SetProposal` exists on the keeper. If not, add:

```go
func (k Keeper) SetProposal(ctx context.Context, proposal *types.Proposal) error {
    proposalJSON, err := json.Marshal(proposal)
    if err != nil {
        return err
    }
    return k.Proposals.Set(ctx, proposal.ProposalId, string(proposalJSON))
}
```

- [ ] **Step 8: Add message handler**

In `x/governance/keeper/msg_server.go`, add:

```go
func (k Keeper) HandleMsgCancelProposal(ctx context.Context, msg *types.MsgCancelProposal) error {
    return k.CancelProposal(ctx, msg.ProposalId, msg.Proposer)
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/keeper/ -run "TestCancelProposal" -v`
Expected: All 3 tests PASS

- [ ] **Step 10: Run all governance tests**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/... -v`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
git add x/governance/ proto/clawchain/governance/v1/tx.proto
git commit -m "feat(governance): add MsgCancelProposal with proposer-only authorization"
```

### Task 1.4: Add QueryTallyResult and QueryVoterVotes

**Files:**
- Modify: `proto/clawchain/governance/v1/query.proto`
- Modify: `x/governance/keeper/keeper.go`
- Create: `x/governance/keeper/query_tally.go`
- Create: `x/governance/keeper/query_voter_votes.go`
- Test: `x/governance/keeper/governance_query_test.go` (create)

- [ ] **Step 1: Add proto queries**

In `proto/clawchain/governance/v1/query.proto`, add to the `Query` service:

```protobuf
rpc TallyResult(QueryTallyResultRequest) returns (QueryTallyResultResponse) {
    option (google.api.http).get = "/clawchain/governance/v1/proposal/{proposal_id}/tally";
}

rpc VoterVotes(QueryVoterVotesRequest) returns (QueryVoterVotesResponse) {
    option (google.api.http).get = "/clawchain/governance/v1/voter/{voter}/votes";
}
```

And the message types:

```protobuf
message QueryTallyResultRequest {
  uint64 proposal_id = 1;
}

message QueryTallyResultResponse {
  string yes_votes = 1;
  string no_votes = 2;
  string abstain_votes = 3;
  string veto_votes = 4;
  string total_votes = 5;
  string yes_percentage = 6;
  string no_percentage = 7;
  string abstain_percentage = 8;
  string veto_percentage = 9;
}

message QueryVoterVotesRequest {
  string voter = 1;
}

message QueryVoterVotesResponse {
  repeated VoterVoteEntry votes = 1;
}

message VoterVoteEntry {
  uint64 proposal_id = 1;
  string option = 2;
  string weight = 3;
  string proposal_title = 4;
  string proposal_status = 5;
}
```

- [ ] **Step 2: Write failing test**

Create `x/governance/keeper/governance_query_test.go`:

```go
package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/anthropic/clawchain/x/governance/types"
)

func TestQueryTallyResult(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	proposalID, _ := k.SubmitProposal(ctx, "Test", "Desc", "agent", "max_heartbeat_gap_blocks", "200", testProposer, "10000000uclaw")
	_ = k.CastVote(ctx, proposalID, testVoter1, types.VoteOptionYes)
	_ = k.CastVote(ctx, proposalID, testVoter2, types.VoteOptionNo)

	tally, err := k.QueryTallyResult(ctx, proposalID)
	require.NoError(t, err)
	require.Equal(t, "1", tally.YesVotes)
	require.Equal(t, "1", tally.NoVotes)
	require.Equal(t, "2", tally.TotalVotes)
}

func TestQueryVoterVotes(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	p1, _ := k.SubmitProposal(ctx, "Test1", "Desc", "agent", "max_heartbeat_gap_blocks", "200", testProposer, "10000000uclaw")
	p2, _ := k.SubmitProposal(ctx, "Test2", "Desc", "privacy", "max_privacy_tx_per_block", "100", testProposer, "10000000uclaw")
	_ = k.CastVote(ctx, p1, testVoter1, types.VoteOptionYes)
	_ = k.CastVote(ctx, p2, testVoter1, types.VoteOptionNo)

	votes, err := k.QueryVoterVotes(ctx, testVoter1)
	require.NoError(t, err)
	require.Len(t, votes, 2)
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/keeper/ -run "TestQueryTallyResult|TestQueryVoterVotes" -v`
Expected: FAIL

- [ ] **Step 4: Implement QueryTallyResult**

Create `x/governance/keeper/query_tally.go`:

```go
package keeper

import (
	"context"
	"fmt"

	"cosmossdk.io/math"
)

type TallyResult struct {
	YesVotes         string
	NoVotes          string
	AbstainVotes     string
	VetoVotes        string
	TotalVotes       string
	YesPercentage    string
	NoPercentage     string
	AbstainPercentage string
	VetoPercentage   string
}

func (k Keeper) QueryTallyResult(ctx context.Context, proposalID uint64) (*TallyResult, error) {
	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}

	yes, _ := math.NewIntFromString(proposal.YesVotes)
	no, _ := math.NewIntFromString(proposal.NoVotes)
	abstain, _ := math.NewIntFromString(proposal.AbstainVotes)
	veto := math.ZeroInt()
	if proposal.VetoVotes != "" {
		veto, _ = math.NewIntFromString(proposal.VetoVotes)
	}

	total := yes.Add(no).Add(abstain).Add(veto)

	pct := func(v math.Int) string {
		if total.IsZero() {
			return "0.00"
		}
		return fmt.Sprintf("%.2f", float64(v.Int64())*100.0/float64(total.Int64()))
	}

	return &TallyResult{
		YesVotes:          yes.String(),
		NoVotes:           no.String(),
		AbstainVotes:      abstain.String(),
		VetoVotes:         veto.String(),
		TotalVotes:        total.String(),
		YesPercentage:     pct(yes),
		NoPercentage:      pct(no),
		AbstainPercentage: pct(abstain),
		VetoPercentage:    pct(veto),
	}, nil
}
```

- [ ] **Step 5: Implement QueryVoterVotes**

Create `x/governance/keeper/query_voter_votes.go`:

```go
package keeper

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/anthropic/clawchain/x/governance/types"
)

type VoterVoteEntry struct {
	ProposalID     uint64 `json:"proposal_id"`
	Option         string `json:"option"`
	Weight         string `json:"weight"`
	ProposalTitle  string `json:"proposal_title"`
	ProposalStatus string `json:"proposal_status"`
}

func (k Keeper) QueryVoterVotes(ctx context.Context, voter string) ([]VoterVoteEntry, error) {
	var entries []VoterVoteEntry

	err := k.Votes.Walk(ctx, nil, func(key string, value string) (bool, error) {
		// Key format: "proposalId:voter"
		parts := strings.SplitN(key, ":", 2)
		if len(parts) != 2 || parts[1] != voter {
			return false, nil
		}

		var vote types.Vote
		if err := json.Unmarshal([]byte(value), &vote); err != nil {
			return false, nil
		}

		// Get proposal for title and status
		proposal, err := k.GetProposal(ctx, vote.ProposalId)
		title := ""
		status := ""
		if err == nil {
			title = proposal.Title
			status = proposal.Status
		}

		entries = append(entries, VoterVoteEntry{
			ProposalID:     vote.ProposalId,
			Option:         vote.Option,
			Weight:         vote.Weight,
			ProposalTitle:  title,
			ProposalStatus: status,
		})
		return false, nil
	})

	if err != nil {
		return nil, err
	}
	return entries, nil
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/keeper/ -run "TestQueryTallyResult|TestQueryVoterVotes" -v`
Expected: PASS

- [ ] **Step 7: Run all governance tests**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/... -v`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add x/governance/keeper/query_tally.go x/governance/keeper/query_voter_votes.go x/governance/keeper/governance_query_test.go proto/clawchain/governance/v1/query.proto
git commit -m "feat(governance): add QueryTallyResult and QueryVoterVotes queries"
```

### Task 1.5: Verify ParamExecutor Coverage + Add Tests

**Files:**
- Test: `x/governance/keeper/governance_param_executor_test.go` (create)

- [ ] **Step 1: Write test for each module's ParamExecutor**

Create `x/governance/keeper/governance_param_executor_test.go`:

```go
package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParamExecutorMarketplace(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	proposalID, err := k.SubmitProposal(ctx, "Change marketplace param", "Update max skills", "marketplace", "max_skills_per_agent", "50", testProposer, "10000000uclaw")
	require.NoError(t, err)

	// Vote yes
	err = k.CastVote(ctx, proposalID, testVoter1, "yes")
	require.NoError(t, err)

	// Execute
	err = k.ExecuteProposal(ctx, proposalID)
	require.NoError(t, err)

	proposal, _ := k.GetProposal(ctx, proposalID)
	require.Equal(t, "executed", proposal.Status)
}

func TestParamExecutorReputation(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	proposalID, err := k.SubmitProposal(ctx, "Change reputation param", "Update decay", "reputation", "max_comment_length", "500", testProposer, "10000000uclaw")
	require.NoError(t, err)

	err = k.CastVote(ctx, proposalID, testVoter1, "yes")
	require.NoError(t, err)

	err = k.ExecuteProposal(ctx, proposalID)
	require.NoError(t, err)

	proposal, _ := k.GetProposal(ctx, proposalID)
	require.Equal(t, "executed", proposal.Status)
}

func TestParamExecutorMessaging(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	proposalID, err := k.SubmitProposal(ctx, "Change messaging param", "Update size", "messaging", "max_message_size", "2048", testProposer, "10000000uclaw")
	require.NoError(t, err)

	err = k.CastVote(ctx, proposalID, testVoter1, "yes")
	require.NoError(t, err)

	err = k.ExecuteProposal(ctx, proposalID)
	require.NoError(t, err)

	proposal, _ := k.GetProposal(ctx, proposalID)
	require.Equal(t, "executed", proposal.Status)
}

func TestParamExecutorModelRegistry(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	proposalID, err := k.SubmitProposal(ctx, "Change modelregistry param", "Update fee", "modelregistry", "platform_fee_bps", "300", testProposer, "10000000uclaw")
	require.NoError(t, err)

	err = k.CastVote(ctx, proposalID, testVoter1, "yes")
	require.NoError(t, err)

	err = k.ExecuteProposal(ctx, proposalID)
	require.NoError(t, err)

	proposal, _ := k.GetProposal(ctx, proposalID)
	require.Equal(t, "executed", proposal.Status)
}
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/keeper/ -run "TestParamExecutor" -v`
Expected: All 4 PASS (executors already registered in app.go)

- [ ] **Step 3: Commit**

```bash
git add x/governance/keeper/governance_param_executor_test.go
git commit -m "test(governance): add ParamExecutor coverage for all 6 modules"
```

### Task 1.6: Add Execution Log Fields to Proposal

**Files:**
- Modify: `proto/clawchain/governance/v1/types.proto`
- Modify: `x/governance/keeper/keeper.go`
- Test: `x/governance/keeper/governance_execution_log_test.go` (create)

- [ ] **Step 1: Add fields to proto**

In `proto/clawchain/governance/v1/types.proto`, add to Proposal:

```protobuf
int64 execution_height = 16;
string execution_error = 17;
```

- [ ] **Step 2: Write failing test**

Create `x/governance/keeper/governance_execution_log_test.go`:

```go
package keeper_test

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestExecutionLogPopulated(t *testing.T) {
	k, ctx := setupGovernanceKeeper(t)

	proposalID, _ := k.SubmitProposal(ctx, "Test", "Desc", "agent", "max_heartbeat_gap_blocks", "200", testProposer, "10000000uclaw")
	_ = k.CastVote(ctx, proposalID, testVoter1, "yes")

	err := k.ExecuteProposal(ctx, proposalID)
	require.NoError(t, err)

	proposal, _ := k.GetProposal(ctx, proposalID)
	require.Equal(t, "executed", proposal.Status)
	require.Greater(t, proposal.ExecutionHeight, int64(0))
	require.Empty(t, proposal.ExecutionError)
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/keeper/ -run TestExecutionLogPopulated -v`
Expected: FAIL — `ExecutionHeight` is 0

- [ ] **Step 4: Update ExecuteProposal to set execution fields**

In `x/governance/keeper/keeper.go`, in `ExecuteProposal` (around line 298), after setting status to `ProposalStatusExecuted`:

```go
sdkCtx := sdk.UnwrapSDKContext(ctx)
proposal.ExecutionHeight = sdkCtx.BlockHeight()
proposal.ExecutionError = ""
```

And in the error case of execution:

```go
proposal.ExecutionError = err.Error()
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/keeper/ -run TestExecutionLogPopulated -v`
Expected: PASS

- [ ] **Step 6: Run all governance tests**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/governance/... -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add x/governance/ proto/clawchain/governance/v1/types.proto
git commit -m "feat(governance): add execution_height and execution_error to proposal"
```

### Task 1.7: Governance SDK + CLI + Web

**Files:**
- Modify: `sdk/src/governance.ts` (or equivalent)
- Modify: `cmd/clawd/src/commands/governance.ts` (or equivalent)
- Modify: `web/src/pages/Governance.tsx`
- Modify: `web/src/pages/ProposalDetail.tsx`

- [ ] **Step 1: Add SDK methods**

Find the governance section in the SDK (search for `submitProposal` or `governance` in `sdk/src/`). Add:

```typescript
async cancelProposal(proposalId: number): Promise<TxResult> {
  return this.signAndBroadcast({
    typeUrl: '/clawchain.governance.v1.MsgCancelProposal',
    value: { proposer: this.address, proposalId },
  });
}

async getTallyResult(proposalId: number): Promise<TallyResult> {
  const res = await this.queryClient.get(`/clawchain/governance/v1/proposal/${proposalId}/tally`);
  return res.data;
}

async getVoterHistory(voter: string): Promise<VoterVoteEntry[]> {
  const res = await this.queryClient.get(`/clawchain/governance/v1/voter/${voter}/votes`);
  return res.data.votes || [];
}
```

- [ ] **Step 2: Add CLI commands**

Find governance command file in `cmd/clawd/src/commands/`. Add subcommands:

```typescript
governance
  .command('cancel <proposal-id>')
  .description('Cancel a proposal (proposer only)')
  .action(async (proposalId: string) => {
    const client = await getClient();
    const result = await client.cancelProposal(parseInt(proposalId));
    console.log(formatTxResult(result));
  });

governance
  .command('tally <proposal-id>')
  .description('Show live vote tally')
  .action(async (proposalId: string) => {
    const client = await getClient();
    const tally = await client.getTallyResult(parseInt(proposalId));
    console.table(tally);
  });

governance
  .command('voter-history <address>')
  .description('Show voting record for an address')
  .action(async (address: string) => {
    const client = await getClient();
    const votes = await client.getVoterHistory(address);
    console.table(votes);
  });
```

- [ ] **Step 3: Enhance web ProposalDetail page**

In `web/src/pages/ProposalDetail.tsx`, add a tally progress bar component and cancel button. The tally bar shows yes/no/abstain/veto percentages. Cancel button is visible only when `proposal.proposer === walletAddress && proposal.status === 'voting'`.

- [ ] **Step 4: Enhance web Governance list page**

In `web/src/pages/Governance.tsx`, add status filter dropdown: All, Voting, Passed, Executed, Rejected, Cancelled.

- [ ] **Step 5: Run SDK tests**

Run: `cd /Users/arhansubasi/new-blokchain/sdk && npm test`
Expected: All existing tests PASS + new governance tests

- [ ] **Step 6: Run web build**

Run: `cd /Users/arhansubasi/new-blokchain/web && npx vite build`
Expected: Build succeeds with 0 errors

- [ ] **Step 7: Commit**

```bash
git add sdk/src/ cmd/clawd/src/ web/src/
git commit -m "feat(governance): add cancel/tally/voter-history to SDK, CLI, and web"
```

---

## Chunk 2: Oracle Module (New)

### Task 2.1: Oracle Proto Definitions

**Files:**
- Create: `proto/clawchain/oracle/v1/tx.proto`
- Create: `proto/clawchain/oracle/v1/query.proto`
- Create: `proto/clawchain/oracle/v1/genesis.proto`
- Create: `proto/clawchain/oracle/v1/types.proto`

- [ ] **Step 1: Create tx.proto**

Create `proto/clawchain/oracle/v1/tx.proto`:

```protobuf
syntax = "proto3";
package clawchain.oracle.v1;

option go_package = "github.com/anthropic/clawchain/x/oracle/types";

service Msg {
  rpc DelegateFeeder(MsgDelegateFeeder) returns (MsgDelegateFeederResponse);
  rpc AggregateExchangeRatePrevote(MsgAggregateExchangeRatePrevote) returns (MsgAggregateExchangeRatePrevoteResponse);
  rpc AggregateExchangeRateVote(MsgAggregateExchangeRateVote) returns (MsgAggregateExchangeRateVoteResponse);
  rpc UpdateParams(MsgUpdateParams) returns (MsgUpdateParamsResponse);
}

message MsgDelegateFeeder {
  string validator = 1;
  string feeder = 2;
}
message MsgDelegateFeederResponse {}

message MsgAggregateExchangeRatePrevote {
  string hash = 1;
  string feeder = 2;
  string validator = 3;
}
message MsgAggregateExchangeRatePrevoteResponse {}

message MsgAggregateExchangeRateVote {
  string salt = 1;
  string exchange_rates = 2;
  string feeder = 3;
  string validator = 4;
}
message MsgAggregateExchangeRateVoteResponse {}

message MsgUpdateParams {
  string authority = 1;
  OracleParams params = 2;
}
message MsgUpdateParamsResponse {}
```

- [ ] **Step 2: Create types.proto**

Create `proto/clawchain/oracle/v1/types.proto`:

```protobuf
syntax = "proto3";
package clawchain.oracle.v1;

option go_package = "github.com/anthropic/clawchain/x/oracle/types";

message OracleParams {
  uint64 vote_period = 1;
  string vote_threshold = 2;
  string reward_band = 3;
  string slash_fraction = 4;
  uint64 slash_window = 5;
  string min_valid_per_window = 6;
  repeated string whitelist = 7;
}

message ExchangeRate {
  string denom_pair = 1;
  string price = 2;
  int64 block_height = 3;
  int64 timestamp = 4;
}

message PriceHistoryEntry {
  string price = 1;
  int64 block_height = 2;
  int64 timestamp = 3;
  uint64 duration_blocks = 4;
}

message AggregateExchangeRatePrevote {
  string hash = 1;
  string voter = 2;
  uint64 submit_block = 3;
}

message AggregateExchangeRateVote {
  string exchange_rates = 1;
  string voter = 2;
}

message TWAPEntry {
  string denom_pair = 1;
  string twap = 2;
  int64 last_updated_block = 3;
  uint64 window_size = 4;
}
```

- [ ] **Step 3: Create query.proto**

Create `proto/clawchain/oracle/v1/query.proto`:

```protobuf
syntax = "proto3";
package clawchain.oracle.v1;

import "google/api/annotations.proto";
import "clawchain/oracle/v1/types.proto";

option go_package = "github.com/anthropic/clawchain/x/oracle/types";

service Query {
  rpc Price(QueryPriceRequest) returns (QueryPriceResponse) {
    option (google.api.http).get = "/clawchain/oracle/v1/price/{denom_pair}";
  }
  rpc Prices(QueryPricesRequest) returns (QueryPricesResponse) {
    option (google.api.http).get = "/clawchain/oracle/v1/prices";
  }
  rpc PriceHistory(QueryPriceHistoryRequest) returns (QueryPriceHistoryResponse) {
    option (google.api.http).get = "/clawchain/oracle/v1/price_history/{denom_pair}";
  }
  rpc FeederDelegation(QueryFeederDelegationRequest) returns (QueryFeederDelegationResponse) {
    option (google.api.http).get = "/clawchain/oracle/v1/feeder/{validator}";
  }
  rpc MissCounter(QueryMissCounterRequest) returns (QueryMissCounterResponse) {
    option (google.api.http).get = "/clawchain/oracle/v1/miss/{validator}";
  }
  rpc Params(QueryOracleParamsRequest) returns (QueryOracleParamsResponse) {
    option (google.api.http).get = "/clawchain/oracle/v1/params";
  }
}

message QueryPriceRequest { string denom_pair = 1; }
message QueryPriceResponse { ExchangeRate rate = 1; }

message QueryPricesRequest {}
message QueryPricesResponse { repeated ExchangeRate rates = 1; }

message QueryPriceHistoryRequest {
  string denom_pair = 1;
  uint64 limit = 2;
}
message QueryPriceHistoryResponse { repeated PriceHistoryEntry entries = 1; }

message QueryFeederDelegationRequest { string validator = 1; }
message QueryFeederDelegationResponse { string feeder = 1; }

message QueryMissCounterRequest { string validator = 1; }
message QueryMissCounterResponse { uint64 miss_counter = 1; }

message QueryOracleParamsRequest {}
message QueryOracleParamsResponse { OracleParams params = 1; }
```

- [ ] **Step 4: Create genesis.proto**

Create `proto/clawchain/oracle/v1/genesis.proto`:

```protobuf
syntax = "proto3";
package clawchain.oracle.v1;

import "clawchain/oracle/v1/types.proto";

option go_package = "github.com/anthropic/clawchain/x/oracle/types";

message GenesisState {
  OracleParams params = 1;
  repeated ExchangeRate exchange_rates = 2;
  map<string, string> feeder_delegations = 3;
  map<string, uint64> miss_counters = 4;
  repeated PriceHistoryEntry price_history = 5;
}
```

- [ ] **Step 5: Commit**

```bash
git add proto/clawchain/oracle/
git commit -m "feat(oracle): add proto definitions for oracle module"
```

### Task 2.2: Oracle Module Types + Keeper Scaffold

**Files:**
- Create: `x/oracle/types/keys.go`
- Create: `x/oracle/types/errors.go`
- Create: `x/oracle/types/params.go`
- Create: `x/oracle/types/expected_keepers.go`
- Create: `x/oracle/types/codec.go`
- Create: `x/oracle/keeper/keeper.go`

- [ ] **Step 1: Create keys.go**

```go
package types

const (
	ModuleName = "oracle"
	StoreKey   = ModuleName
	RouterKey  = ModuleName

	ExchangeRatePrefix    = "er_"
	PriceHistoryPrefix    = "ph_"
	PrevotePrefix         = "pv_"
	VotePrefix            = "v_"
	FeederDelegationPrefix = "fd_"
	MissCounterPrefix     = "mc_"
	TWAPPrefix            = "twap_"
	ParamsKey             = "params"
)
```

- [ ] **Step 2: Create errors.go**

```go
package types

import errorsmod "cosmossdk.io/errors"

var (
	ErrInvalidPrevote         = errorsmod.Register(ModuleName, 1500, "invalid prevote")
	ErrInvalidVote            = errorsmod.Register(ModuleName, 1501, "vote hash does not match prevote")
	ErrNoMatchingPrevote      = errorsmod.Register(ModuleName, 1502, "no matching prevote found")
	ErrMissedVotePeriod       = errorsmod.Register(ModuleName, 1503, "missed vote period")
	ErrInvalidFeederDelegation = errorsmod.Register(ModuleName, 1504, "invalid feeder delegation")
	ErrUnauthorizedFeeder     = errorsmod.Register(ModuleName, 1505, "unauthorized feeder")
	ErrInvalidDenomPair       = errorsmod.Register(ModuleName, 1506, "denom pair not in whitelist")
	ErrPriceNotAvailable      = errorsmod.Register(ModuleName, 1507, "price not available")
)
```

- [ ] **Step 3: Create params.go**

```go
package types

var DefaultParams = OracleParams{
	VotePeriod:        10,
	VoteThreshold:     "0.50",
	RewardBand:        "0.02",
	SlashFraction:     "0.0001",
	SlashWindow:       100,
	MinValidPerWindow: "0.05",
	Whitelist:         []string{"CLAW/USD", "CLAW/ATOM", "ATOM/USD"},
}

func NewParams() OracleParams {
	return DefaultParams
}
```

- [ ] **Step 4: Create expected_keepers.go**

```go
package types

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
)

type StakingKeeper interface {
	GetBondedValidatorsByPower(ctx context.Context) ([]stakingtypes.Validator, error)
	GetValidator(ctx context.Context, addr sdk.ValAddress) (stakingtypes.Validator, error)
}

type SlashingKeeper interface {
	Slash(ctx context.Context, consAddr sdk.ConsAddress, fraction sdk.Dec, power int64, height int64) error
}

type BankKeeper interface {
	SendCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error
}
```

- [ ] **Step 5: Create keeper.go scaffold**

```go
package keeper

import (
	"context"
	"encoding/json"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"

	"github.com/anthropic/clawchain/x/oracle/types"
)

type Keeper struct {
	cdc          codec.Codec
	storeService store.KVStoreService
	authority    string

	stakingKeeper  types.StakingKeeper
	bankKeeper     types.BankKeeper

	ExchangeRates    collections.Map[string, string]
	PriceHistory     collections.Map[string, string]
	Prevotes         collections.Map[string, string]
	Votes            collections.Map[string, string]
	FeederDelegations collections.Map[string, string]
	MissCounters     collections.Map[string, uint64]
	TWAPStore        collections.Map[string, string]
	Params           collections.Item[string]
}

func NewKeeper(
	cdc codec.Codec,
	storeService store.KVStoreService,
	authority string,
	stakingKeeper types.StakingKeeper,
	bankKeeper types.BankKeeper,
) Keeper {
	sb := collections.NewSchemaBuilder(storeService)

	return Keeper{
		cdc:          cdc,
		storeService: storeService,
		authority:    authority,
		stakingKeeper:  stakingKeeper,
		bankKeeper:     bankKeeper,
		ExchangeRates:    collections.NewMap(sb, collections.NewPrefix(types.ExchangeRatePrefix), "exchange_rates", collections.StringKey, collections.StringValue),
		PriceHistory:     collections.NewMap(sb, collections.NewPrefix(types.PriceHistoryPrefix), "price_history", collections.StringKey, collections.StringValue),
		Prevotes:         collections.NewMap(sb, collections.NewPrefix(types.PrevotePrefix), "prevotes", collections.StringKey, collections.StringValue),
		Votes:            collections.NewMap(sb, collections.NewPrefix(types.VotePrefix), "votes", collections.StringKey, collections.StringValue),
		FeederDelegations: collections.NewMap(sb, collections.NewPrefix(types.FeederDelegationPrefix), "feeder_delegations", collections.StringKey, collections.StringValue),
		MissCounters:     collections.NewMap(sb, collections.NewPrefix(types.MissCounterPrefix), "miss_counters", collections.StringKey, collections.Uint64Value),
		TWAPStore:        collections.NewMap(sb, collections.NewPrefix(types.TWAPPrefix), "twap", collections.StringKey, collections.StringValue),
		Params:           collections.NewItem(sb, collections.NewPrefix(types.ParamsKey), "params", collections.StringValue),
	}
}
```

- [ ] **Step 6: Commit**

```bash
git add x/oracle/
git commit -m "feat(oracle): scaffold module types, errors, params, and keeper"
```

### Task 2.3: Oracle Prevote + Vote Message Handlers

**Files:**
- Create: `x/oracle/keeper/msg_server_prevote.go`
- Create: `x/oracle/keeper/msg_server_vote.go`
- Create: `x/oracle/keeper/msg_server_delegate_feeder.go`
- Test: `x/oracle/keeper/oracle_vote_test.go` (create)

- [ ] **Step 1: Write failing test for prevote → vote cycle**

Create `x/oracle/keeper/oracle_vote_test.go`:

```go
package keeper_test

import (
	"crypto/sha256"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPrevoteAndVote(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	salt := "testsalt"
	rates := "CLAW/USD:1.5,CLAW/ATOM:0.12"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+rates+testValidator)))

	// Prevote
	err := k.HandlePrevote(ctx, hash, testFeeder, testValidator)
	require.NoError(t, err)

	// Vote (reveal)
	err = k.HandleVote(ctx, salt, rates, testFeeder, testValidator)
	require.NoError(t, err)
}

func TestVoteWithoutPrevote(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	err := k.HandleVote(ctx, "salt", "CLAW/USD:1.5", testFeeder, testValidator)
	require.Error(t, err)
}

func TestVoteHashMismatch(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Prevote with one hash
	err := k.HandlePrevote(ctx, "correcthash", testFeeder, testValidator)
	require.NoError(t, err)

	// Vote with different data (hash won't match)
	err = k.HandleVote(ctx, "wrongsalt", "CLAW/USD:999", testFeeder, testValidator)
	require.Error(t, err)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/oracle/keeper/ -run TestPrevoteAndVote -v`
Expected: FAIL

- [ ] **Step 3: Implement HandlePrevote**

Create `x/oracle/keeper/msg_server_prevote.go`:

```go
package keeper

import (
	"context"
	"encoding/json"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/anthropic/clawchain/x/oracle/types"
)

func (k Keeper) HandlePrevote(ctx context.Context, hash string, feeder string, validator string) error {
	// Verify feeder is authorized for this validator
	if err := k.validateFeeder(ctx, feeder, validator); err != nil {
		return err
	}

	if hash == "" {
		return types.ErrInvalidPrevote
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	prevote := types.AggregateExchangeRatePrevote{
		Hash:        hash,
		Voter:       validator,
		SubmitBlock: uint64(sdkCtx.BlockHeight()),
	}

	prevoteJSON, _ := json.Marshal(prevote)
	return k.Prevotes.Set(ctx, validator, string(prevoteJSON))
}

func (k Keeper) validateFeeder(ctx context.Context, feeder string, validator string) error {
	// If feeder == validator, always allowed
	if feeder == validator {
		return nil
	}

	// Check delegation
	delegated, err := k.FeederDelegations.Get(ctx, validator)
	if err != nil {
		return types.ErrUnauthorizedFeeder
	}
	if delegated != feeder {
		return types.ErrUnauthorizedFeeder
	}
	return nil
}
```

- [ ] **Step 4: Implement HandleVote**

Create `x/oracle/keeper/msg_server_vote.go`:

```go
package keeper

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"

	"github.com/anthropic/clawchain/x/oracle/types"
)

func (k Keeper) HandleVote(ctx context.Context, salt string, exchangeRates string, feeder string, validator string) error {
	if err := k.validateFeeder(ctx, feeder, validator); err != nil {
		return err
	}

	// Get prevote
	prevoteJSON, err := k.Prevotes.Get(ctx, validator)
	if err != nil {
		return types.ErrNoMatchingPrevote
	}

	var prevote types.AggregateExchangeRatePrevote
	if err := json.Unmarshal([]byte(prevoteJSON), &prevote); err != nil {
		return types.ErrNoMatchingPrevote
	}

	// Verify hash: SHA256(salt + exchange_rates + validator)
	expectedHash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+exchangeRates+validator)))
	if expectedHash != prevote.Hash {
		return types.ErrInvalidVote
	}

	// Store vote
	vote := types.AggregateExchangeRateVote{
		ExchangeRates: exchangeRates,
		Voter:         validator,
	}

	voteJSON, _ := json.Marshal(vote)
	if err := k.Votes.Set(ctx, validator, string(voteJSON)); err != nil {
		return err
	}

	// Clear prevote
	return k.Prevotes.Remove(ctx, validator)
}
```

- [ ] **Step 5: Implement HandleDelegateFeeder**

Create `x/oracle/keeper/msg_server_delegate_feeder.go`:

```go
package keeper

import (
	"context"

	"github.com/anthropic/clawchain/x/oracle/types"
)

func (k Keeper) HandleDelegateFeeder(ctx context.Context, validator string, feeder string) error {
	if validator == "" || feeder == "" {
		return types.ErrInvalidFeederDelegation
	}
	return k.FeederDelegations.Set(ctx, validator, feeder)
}
```

- [ ] **Step 6: Run tests**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/oracle/keeper/ -run "TestPrevote|TestVote" -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add x/oracle/keeper/
git commit -m "feat(oracle): implement prevote, vote, and delegate feeder handlers"
```

### Task 2.4: Oracle EndBlocker — Aggregation + Slash + TWAP

**Files:**
- Create: `x/oracle/keeper/endblock.go`
- Test: `x/oracle/keeper/oracle_endblock_test.go` (create)

- [ ] **Step 1: Write failing test for price aggregation**

Create `x/oracle/keeper/oracle_endblock_test.go`:

```go
package keeper_test

import (
	"crypto/sha256"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEndBlockAggregation(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// 3 validators submit votes: 1.5, 1.6, 1.4
	validators := []string{testValidator, testValidator2, testValidator3}
	prices := []string{"CLAW/USD:1.5", "CLAW/USD:1.6", "CLAW/USD:1.4"}

	for i, v := range validators {
		salt := fmt.Sprintf("salt%d", i)
		hash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+prices[i]+v)))
		_ = k.HandlePrevote(ctx, hash, v, v)
		_ = k.HandleVote(ctx, salt, prices[i], v, v)
	}

	// Run EndBlocker
	err := k.EndBlocker(ctx)
	require.NoError(t, err)

	// Check canonical price is the median (1.5)
	rate, err := k.GetExchangeRate(ctx, "CLAW/USD")
	require.NoError(t, err)
	require.Equal(t, "1.5", rate.Price)
}

func TestEndBlockMissCounter(t *testing.T) {
	k, ctx := setupOracleKeeper(t)

	// Only validator1 votes, validator2 and validator3 miss
	salt := "salt"
	rates := "CLAW/USD:1.5"
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(salt+rates+testValidator)))
	_ = k.HandlePrevote(ctx, hash, testValidator, testValidator)
	_ = k.HandleVote(ctx, salt, rates, testValidator, testValidator)

	_ = k.EndBlocker(ctx)

	// Check miss counters
	miss2, _ := k.MissCounters.Get(ctx, testValidator2)
	require.Equal(t, uint64(1), miss2)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/oracle/keeper/ -run TestEndBlock -v`
Expected: FAIL

- [ ] **Step 3: Implement EndBlocker**

Create `x/oracle/keeper/endblock.go`:

```go
package keeper

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/anthropic/clawchain/x/oracle/types"
)

type voteEntry struct {
	Validator string
	Price     float64
	Power     int64
}

func (k Keeper) EndBlocker(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	params := k.GetParams(ctx)

	// Only aggregate at vote period boundaries
	if uint64(sdkCtx.BlockHeight())%params.VotePeriod != 0 {
		return nil
	}

	// Collect all votes
	denomVotes := make(map[string][]voteEntry)

	votedValidators := make(map[string]bool)

	err := k.Votes.Walk(ctx, nil, func(validator string, voteJSON string) (bool, error) {
		var vote types.AggregateExchangeRateVote
		if err := json.Unmarshal([]byte(voteJSON), &vote); err != nil {
			return false, nil
		}

		votedValidators[validator] = true

		// Parse "CLAW/USD:1.5,CLAW/ATOM:0.12"
		pairs := strings.Split(vote.ExchangeRates, ",")
		for _, pair := range pairs {
			parts := strings.SplitN(pair, ":", 2)
			if len(parts) != 2 {
				continue
			}
			denom := parts[0]
			price, err := strconv.ParseFloat(parts[1], 64)
			if err != nil {
				continue
			}

			// Get validator power (default 1 if no staking)
			power := int64(1)

			denomVotes[denom] = append(denomVotes[denom], voteEntry{
				Validator: validator,
				Price:     price,
				Power:     power,
			})
		}

		return false, nil
	})
	if err != nil {
		return err
	}

	// Compute weighted median for each denom pair
	for denom, votes := range denomVotes {
		if !k.isDenomWhitelisted(params, denom) {
			continue
		}

		medianPrice := weightedMedian(votes)

		rate := types.ExchangeRate{
			DenomPair:   denom,
			Price:       fmt.Sprintf("%.6f", medianPrice),
			BlockHeight: sdkCtx.BlockHeight(),
			Timestamp:   sdkCtx.BlockTime().Unix(),
		}

		rateJSON, _ := json.Marshal(rate)
		_ = k.ExchangeRates.Set(ctx, denom, string(rateJSON))

		// Update TWAP
		k.updateTWAP(ctx, denom, medianPrice, sdkCtx.BlockHeight(), params.VotePeriod)

		// Append to price history
		k.appendPriceHistory(ctx, denom, rate)
	}

	// Track miss counters for validators who didn't vote
	if k.stakingKeeper != nil {
		validators, err := k.stakingKeeper.GetBondedValidatorsByPower(ctx)
		if err == nil {
			for _, val := range validators {
				valAddr := val.GetOperator()
				if !votedValidators[valAddr] {
					current, _ := k.MissCounters.Get(ctx, valAddr)
					_ = k.MissCounters.Set(ctx, valAddr, current+1)
				}
			}
		}
	}

	// Clear all votes for next period
	_ = k.Votes.Walk(ctx, nil, func(key string, _ string) (bool, error) {
		_ = k.Votes.Remove(ctx, key)
		return false, nil
	})

	return nil
}

// weightedMedian: sort by price, accumulate power until >= total/2
func weightedMedian(votes []voteEntry) float64 {
	if len(votes) == 0 {
		return 0
	}

	sort.Slice(votes, func(i, j int) bool {
		return votes[i].Price < votes[j].Price
	})

	var totalPower int64
	for _, v := range votes {
		totalPower += v.Power
	}

	var cumPower int64
	for _, v := range votes {
		cumPower += v.Power
		if cumPower*2 >= totalPower {
			return v.Price
		}
	}

	return votes[len(votes)-1].Price
}

func (k Keeper) isDenomWhitelisted(params types.OracleParams, denom string) bool {
	for _, w := range params.Whitelist {
		if w == denom {
			return true
		}
	}
	return false
}

func (k Keeper) updateTWAP(ctx context.Context, denom string, price float64, height int64, period uint64) {
	twapJSON, err := k.TWAPStore.Get(ctx, denom)
	if err != nil {
		// First entry
		entry := types.TWAPEntry{
			DenomPair:        denom,
			Twap:             fmt.Sprintf("%.6f", price),
			LastUpdatedBlock: height,
			WindowSize:       1,
		}
		data, _ := json.Marshal(entry)
		_ = k.TWAPStore.Set(ctx, denom, string(data))
		return
	}

	var entry types.TWAPEntry
	_ = json.Unmarshal([]byte(twapJSON), &entry)

	oldTwap, _ := strconv.ParseFloat(entry.Twap, 64)
	durationBlocks := float64(height - entry.LastUpdatedBlock)
	windowBlocks := float64(period * 10) // 10 vote periods

	// Time-weighted: new_twap = old_twap * (1 - weight) + price * weight
	weight := durationBlocks / windowBlocks
	if weight > 1 {
		weight = 1
	}
	newTwap := oldTwap*(1-weight) + price*weight

	entry.Twap = fmt.Sprintf("%.6f", newTwap)
	entry.LastUpdatedBlock = height
	entry.WindowSize++

	data, _ := json.Marshal(entry)
	_ = k.TWAPStore.Set(ctx, denom, string(data))
}

func (k Keeper) appendPriceHistory(ctx context.Context, denom string, rate types.ExchangeRate) {
	key := denom
	historyJSON, err := k.PriceHistory.Get(ctx, key)

	var history []types.PriceHistoryEntry
	if err == nil {
		_ = json.Unmarshal([]byte(historyJSON), &history)
	}

	history = append(history, types.PriceHistoryEntry{
		Price:       rate.Price,
		BlockHeight: rate.BlockHeight,
		Timestamp:   rate.Timestamp,
	})

	// Cap at 1000 entries
	if len(history) > 1000 {
		history = history[len(history)-1000:]
	}

	data, _ := json.Marshal(history)
	_ = k.PriceHistory.Set(ctx, key, string(data))
}

func (k Keeper) GetExchangeRate(ctx context.Context, denomPair string) (*types.ExchangeRate, error) {
	rateJSON, err := k.ExchangeRates.Get(ctx, denomPair)
	if err != nil {
		return nil, types.ErrPriceNotAvailable
	}
	var rate types.ExchangeRate
	if err := json.Unmarshal([]byte(rateJSON), &rate); err != nil {
		return nil, types.ErrPriceNotAvailable
	}
	return &rate, nil
}

func (k Keeper) GetParams(ctx context.Context) types.OracleParams {
	paramsJSON, err := k.Params.Get(ctx)
	if err != nil {
		return types.DefaultParams
	}
	var params types.OracleParams
	_ = json.Unmarshal([]byte(paramsJSON), &params)
	return params
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/arhansubasi/new-blokchain && go test ./x/oracle/keeper/ -run TestEndBlock -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add x/oracle/keeper/endblock.go x/oracle/keeper/oracle_endblock_test.go
git commit -m "feat(oracle): implement EndBlocker with weighted median, TWAP, and miss tracking"
```

### Task 2.5: Oracle Module Registration + Query Handlers

**Files:**
- Create: `x/oracle/module/module.go`
- Create: `x/oracle/module/autocli.go`
- Create: `x/oracle/module/depinject.go`
- Create: `x/oracle/keeper/query_price.go`
- Create: `x/oracle/keeper/query_prices.go`
- Create: `x/oracle/keeper/query_price_history.go`
- Create: `x/oracle/keeper/query_miss_counter.go`
- Create: `x/oracle/keeper/genesis.go`
- Modify: `app/app.go`
- Modify: `app/app_config.go`

This task wires the oracle module into the app. Follow the exact same patterns used by `x/governance/module/module.go` and `x/agent/module/module.go` for:
- `AppModule` struct implementing `appmodule.AppModule`
- `RegisterServices` for gRPC query server
- `DefaultGenesis` / `ValidateGenesis` / `InitGenesis` / `ExportGenesis`
- `EndBlock` calling `keeper.EndBlocker(ctx)`
- `depinject.go` provider function
- Registration in `app/app.go` with store key `"oracle"`

Query handlers are simple wrappers:

```go
// query_price.go
func (k Keeper) QueryPrice(ctx context.Context, denomPair string) (*types.ExchangeRate, error) {
    return k.GetExchangeRate(ctx, denomPair)
}

// query_prices.go
func (k Keeper) QueryPrices(ctx context.Context) ([]types.ExchangeRate, error) {
    var rates []types.ExchangeRate
    _ = k.ExchangeRates.Walk(ctx, nil, func(_ string, rateJSON string) (bool, error) {
        var rate types.ExchangeRate
        _ = json.Unmarshal([]byte(rateJSON), &rate)
        rates = append(rates, rate)
        return false, nil
    })
    return rates, nil
}
```

- [ ] **Step 1: Create module files following existing patterns**
- [ ] **Step 2: Wire into app/app.go**
- [ ] **Step 3: Add to app/app_config.go depinject**
- [ ] **Step 4: Add upgrades.go migration entry**
- [ ] **Step 5: Verify build**: `go build ./...`
- [ ] **Step 6: Run oracle tests**: `go test ./x/oracle/... -v`
- [ ] **Step 7: Run full test suite**: `go test ./...` (ensure no regressions)
- [ ] **Step 8: Commit**

```bash
git add x/oracle/ app/
git commit -m "feat(oracle): wire oracle module into app with queries and genesis"
```

### Task 2.6: Oracle SDK + CLI + Web

**Files:**
- Modify: SDK governance/oracle section
- Modify: clawd commands
- Create: `web/src/pages/Oracle.tsx`

- [ ] **Step 1: Add SDK methods**

```typescript
// Oracle methods
async submitPrevote(salt: string, prices: string): Promise<TxResult> { /* ... */ }
async submitVote(salt: string, prices: string): Promise<TxResult> { /* ... */ }
async delegateFeeder(feederAddress: string): Promise<TxResult> { /* ... */ }
async getPrice(denomPair: string): Promise<ExchangeRate> { /* ... */ }
async getPrices(): Promise<ExchangeRate[]> { /* ... */ }
async getPriceHistory(denomPair: string, limit?: number): Promise<PriceHistoryEntry[]> { /* ... */ }
async getOracleParams(): Promise<OracleParams> { /* ... */ }
async getMissCounter(validator: string): Promise<number> { /* ... */ }
```

- [ ] **Step 2: Add CLI commands**

```
clawd oracle prevote <salt> <prices>
clawd oracle vote <salt> <prices>
clawd oracle delegate-feeder <feeder-address>
clawd oracle prices
clawd oracle price <denom-pair>
clawd oracle history <denom-pair>
clawd oracle miss-counter [validator]
clawd oracle params
```

- [ ] **Step 3: Create Oracle web page**

New page at `/oracle` with: price table, sparkline charts (from history), feeder status table, oracle params.

- [ ] **Step 4: Add route to App.tsx**
- [ ] **Step 5: Run SDK tests**: `cd sdk && npm test`
- [ ] **Step 6: Run web build**: `cd web && npx vite build`
- [ ] **Step 7: Commit**

```bash
git add sdk/ cmd/clawd/ web/
git commit -m "feat(oracle): add oracle SDK methods, CLI commands, and web page"
```

---

## Chunk 3: IBC Hardening

### Task 3.1: IBC Task Completion ACK Flow

**Files:**
- Modify: `x/agent/ibc/middleware.go`
- Modify: `x/agent/keeper/keeper.go`
- Create: `x/agent/ibc/ack.go`
- Test: `x/agent/keeper/ibc_ack_test.go` (create)

- [ ] **Step 1: Write failing test**

```go
func TestIBCTaskCompletionACK(t *testing.T) {
    k, ctx := setupAgentKeeper(t)

    // Create task with IBC metadata
    taskID, _ := k.CreateTaskFromIBC(ctx, "delegator1", "chain-b", "agent1", "test task", "compute", 0, "1000uclaw", 100)

    // Complete the task
    err := k.CompleteTaskWithIBCACK(ctx, taskID, "result_hash_abc")
    require.NoError(t, err)

    // Verify task has IBC ACK pending
    task, _ := k.GetTask(ctx, taskID)
    require.Equal(t, "completed", task.Status)
}
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add IBCTaskMap collection to keeper** (stores ibc_sequence → task_id)
- [ ] **Step 4: Implement CompleteTaskWithIBCACK** — checks if task has `ibc:` delegator prefix, constructs ACK packet
- [ ] **Step 5: Add OnAcknowledgementPacket handler** — processes completion ACK on source chain
- [ ] **Step 6: Add OnTimeoutPacket handler** — auto-refund escrowed budget
- [ ] **Step 7: Run tests**
- [ ] **Step 8: Commit**

### Task 3.2: Remote Agent Heartbeat Expiry

**Files:**
- Modify: `x/agent/keeper/keeper.go`
- Test: `x/agent/keeper/remote_agent_expiry_test.go` (create)

- [ ] **Step 1: Write failing test**

```go
func TestRemoteAgentExpiry(t *testing.T) {
    k, ctx := setupAgentKeeper(t)

    // Store remote agent
    _ = k.StoreRemoteAgent(ctx, "chain-b", "channel-0", agentibc.RemoteAgentInfo{
        ChainID: "chain-b", Address: "agent1", Name: "Remote Agent",
    })

    // Advance blocks past TTL (default 1000)
    ctx = advanceBlocks(ctx, 1001)

    // Run remote agent cleanup
    err := k.ExpireRemoteAgents(ctx)
    require.NoError(t, err)

    // Agent should be inactive
    agents := k.GetRemoteAgents(ctx, "chain-b")
    require.Equal(t, "inactive", agents[0].Status)
}
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add `Status` and `LastHeartbeat` fields to RemoteAgentInfo**
- [ ] **Step 4: Implement ExpireRemoteAgents** — walks remote agents, deactivates expired
- [ ] **Step 5: Call from agent EndBlocker**
- [ ] **Step 6: Run tests**
- [ ] **Step 7: Commit**

### Task 3.3: Privacy IBC Configurable Auto-Shield Threshold

**Files:**
- Modify: `x/privacy/types/params.go`
- Modify: `x/privacy/ibc/middleware.go`
- Test: `x/privacy/keeper/ibc_threshold_test.go` (create)

- [ ] **Step 1: Write failing test**

```go
func TestAutoShieldThreshold(t *testing.T) {
    // Transfer below threshold should NOT auto-shield
    // Transfer above threshold should auto-shield
}
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add params**: `AutoShieldMode` (`off`, `memo_only`, `all`, `threshold_only`), `AutoShieldThreshold` (uint64)
- [ ] **Step 4: Update OnRecvPacket** to check mode and threshold
- [ ] **Step 5: Run tests**
- [ ] **Step 6: Commit**

### Task 3.4: Cross-Chain Unshield Transport

**Files:**
- Modify: `x/privacy/ibc/middleware.go`
- Modify: `x/privacy/ibc/types.go`
- Test: `x/privacy/keeper/ibc_unshield_test.go` (create)

- [ ] **Step 1: Write failing test for unshield memo parsing**
- [ ] **Step 2: Implement unshield action in OnRecvPacket** — parse memo `{"clawchain_privacy":{"action":"unshield","proof":"...","nullifier":"...","amount":"..."}}`, verify ZK proof, if valid process transfer
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

### Task 3.5: IBC SDK + CLI + Web

- [ ] **Step 1: Add SDK methods**: `ibcDelegateTask()`, `queryRemoteAgents()`, `ibcShield()`, `ibcUnshield()`
- [ ] **Step 2: Add CLI commands**: `clawd ibc delegate-task`, `clawd ibc remote-agents`, `clawd ibc shield`, `clawd ibc unshield`
- [ ] **Step 3: Enhance Bridge web page**: Remote Agents tab, cross-chain task form
- [ ] **Step 4: Enhance Privacy web page**: IBC shield/unshield option
- [ ] **Step 5: Run SDK tests + web build**
- [ ] **Step 6: Commit**

### Task 3.6: Create IBC Test Script

**Files:**
- Create: `scripts/setup-ibc-test.sh`

- [ ] **Step 1: Write script** that boots 2 local chains, sets up Hermes relayer, creates IBC channel
- [ ] **Step 2: Add test scenarios**: agent discovery, task delegation, auto-shield, unshield
- [ ] **Step 3: Verify script runs**
- [ ] **Step 4: Commit**

---

## Chunk 4: GPU Compute E2E Mock Pipeline

### Task 4.1: Define Executor gRPC Proto

**Files:**
- Create: `dantegpu-core/proto/executor/v1/executor.proto`

- [ ] **Step 1: Create proto file**

```protobuf
syntax = "proto3";
package executor.v1;

option go_package = "github.com/anthropic/clawchain/dantegpu-core/mock-executor/proto";

service Executor {
  rpc SubmitJob(JobRequest) returns (JobResponse);
  rpc CancelJob(CancelRequest) returns (CancelResponse);
  rpc GetJobStatus(StatusRequest) returns (StatusResponse);
  rpc StreamMetrics(MetricsRequest) returns (stream MetricsResponse);
}

message JobRequest {
  string job_id = 1;
  string execution_type = 2;  // "docker" or "script"
  map<string, string> params = 3;
  int64 estimated_duration_secs = 4;
}

message JobResponse {
  string job_id = 1;
  string status = 2;
  string output_hash = 3;
}

message CancelRequest { string job_id = 1; }
message CancelResponse { string job_id = 1; bool cancelled = 2; }

message StatusRequest { string job_id = 1; }
message StatusResponse {
  string job_id = 1;
  string status = 2;  // queued, running, completed, cancelled, failed
  float progress = 3;
}

message MetricsRequest { string job_id = 1; }
message MetricsResponse {
  uint32 gpu_utilization = 1;
  uint32 memory_utilization = 2;
  uint32 temperature = 3;
  uint32 power_draw_watts = 4;
  uint64 memory_used_mb = 5;
  uint64 memory_total_mb = 6;
}
```

- [ ] **Step 2: Generate Go stubs**: `protoc --go_out=. --go-grpc_out=. proto/executor/v1/executor.proto`
- [ ] **Step 3: Commit**

### Task 4.2: Build Mock Executor Service

**Files:**
- Create: `dantegpu-core/mock-executor/main.go`
- Create: `dantegpu-core/mock-executor/server.go`
- Test: `dantegpu-core/mock-executor/server_test.go`

- [ ] **Step 1: Write failing test**

```go
func TestMockExecutorSubmitJob(t *testing.T) {
    srv := NewMockExecutor(MockConfig{FailureRate: 0})
    resp, err := srv.SubmitJob(context.Background(), &pb.JobRequest{
        JobId: "test-1", ExecutionType: "docker", EstimatedDurationSecs: 1,
    })
    require.NoError(t, err)
    require.Equal(t, "completed", resp.Status)
    require.NotEmpty(t, resp.OutputHash)
}
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement mock executor** — SubmitJob sleeps then returns SHA256(job_id+"mock_output"), CancelJob immediately cancels, StreamMetrics emits fake GPU stats every 1s
- [ ] **Step 4: Add health endpoint**: `GET /health`
- [ ] **Step 5: Add configurable failure rate**: `MOCK_FAILURE_RATE=0.05`
- [ ] **Step 6: Run tests**
- [ ] **Step 7: Commit**

### Task 4.3: Wire NATS + Services in Docker Compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add services under `gpu-mock` profile**

```yaml
  nats:
    image: nats:2-alpine
    ports: ["4222:4222"]
    profiles: ["gpu-mock"]

  mock-executor:
    build: dantegpu-core/mock-executor
    environment:
      - MOCK_FAILURE_RATE=0.05
    profiles: ["gpu-mock"]

  provider-daemon:
    build: dantegpu-core/provider-daemon
    environment:
      - NATS_URL=nats://nats:4222
      - CHAIN_RPC=http://clawchain:26657
      - EXECUTOR_ADDR=mock-executor:50051
    profiles: ["gpu-mock"]
    depends_on: [nats, mock-executor, clawchain]

  scheduler:
    build: dantegpu-core/scheduler-orchestrator-service
    environment:
      - NATS_URL=nats://nats:4222
      - CHAIN_RPC=http://clawchain:26657
    profiles: ["gpu-mock"]
    depends_on: [nats, clawchain]
```

- [ ] **Step 2: Verify docker compose config**: `docker compose --profile gpu-mock config`
- [ ] **Step 3: Commit**

### Task 4.4: GPU Pipeline Integration Test Script

**Files:**
- Create: `scripts/test-gpu-pipeline.sh`

- [ ] **Step 1: Write integration test script**

```bash
#!/bin/bash
set -e

echo "=== GPU Pipeline E2E Test ==="

# Phase 1: Boot infrastructure
docker compose --profile gpu-mock up -d
sleep 10

# Phase 2: Register mock provider on-chain
clawchaind tx marketplace list-compute-resource ... --from dev-account

# Phase 3: Submit compute job
clawchaind tx marketplace submit-compute-job ... --from dev-account

# Phase 4: Wait for completion
sleep 15

# Phase 5: Verify settlement
BALANCE=$(clawchaind query bank balances $PROVIDER_ADDR)
echo "Provider balance: $BALANCE"

# Phase 6: Cancel test
clawchaind tx marketplace submit-compute-job ... --from dev-account
sleep 2
clawchaind tx marketplace cancel-compute-job ... --from dev-account

# Phase 7: Timeout test
# Submit with short deadline, wait for expiry

echo "=== All GPU Pipeline Tests Passed ==="
```

- [ ] **Step 2: Make executable and test**
- [ ] **Step 3: Commit**

### Task 4.5: Code Hardening Across DanteGPU Services

- [ ] **Step 1: Verify each service compiles**: iterate `dantegpu-core/*/`, run `go build ./...`
- [ ] **Step 2: Add /health endpoints** where missing
- [ ] **Step 3: Add graceful shutdown** (SIGTERM handler) where missing
- [ ] **Step 4: Verify ClawChainClient error handling** in `billing-payment-service/`
- [ ] **Step 5: Run all DanteGPU tests**: `cd dantegpu-core && go test ./... -v`
- [ ] **Step 6: Commit**

---

## Chunk 5: Mobile Wallet Integration

### Task 5.1: Branding Pass

**Files:**
- Modify: `claw-wallet-mobile/sandbox/sandbox_react_native/app.json`
- Modify: `claw-wallet-mobile/apps/user_dashboard/` (package.json, index.html)
- Modify: `claw-wallet-mobile/sdk/oko_sdk_cosmos/` (add ClawChain config)

- [ ] **Step 1: Update Expo app.json**: name → "Claw Wallet", slug → "claw-wallet", package → "io.clawchain.wallet"
- [ ] **Step 2: Add ClawChain to oko_sdk_cosmos** as first-class chain: bech32 `claw`, coin type 118, denom `uclaw`
- [ ] **Step 3: Update user_dashboard branding**: title, favicon
- [ ] **Step 4: Commit**

### Task 5.2: Create Shared ClawChain UI Package

**Files:**
- Create: `claw-wallet-mobile/packages/clawchain-ui/package.json`
- Create: `claw-wallet-mobile/packages/clawchain-ui/src/hooks/useClawChain.ts`

- [ ] **Step 1: Create package.json** with dependencies on `@clawchain/sdk`
- [ ] **Step 2: Create useClawChain hook** — initializes ClawChainClient using oko_sdk_cosmos signer adapter
- [ ] **Step 3: Add to yarn workspaces** in root package.json
- [ ] **Step 4: Commit**

### Task 5.3: Build 5 ClawChain Screens

**Files:**
- Create: `claw-wallet-mobile/packages/clawchain-ui/src/AgentDashboard.tsx`
- Create: `claw-wallet-mobile/packages/clawchain-ui/src/PrivacyShield.tsx`
- Create: `claw-wallet-mobile/packages/clawchain-ui/src/DexSwap.tsx`
- Create: `claw-wallet-mobile/packages/clawchain-ui/src/TaskManager.tsx`
- Create: `claw-wallet-mobile/packages/clawchain-ui/src/Faucet.tsx`

- [ ] **Step 1: AgentDashboard** — agent list, status badges, rewards stats, register button
- [ ] **Step 2: PrivacyShield** — shield/unshield toggle, amount input, balance display
- [ ] **Step 3: DexSwap** — pair selector, amount, simulate, swap
- [ ] **Step 4: TaskManager** — tabs (My/Available/Active), task cards, accept/complete actions
- [ ] **Step 5: Faucet** — one-tap button, tx hash display, cooldown
- [ ] **Step 6: Write component tests** for each screen
- [ ] **Step 7: Commit**

### Task 5.4: Wire Screens into Expo + Web Apps

**Files:**
- Create: `claw-wallet-mobile/sandbox/sandbox_react_native/app/(tabs)/agents.tsx`
- Create: `claw-wallet-mobile/sandbox/sandbox_react_native/app/(tabs)/privacy.tsx`
- Create: `claw-wallet-mobile/sandbox/sandbox_react_native/app/(tabs)/dex.tsx`
- Create: `claw-wallet-mobile/sandbox/sandbox_react_native/app/(tabs)/tasks.tsx`
- Modify: `claw-wallet-mobile/apps/user_dashboard/` (add nav items)

- [ ] **Step 1: Add Expo routes** using expo-router conventions
- [ ] **Step 2: Add user_dashboard nav items**
- [ ] **Step 3: Verify Expo build**: `cd sandbox/sandbox_react_native && npx expo export --platform web`
- [ ] **Step 4: Commit**

---

## Chunk 6: Paradigm Tool Verification + Seed Data

### Task 6.1: Create Seed Data Script

**Files:**
- Create: `scripts/seed-test-data.sh`

- [ ] **Step 1: Write script**

```bash
#!/bin/bash
# Seeds ClawChain with test data for all 8 modules
# Idempotent: checks before creating

CHAIN_HOME=".local-node"
BINARY="./clawchaind"
FROM="dev-account"

# Register agent
$BINARY tx agent register-agent \
  --name "test-agent-1" --endpoint "http://localhost:8080" \
  --capabilities "compute,inference" --deposit 1000000uclaw \
  --from $FROM --home $CHAIN_HOME --yes

# List marketplace skill
$BINARY tx marketplace list-skill \
  --name "data-analysis" --price 100000uclaw --category "analytics" \
  --from $FROM --home $CHAIN_HOME --yes

# Shield CLAW into privacy pool
$BINARY tx privacy shield 100000000uclaw \
  --from $FROM --home $CHAIN_HOME --yes

# Send encrypted message
$BINARY tx messaging send-message \
  --to $DEV_ADDR --content "test message" \
  --from $FROM --home $CHAIN_HOME --yes

# Endorse agent
$BINARY tx reputation endorse-agent $DEV_ADDR \
  --from $FROM --home $CHAIN_HOME --yes

echo "=== Seed data complete ==="
```

- [ ] **Step 2: Make executable**: `chmod +x scripts/seed-test-data.sh`
- [ ] **Step 3: Run against local chain to verify**
- [ ] **Step 4: Commit**

### Task 6.2: Verify Each Paradigm Tool

For each tool (artemis, cryo, flood, flux, rivet, data-portal):

- [ ] **Step 1: Boot local chain + run seed data**
- [ ] **Step 2: Run artemis** against DEX pool, verify it queries ClawChain module data
- [ ] **Step 3: Run cryo** export, verify it decodes agent/privacy/marketplace events
- [ ] **Step 4: Run flood** load test, verify it sends ClawChain-specific txs (not just bank send)
- [ ] **Step 5: Run flux** export, verify it handles custom module REST endpoints
- [ ] **Step 6: Run rivet** inspect, verify it decodes MsgRegisterAgent, MsgShield, etc.
- [ ] **Step 7: Run data-portal**, verify it serves ClawChain analytics endpoints
- [ ] **Step 8: Fix any broken tools** — connection errors, missing endpoint handling, generic-only queries
- [ ] **Step 9: Commit fixes**

---

## Chunk 7: Cross-Cutting

### Task 7.1: Proto Regeneration

- [ ] **Step 1: Regenerate all changed protos** (governance, oracle, any IBC changes)
- [ ] **Step 2: Verify build**: `go build ./...`
- [ ] **Step 3: Run full test suite**: `go test ./...`
- [ ] **Step 4: Commit**

### Task 7.2: CI Updates

**Files:**
- Modify: `.github/workflows/go-unit.yml`
- Modify: `.github/workflows/typescript-check.yml`
- Modify: `.github/workflows/integration-test.yml`
- Modify: `.github/workflows/service-builds.yml`

- [ ] **Step 1: Add `x/oracle` to Go test matrix**
- [ ] **Step 2: Add mock-executor to Go build matrix**
- [ ] **Step 3: Add clawchain-ui to TS check matrix** (if applicable)
- [ ] **Step 4: Add oracle integration tests**
- [ ] **Step 5: Commit**

### Task 7.3: App Wiring Verification

- [ ] **Step 1: Verify oracle module in app.go** — store key, module manager, begin/end block order
- [ ] **Step 2: Verify upgrades.go** — oracle v1 migration entry
- [ ] **Step 3: Run full build**: `go build ./...`
- [ ] **Step 4: Boot local chain and verify oracle module loads**: check `/clawchain/oracle/v1/params` returns defaults
- [ ] **Step 5: Run full test suite**: `go test ./... && cd sdk && npm test && cd ../web && npx vite build`
- [ ] **Step 6: Commit**

### Task 7.4: Final Verification

- [ ] **Step 1: Run all Go tests**: `go test ./...` — expect 908+ (now higher with oracle + governance additions)
- [ ] **Step 2: Run SDK tests**: `cd sdk && npm test` — expect 260+
- [ ] **Step 3: Run web build**: `cd web && npx vite build` — 0 errors
- [ ] **Step 4: Run clawd tests**: `cd cmd/clawd && npm test` — expect 559+
- [ ] **Step 5: Boot Docker stack**: `docker compose up -d` — all services healthy
- [ ] **Step 6: Boot GPU mock stack**: `docker compose --profile gpu-mock up -d`
- [ ] **Step 7: Run seed data**: `./scripts/seed-test-data.sh`
- [ ] **Step 8: Verify new endpoints respond**: oracle prices, governance tally, remote agents
- [ ] **Step 9: Final commit**

```bash
git commit -m "feat: complete all remaining code work — governance, oracle, IBC, GPU, mobile, tools"
```
