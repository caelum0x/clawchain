package types

const (
	// DefaultMaxPrivacyTxPerBlock is the default maximum number of privacy
	// transactions allowed per block. This prevents DoS attacks via
	// computationally expensive ZK proof verifications.
	DefaultMaxPrivacyTxPerBlock uint64 = 50

	// DefaultMinShieldAmount is the minimum amount (in uclaw) that can be
	// shielded in a single transaction. This prevents dust-shield attacks
	// that bloat the Merkle tree with trivial commitments.
	DefaultMinShieldAmount uint64 = 1000

	// DefaultAutoShieldThreshold is the minimum transfer amount (in the
	// transferred denom's base unit) that triggers auto-shielding via IBC.
	// Transfers below this threshold are not auto-shielded even if the memo
	// requests it. Set to 0 to auto-shield any amount.
	DefaultAutoShieldThreshold uint64 = 0

	// DefaultAutoShieldMode controls auto-shielding behaviour for IBC
	// transfers. Values: "off", "memo_only", "all", "threshold_only".
	// Default is "memo_only" — only auto-shield when the memo requests it.
	DefaultAutoShieldMode string = "memo_only"
)

// NewParams creates a new Params instance.
func NewParams() Params {
	return Params{
		MaxPrivacyTxPerBlock: DefaultMaxPrivacyTxPerBlock,
	}
}

// DefaultParams returns a default set of parameters.
func DefaultParams() Params {
	return NewParams()
}

// Validate validates the set of params.
func (p Params) Validate() error {
	return nil
}

// GetMinShieldAmount returns the minimum shield amount from params.
// Since MinShieldAmount is not yet in the protobuf Params struct,
// this returns the default value. Once the proto is regenerated
// with the field, this will read from the param.
func GetMinShieldAmount() uint64 {
	return DefaultMinShieldAmount
}

// GetAutoShieldThreshold returns the auto-shield threshold.
func GetAutoShieldThreshold() uint64 {
	return DefaultAutoShieldThreshold
}

// GetAutoShieldMode returns the auto-shield mode.
func GetAutoShieldMode() string {
	return DefaultAutoShieldMode
}
