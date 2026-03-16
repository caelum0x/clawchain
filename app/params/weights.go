package params

// Default simulation weights for all ClawChain custom module message types.
// These constants are referenced by simulation operation generators and
// can be overridden via the simulation parameter file.
const (
	// --- x/agent ---
	DefaultWeightMsgRegisterAgent   = 100
	DefaultWeightMsgDeregisterAgent = 20
	DefaultWeightMsgAgentAction     = 80
	DefaultWeightMsgAgentHeartbeat  = 60
	DefaultWeightMsgSubmitIntent    = 50
	DefaultWeightMsgRespondToIntent = 40
	DefaultWeightMsgFinalizeIntent  = 30
	DefaultWeightMsgDelegateTask    = 50
	DefaultWeightMsgAcceptTask      = 45
	DefaultWeightMsgCompleteTask    = 45

	// --- x/privacy ---
	DefaultWeightMsgShield               = 30
	DefaultWeightMsgUnshield             = 25
	DefaultWeightMsgPrivateTransfer      = 20
	DefaultWeightMsgBatchPrivateTransfer = 10
	DefaultWeightMsgRegisterViewKey      = 15

	// --- x/marketplace ---
	DefaultWeightMsgListSkill         = 40
	DefaultWeightMsgDelistSkill       = 15
	DefaultWeightMsgPurchaseSkill     = 35
	DefaultWeightMsgUpdateSkill       = 20
	DefaultWeightMsgCreateEscrow      = 30
	DefaultWeightMsgCompleteEscrow    = 25
	DefaultWeightMsgCompleteMilestone = 25
	DefaultWeightMsgDisputeEscrow     = 10
	DefaultWeightMsgResolveDispute    = 10

	// --- x/reputation ---
	DefaultWeightMsgRateAgent    = 50
	DefaultWeightMsgEndorseAgent = 30

	// --- x/messaging ---
	DefaultWeightMsgSendMessage = 60
	DefaultWeightMsgAckMessage  = 40

	// --- x/governance ---
	DefaultWeightMsgSubmitProposal = 30
	DefaultWeightMsgVote           = 50

	// --- x/modelregistry ---
	DefaultWeightMsgRegisterModel      = 40
	DefaultWeightMsgPublishVersion     = 30
	DefaultWeightMsgDelistModel        = 10
	DefaultWeightMsgPurchaseAccess     = 35
	DefaultWeightMsgRateModel          = 25
	DefaultWeightMsgSubmitInferenceJob = 20
	DefaultWeightMsgRenewSubscription  = 15

	// --- x/oracle ---
	DefaultWeightMsgDelegateFeeder                 = 20
	DefaultWeightMsgAggregateExchangeRatePrevote   = 40
	DefaultWeightMsgAggregateExchangeRateVote      = 40
	DefaultWeightMsgUpdateOracleParams             = 5

	// --- x/tokenfactory ---
	DefaultWeightMsgCreateDenom       = 20
	DefaultWeightMsgMint              = 30
	DefaultWeightMsgBurn              = 25
	DefaultWeightMsgSetBeforeSendHook = 5

	// --- x/clawchain (base module — params only) ---
	DefaultWeightMsgUpdateParams = 5
)
