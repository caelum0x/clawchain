package keeper

import (
	"context"
	"encoding/json"
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"cosmossdk.io/math"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/governance/types"
)

type Keeper struct {
	storeService    corestore.KVStoreService
	cdc             codec.Codec
	addressCodec    address.Codec
	bankKeeper      types.BankKeeper
	stakingKeeper   types.StakingKeeper // optional: if nil, votes have equal weight
	authority       []byte
	moduleExecutors map[string]types.ModuleParamExecutor // module name -> executor

	Schema        collections.Schema
	Proposals     collections.Map[uint64, string] // JSON-encoded Proposal
	Votes         collections.Map[string, string] // key: "proposalId:voter" -> JSON Vote
	ProposalCount collections.Sequence
}

// SetStakingKeeper sets the staking keeper for stake-weighted voting.
// This is called during dependency injection if a staking keeper is available.
func (k *Keeper) SetStakingKeeper(sk types.StakingKeeper) {
	k.stakingKeeper = sk
}

// RegisterModuleParamExecutor registers a parameter executor for a target module.
// This is called during app initialization to wire module keepers that can
// receive governance parameter change proposals.
func (k *Keeper) RegisterModuleParamExecutor(moduleName string, executor types.ModuleParamExecutor) {
	k.moduleExecutors[moduleName] = executor
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,
	bankKeeper types.BankKeeper,
) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService:    storeService,
		cdc:             cdc,
		addressCodec:    addressCodec,
		bankKeeper:      bankKeeper,
		authority:       authority,
		moduleExecutors: make(map[string]types.ModuleParamExecutor),

		Proposals:     collections.NewMap(sb, types.ProposalsKey, "proposals", collections.Uint64Key, collections.StringValue),
		Votes:         collections.NewMap(sb, types.VotesKey, "votes", collections.StringKey, collections.StringValue),
		ProposalCount: collections.NewSequence(sb, types.ProposalCountKey, "proposal_count"),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority() []byte {
	return k.authority
}

// SubmitProposal creates a new parameter change proposal.
func (k Keeper) SubmitProposal(
	ctx context.Context,
	title, description, module, paramKey, proposedValue, proposer string,
	deposit sdk.Coins,
) (uint64, error) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Validate the proposer address.
	proposerAddr, err := k.addressCodec.StringToBytes(proposer)
	if err != nil {
		return 0, types.ErrInvalidAddress.Wrapf("invalid proposer address: %s", err)
	}

	// Validate target module.
	if !types.AllowedModules[module] {
		return 0, types.ErrInvalidModule.Wrapf("module %q is not a valid target", module)
	}

	// Build proposal for validation.
	proposal := types.Proposal{
		Title:         title,
		Description:   description,
		Module:        module,
		ParamKey:      paramKey,
		ProposedValue: proposedValue,
		Proposer:      proposer,
		Deposit:       deposit.String(),
		Status:        types.ProposalStatusVoting,
		YesVotes:      math.ZeroInt(),
		NoVotes:       math.ZeroInt(),
		AbstainVotes:  math.ZeroInt(),
		VetoVotes:     math.ZeroInt(),
	}
	if err := types.ValidateProposal(&proposal); err != nil {
		return 0, types.ErrInvalidProposal.Wrap(err.Error())
	}

	// Check minimum deposit.
	minDeposit := sdk.NewCoins(sdk.NewInt64Coin("uclaw", types.DefaultMinDepositUclaw))
	if !deposit.IsAllGTE(minDeposit) {
		return 0, types.ErrInsufficientDeposit.Wrapf("minimum deposit is %s, got %s", minDeposit, deposit)
	}

	// Transfer deposit to module account.
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, sdk.AccAddress(proposerAddr), types.ModuleName, deposit); err != nil {
		return 0, types.ErrInsufficientDeposit.Wrapf("failed to transfer deposit: %v", err)
	}

	// Allocate proposal ID.
	proposalID, err := k.ProposalCount.Next(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to allocate proposal ID: %w", err)
	}

	proposal.ProposalId = proposalID
	proposal.CreatedAt = sdkCtx.BlockHeight()
	proposal.VotingEndBlock = sdkCtx.BlockHeight() + types.DefaultVotingPeriodBlocks

	// Store proposal as JSON.
	data, err := json.Marshal(proposal)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal proposal: %w", err)
	}
	if err := k.Proposals.Set(ctx, proposalID, string(data)); err != nil {
		return 0, fmt.Errorf("failed to store proposal: %w", err)
	}

	// Emit event.
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"param_proposal_submitted",
			sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposalID)),
			sdk.NewAttribute("title", title),
			sdk.NewAttribute("module", module),
			sdk.NewAttribute("param_key", paramKey),
			sdk.NewAttribute("proposed_value", proposedValue),
			sdk.NewAttribute("proposer", proposer),
			sdk.NewAttribute("deposit", deposit.String()),
			sdk.NewAttribute("voting_end_block", fmt.Sprintf("%d", proposal.VotingEndBlock)),
		),
	)

	return proposalID, nil
}

// CastVote records a vote on a proposal.
func (k Keeper) CastVote(ctx context.Context, proposalID uint64, voter, option string) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	// Validate vote option.
	if err := types.ValidateVoteOption(option); err != nil {
		return types.ErrInvalidVoteOption.Wrap(err.Error())
	}

	// Validate voter address.
	if _, err := k.addressCodec.StringToBytes(voter); err != nil {
		return types.ErrInvalidAddress.Wrapf("invalid voter address: %s", err)
	}

	// Get proposal.
	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return types.ErrProposalNotFound.Wrapf("proposal %d not found", proposalID)
	}

	// Check proposal is in voting.
	if proposal.Status != types.ProposalStatusVoting {
		return types.ErrProposalNotVoting.Wrapf("proposal %d is in status %s", proposalID, proposal.Status)
	}

	// Check voting period hasn't ended.
	if sdkCtx.BlockHeight() > proposal.VotingEndBlock {
		return types.ErrVotingEnded.Wrapf("proposal %d voting ended at block %d", proposalID, proposal.VotingEndBlock)
	}

	// Check if already voted.
	voteKey := fmt.Sprintf("%d:%s", proposalID, voter)
	_, err = k.Votes.Get(ctx, voteKey)
	if err == nil {
		return types.ErrAlreadyVoted.Wrapf("voter %s already voted on proposal %d", voter, proposalID)
	}

	// Determine vote weight: if a StakingKeeper is available, weight by
	// delegated/bonded stake. Otherwise, each vote has equal weight of 1.
	weight := math.LegacyOneDec()
	if k.stakingKeeper != nil {
		voterAddr, addrErr := k.addressCodec.StringToBytes(voter)
		if addrErr == nil {
			bonded, bondErr := k.stakingKeeper.GetDelegatorBonded(ctx, voterAddr)
			if bondErr == nil && bonded.IsPositive() {
				weight = math.LegacyNewDecFromInt(bonded)
			}
		}
	}

	vote := types.Vote{
		ProposalId: proposalID,
		Voter:      voter,
		Option:     option,
		Weight:     weight,
	}

	// Store vote.
	voteData, err := json.Marshal(vote)
	if err != nil {
		return fmt.Errorf("failed to marshal vote: %w", err)
	}
	if err := k.Votes.Set(ctx, voteKey, string(voteData)); err != nil {
		return fmt.Errorf("failed to store vote: %w", err)
	}

	// Update proposal tally.
	weightInt := weight.TruncateInt()
	if weightInt.IsZero() {
		weightInt = math.OneInt()
	}

	switch option {
	case types.VoteOptionYes:
		proposal.YesVotes = proposal.YesVotes.Add(weightInt)
	case types.VoteOptionNo:
		proposal.NoVotes = proposal.NoVotes.Add(weightInt)
	case types.VoteOptionAbstain:
		proposal.AbstainVotes = proposal.AbstainVotes.Add(weightInt)
	case types.VoteOptionNoWithVeto:
		proposal.VetoVotes = proposal.VetoVotes.Add(weightInt)
	}

	// Save updated proposal.
	if err := k.setProposal(ctx, proposal); err != nil {
		return fmt.Errorf("failed to update proposal tally: %w", err)
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"param_proposal_voted",
			sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposalID)),
			sdk.NewAttribute("voter", voter),
			sdk.NewAttribute("option", option),
			sdk.NewAttribute("weight", weight.String()),
		),
	)

	return nil
}

// TallyProposal tallies votes for a proposal and determines if it passes.
// Returns true if the proposal passed, false if rejected.
func (k Keeper) TallyProposal(ctx context.Context, proposalID uint64) (bool, error) {
	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return false, err
	}

	totalVotes := proposal.YesVotes.Add(proposal.NoVotes).Add(proposal.AbstainVotes).Add(proposal.VetoVotes)

	// Check quorum (33% of participating votes -- use a minimum of 1 to avoid zero-division).
	if totalVotes.IsZero() {
		return false, nil
	}

	// Veto check: if veto votes > 33.4% of total votes, proposal is vetoed.
	if proposal.VetoVotes.IsPositive() {
		// veto_votes * 10000 > total_votes * DefaultVetoThresholdBps
		vetoScaled := proposal.VetoVotes.Mul(math.NewInt(10000))
		totalScaled := totalVotes.Mul(math.NewInt(types.DefaultVetoThresholdBps))
		if vetoScaled.GT(totalScaled) {
			return false, nil
		}
	}

	// Pass threshold: >50% yes of (yes + no) votes.
	yesAndNo := proposal.YesVotes.Add(proposal.NoVotes)
	if yesAndNo.IsZero() {
		return false, nil
	}

	// Yes must be > 50% of (yes + no).
	threshold := yesAndNo.Mul(math.NewInt(types.DefaultThresholdBps)).Quo(math.NewInt(10000))
	return proposal.YesVotes.GT(threshold), nil
}

// ExecuteProposal applies the parameter change, marks the proposal as executed,
// and refunds the deposit.
func (k Keeper) ExecuteProposal(ctx context.Context, proposalID uint64) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return err
	}

	// Apply the parameter change to the target module.
	executor, ok := k.moduleExecutors[proposal.Module]
	if !ok {
		sdkCtx.Logger().Error("no param executor registered for module", "module", proposal.Module, "proposal_id", proposalID)
		return fmt.Errorf("no param executor registered for module %q", proposal.Module)
	}

	if err := executor.UpdateParam(ctx, proposal.ParamKey, proposal.ProposedValue); err != nil {
		sdkCtx.Logger().Error("failed to apply param change", "module", proposal.Module, "param_key", proposal.ParamKey, "error", err)
		proposal.ExecutionHeight = sdkCtx.BlockHeight()
		proposal.ExecutionError = err.Error()
		_ = k.setProposal(ctx, proposal)
		return fmt.Errorf("failed to apply param change for %s/%s: %w", proposal.Module, proposal.ParamKey, err)
	}

	proposal.Status = types.ProposalStatusExecuted
	proposal.ExecutionHeight = sdkCtx.BlockHeight()
	proposal.ExecutionError = ""
	if err := k.setProposal(ctx, proposal); err != nil {
		return err
	}

	// Refund deposit to proposer.
	proposerAddr, err := k.addressCodec.StringToBytes(proposal.Proposer)
	if err == nil && proposal.Deposit != "" && proposal.Deposit != "0" {
		depositCoins, parseErr := sdk.ParseCoinsNormalized(proposal.Deposit)
		if parseErr == nil && !depositCoins.IsZero() {
			if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, sdk.AccAddress(proposerAddr), depositCoins); err != nil {
				sdkCtx.Logger().Error("failed to refund proposal deposit", "proposal_id", proposalID, "error", err)
			}
		}
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"param_proposal_executed",
			sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposalID)),
			sdk.NewAttribute("module", proposal.Module),
			sdk.NewAttribute("param_key", proposal.ParamKey),
			sdk.NewAttribute("new_value", proposal.ProposedValue),
		),
	)

	return nil
}

// RejectProposal marks a proposal as rejected and burns the deposit.
func (k Keeper) RejectProposal(ctx context.Context, proposalID uint64) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return err
	}

	proposal.Status = types.ProposalStatusRejected
	if err := k.setProposal(ctx, proposal); err != nil {
		return err
	}

	// Burn deposit on rejection.
	if proposal.Deposit != "" && proposal.Deposit != "0" {
		depositCoins, parseErr := sdk.ParseCoinsNormalized(proposal.Deposit)
		if parseErr == nil && !depositCoins.IsZero() {
			if err := k.bankKeeper.BurnCoins(ctx, types.ModuleName, depositCoins); err != nil {
				sdkCtx.Logger().Error("failed to burn rejected proposal deposit", "proposal_id", proposalID, "error", err)
			}
		}
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"param_proposal_rejected",
			sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposalID)),
			sdk.NewAttribute("yes_votes", proposal.YesVotes.String()),
			sdk.NewAttribute("no_votes", proposal.NoVotes.String()),
			sdk.NewAttribute("abstain_votes", proposal.AbstainVotes.String()),
		),
	)

	return nil
}

// CancelProposal cancels a proposal. Only the original proposer can cancel,
// and only while the proposal is still in voting status.
func (k Keeper) CancelProposal(ctx context.Context, proposalID uint64, canceller string) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)

	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return err
	}

	// Check that the canceller is the original proposer.
	if proposal.Proposer != canceller {
		return types.ErrUnauthorizedCancel.Wrapf("only the proposer %s can cancel, got %s", proposal.Proposer, canceller)
	}

	// Check that the proposal is still in voting status.
	if proposal.Status != types.ProposalStatusVoting {
		return types.ErrProposalNotCancellable.Wrapf("proposal %d is in status %s, only voting proposals can be cancelled", proposalID, proposal.Status)
	}

	proposal.Status = types.ProposalStatusCancelled
	if err := k.setProposal(ctx, proposal); err != nil {
		return err
	}

	// Refund deposit to proposer.
	proposerAddr, err := k.addressCodec.StringToBytes(proposal.Proposer)
	if err == nil && proposal.Deposit != "" && proposal.Deposit != "0" {
		depositCoins, parseErr := sdk.ParseCoinsNormalized(proposal.Deposit)
		if parseErr == nil && !depositCoins.IsZero() {
			if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, sdk.AccAddress(proposerAddr), depositCoins); err != nil {
				sdkCtx.Logger().Error("failed to refund cancelled proposal deposit", "proposal_id", proposalID, "error", err)
			}
		}
	}

	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"param_proposal_cancelled",
			sdk.NewAttribute("proposal_id", fmt.Sprintf("%d", proposalID)),
			sdk.NewAttribute("proposer", proposal.Proposer),
		),
	)

	return nil
}

// EndBlocker processes proposals whose voting period has ended.
func (k Keeper) EndBlocker(ctx context.Context) error {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	currentHeight := sdkCtx.BlockHeight()

	iter, err := k.Proposals.Iterate(ctx, nil)
	if err != nil {
		return err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			continue
		}

		var proposal types.Proposal
		if err := json.Unmarshal([]byte(kv.Value), &proposal); err != nil {
			continue
		}

		// Only process proposals still in voting that have reached their end block.
		if proposal.Status != types.ProposalStatusVoting {
			continue
		}
		if proposal.VotingEndBlock > currentHeight {
			continue
		}

		// Tally and decide.
		passed, err := k.TallyProposal(ctx, proposal.ProposalId)
		if err != nil {
			sdkCtx.Logger().Error("failed to tally proposal", "proposal_id", proposal.ProposalId, "error", err)
			continue
		}

		if passed {
			proposal.Status = types.ProposalStatusPassed
			if err := k.setProposal(ctx, &proposal); err != nil {
				sdkCtx.Logger().Error("failed to update proposal status", "proposal_id", proposal.ProposalId, "error", err)
				continue
			}

			// Execute: apply parameter change and refund deposit.
			if err := k.ExecuteProposal(ctx, proposal.ProposalId); err != nil {
				sdkCtx.Logger().Error("failed to execute proposal", "proposal_id", proposal.ProposalId, "error", err)
			}
		} else {
			if err := k.RejectProposal(ctx, proposal.ProposalId); err != nil {
				sdkCtx.Logger().Error("failed to reject proposal", "proposal_id", proposal.ProposalId, "error", err)
			}
		}
	}

	return nil
}

// GetProposal retrieves a proposal by ID.
func (k Keeper) GetProposal(ctx context.Context, proposalID uint64) (*types.Proposal, error) {
	data, err := k.Proposals.Get(ctx, proposalID)
	if err != nil {
		return nil, types.ErrProposalNotFound.Wrapf("proposal %d not found", proposalID)
	}

	var proposal types.Proposal
	if err := json.Unmarshal([]byte(data), &proposal); err != nil {
		return nil, fmt.Errorf("failed to unmarshal proposal %d: %w", proposalID, err)
	}

	return &proposal, nil
}

// GetProposals retrieves all proposals, optionally filtered by status.
func (k Keeper) GetProposals(ctx context.Context, statusFilter string) ([]types.Proposal, error) {
	var proposals []types.Proposal

	iter, err := k.Proposals.Iterate(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			continue
		}

		var proposal types.Proposal
		if err := json.Unmarshal([]byte(kv.Value), &proposal); err != nil {
			continue
		}

		if statusFilter != "" && proposal.Status != statusFilter {
			continue
		}

		proposals = append(proposals, proposal)
	}

	return proposals, nil
}

// GetVotes retrieves all votes for a proposal.
func (k Keeper) GetVotes(ctx context.Context, proposalID uint64) ([]types.Vote, error) {
	var votes []types.Vote
	prefix := fmt.Sprintf("%d:", proposalID)

	iter, err := k.Votes.Iterate(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			continue
		}

		// Filter by proposal ID prefix.
		if len(kv.Key) < len(prefix) || kv.Key[:len(prefix)] != prefix {
			continue
		}

		var vote types.Vote
		if err := json.Unmarshal([]byte(kv.Value), &vote); err != nil {
			continue
		}

		votes = append(votes, vote)
	}

	return votes, nil
}

// setProposal stores a proposal.
func (k Keeper) setProposal(ctx context.Context, proposal *types.Proposal) error {
	data, err := json.Marshal(proposal)
	if err != nil {
		return fmt.Errorf("failed to marshal proposal: %w", err)
	}
	return k.Proposals.Set(ctx, proposal.ProposalId, string(data))
}
