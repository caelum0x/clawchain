package keeper

import (
	"context"

	"cosmossdk.io/math"

	"clawchain/x/governance/types"
)

// TallyResult holds the result of tallying a proposal's votes.
type TallyResult struct {
	YesVotes      math.Int `json:"yes_votes"`
	NoVotes       math.Int `json:"no_votes"`
	AbstainVotes  math.Int `json:"abstain_votes"`
	VetoVotes     math.Int `json:"veto_votes"`
	TotalVotes    math.Int `json:"total_votes"`
	YesPercentBps int64    `json:"yes_percent_bps"` // basis points (0-10000)
	NoPercentBps  int64    `json:"no_percent_bps"`
	AbstainPercentBps int64 `json:"abstain_percent_bps"`
	VetoPercentBps    int64 `json:"veto_percent_bps"`
	Passed        bool     `json:"passed"`
	Vetoed        bool     `json:"vetoed"`
}

// QueryTallyResult returns the tally result for a proposal including
// yes/no/abstain/veto counts, percentages, and pass/veto status.
func (k Keeper) QueryTallyResult(ctx context.Context, proposalID uint64) (*TallyResult, error) {
	proposal, err := k.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}

	totalVotes := proposal.YesVotes.Add(proposal.NoVotes).Add(proposal.AbstainVotes).Add(proposal.VetoVotes)

	result := &TallyResult{
		YesVotes:     proposal.YesVotes,
		NoVotes:      proposal.NoVotes,
		AbstainVotes: proposal.AbstainVotes,
		VetoVotes:    proposal.VetoVotes,
		TotalVotes:   totalVotes,
	}

	if totalVotes.IsPositive() {
		bps := math.NewInt(10000)
		result.YesPercentBps = proposal.YesVotes.Mul(bps).Quo(totalVotes).Int64()
		result.NoPercentBps = proposal.NoVotes.Mul(bps).Quo(totalVotes).Int64()
		result.AbstainPercentBps = proposal.AbstainVotes.Mul(bps).Quo(totalVotes).Int64()
		result.VetoPercentBps = proposal.VetoVotes.Mul(bps).Quo(totalVotes).Int64()

		// Check veto: veto_votes * 10000 > total_votes * DefaultVetoThresholdBps
		if proposal.VetoVotes.IsPositive() {
			vetoScaled := proposal.VetoVotes.Mul(math.NewInt(10000))
			totalScaled := totalVotes.Mul(math.NewInt(types.DefaultVetoThresholdBps))
			result.Vetoed = vetoScaled.GT(totalScaled)
		}

		// Check pass threshold: yes > 50% of (yes + no)
		if !result.Vetoed {
			yesAndNo := proposal.YesVotes.Add(proposal.NoVotes)
			if yesAndNo.IsPositive() {
				threshold := yesAndNo.Mul(math.NewInt(types.DefaultThresholdBps)).Quo(bps)
				result.Passed = proposal.YesVotes.GT(threshold)
			}
		}
	}

	return result, nil
}
