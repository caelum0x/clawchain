package types

const DefaultMaxSkillsPerAgent uint64 = 50

func NewParams() Params {
	return Params{MaxSkillsPerAgent: DefaultMaxSkillsPerAgent}
}

func DefaultParams() Params {
	return NewParams()
}

func (p Params) Validate() error {
	return nil
}
