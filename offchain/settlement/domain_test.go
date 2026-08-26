package settlement

import (
	"testing"

	"cosmossdk.io/math"
)

func TestComputeSettlement(t *testing.T) {
	tests := []struct {
		name       string
		pricing    Pricing
		escrow     math.Int
		tokens     uint64
		wantPayout math.Int
		wantRefund math.Int
	}{
		{
			name:       "per-token dominates",
			pricing:    Pricing{PricePerToken: math.NewInt(10), PricePerQuery: math.NewInt(50), MinPayment: math.ZeroInt()},
			escrow:     math.NewInt(1000),
			tokens:     20, // 200 > 50
			wantPayout: math.NewInt(200),
			wantRefund: math.NewInt(800),
		},
		{
			name:       "per-query floor dominates",
			pricing:    Pricing{PricePerToken: math.NewInt(1), PricePerQuery: math.NewInt(100), MinPayment: math.ZeroInt()},
			escrow:     math.NewInt(1000),
			tokens:     10, // 10 < 100
			wantPayout: math.NewInt(100),
			wantRefund: math.NewInt(900),
		},
		{
			name:       "cost capped at escrow",
			pricing:    Pricing{PricePerToken: math.NewInt(1000), PricePerQuery: math.NewInt(0), MinPayment: math.ZeroInt()},
			escrow:     math.NewInt(500),
			tokens:     10, // 10000 capped to 500
			wantPayout: math.NewInt(500),
			wantRefund: math.NewInt(0),
		},
		{
			name:       "max-tokens cap applies",
			pricing:    Pricing{PricePerToken: math.NewInt(10), PricePerQuery: math.NewInt(0), MinPayment: math.ZeroInt(), MaxTokens: 5},
			escrow:     math.NewInt(1000),
			tokens:     100, // capped to 5 -> 50
			wantPayout: math.NewInt(50),
			wantRefund: math.NewInt(950),
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotPayout, gotRefund := ComputeSettlement(tc.pricing, tc.escrow, tc.tokens)
			if !gotPayout.Equal(tc.wantPayout) {
				t.Errorf("payout = %s, want %s", gotPayout, tc.wantPayout)
			}
			if !gotRefund.Equal(tc.wantRefund) {
				t.Errorf("refund = %s, want %s", gotRefund, tc.wantRefund)
			}
			// invariant: payout + refund == escrow
			if !gotPayout.Add(gotRefund).Equal(tc.escrow) {
				t.Errorf("payout+refund = %s, want escrow %s", gotPayout.Add(gotRefund), tc.escrow)
			}
		})
	}
}

func TestSlashRestoreReputation(t *testing.T) {
	if got := SlashReputation(10000, 1); got != 9999 {
		t.Errorf("slash 10000-1 = %d, want 9999", got)
	}
	if got := SlashReputation(0, 5); got != 0 {
		t.Errorf("slash floors at 0, got %d", got)
	}
	if got := SlashReputation(3, 5); got != 0 {
		t.Errorf("slash saturates at 0, got %d", got)
	}
	if got := RestoreReputation(9999, 1); got != 10000 {
		t.Errorf("restore 9999+1 = %d, want 10000", got)
	}
	if got := RestoreReputation(10000, 5); got != MaxReputationBps {
		t.Errorf("restore caps at max, got %d", got)
	}
	// slash then restore is identity when not saturated
	s := SlashReputation(8000, 1)
	if got := RestoreReputation(s, 1); got != 8000 {
		t.Errorf("slash+restore = %d, want 8000", got)
	}
}
