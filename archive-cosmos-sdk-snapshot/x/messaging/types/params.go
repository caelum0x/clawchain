package types

const DefaultMaxMessageSize uint64 = 4096

func NewParams() Params {
	return Params{MaxMessageSize: DefaultMaxMessageSize}
}

func DefaultParams() Params {
	return NewParams()
}

func (p Params) Validate() error {
	return nil
}
