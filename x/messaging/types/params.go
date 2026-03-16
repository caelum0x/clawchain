package types

const DefaultMaxMessageSize uint64 = 4096

// DefaultMessageTtlBlocks is ~7 days at 6-second blocks (7*24*60*60/6 = 100800).
const DefaultMessageTtlBlocks uint64 = 100800

func NewParams() Params {
	return Params{
		MaxMessageSize:   DefaultMaxMessageSize,
		MessageTtlBlocks: DefaultMessageTtlBlocks,
	}
}

func DefaultParams() Params {
	return NewParams()
}

func (p Params) Validate() error {
	return nil
}
