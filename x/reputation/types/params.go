package types

const DefaultMaxCommentLength uint64 = 280
const DefaultHeartbeatPenaltyBps uint64 = 500
const DefaultHeartbeatRecoveryBps uint64 = 100
const DefaultTaskSlaOnTimeRewardBps uint64 = 50
const DefaultTaskSlaLatePenaltyBps uint64 = 100
const DefaultTaskSlaLatenessStepBlocks uint64 = 100
const DefaultDecayRateBps uint64 = 10          // 0.1% per interval
const DefaultDecayIntervalBlocks uint64 = 50400 // ~3.5 days at 6s blocks

func NewParams() Params {
	return Params{
		MaxCommentLength:          DefaultMaxCommentLength,
		HeartbeatPenaltyBps:       DefaultHeartbeatPenaltyBps,
		HeartbeatRecoveryBps:      DefaultHeartbeatRecoveryBps,
		TaskSlaOnTimeRewardBps:    DefaultTaskSlaOnTimeRewardBps,
		TaskSlaLatePenaltyBps:     DefaultTaskSlaLatePenaltyBps,
		TaskSlaLatenessStepBlocks: DefaultTaskSlaLatenessStepBlocks,
		DecayRateBps:              DefaultDecayRateBps,
		DecayIntervalBlocks:       DefaultDecayIntervalBlocks,
	}
}

func DefaultParams() Params {
	return NewParams()
}

func (p Params) Validate() error {
	if p.MaxCommentLength == 0 {
		return ErrCommentTooLong
	}
	if p.HeartbeatPenaltyBps > 10000 {
		return ErrInvalidScore
	}
	if p.HeartbeatRecoveryBps > 10000 {
		return ErrInvalidScore
	}
	if p.TaskSlaOnTimeRewardBps > 10000 {
		return ErrInvalidScore
	}
	if p.TaskSlaLatePenaltyBps > 10000 {
		return ErrInvalidScore
	}
	if p.TaskSlaLatenessStepBlocks == 0 {
		return ErrInvalidScore
	}
	if p.DecayRateBps > 10000 {
		return ErrInvalidScore
	}
	// DecayIntervalBlocks == 0 means decay is disabled, which is valid.
	return nil
}
