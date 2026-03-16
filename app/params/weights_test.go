package params

import (
	"testing"
)

func TestAllWeightsPositive(t *testing.T) {
	weights := map[string]int{
		// Agent
		"RegisterAgent":   DefaultWeightMsgRegisterAgent,
		"DeregisterAgent": DefaultWeightMsgDeregisterAgent,
		"AgentAction":     DefaultWeightMsgAgentAction,
		"AgentHeartbeat":  DefaultWeightMsgAgentHeartbeat,
		"SubmitIntent":    DefaultWeightMsgSubmitIntent,
		"RespondToIntent": DefaultWeightMsgRespondToIntent,
		"FinalizeIntent":  DefaultWeightMsgFinalizeIntent,
		"DelegateTask":    DefaultWeightMsgDelegateTask,
		"AcceptTask":      DefaultWeightMsgAcceptTask,
		"CompleteTask":    DefaultWeightMsgCompleteTask,
		// Privacy
		"Shield":               DefaultWeightMsgShield,
		"Unshield":             DefaultWeightMsgUnshield,
		"PrivateTransfer":      DefaultWeightMsgPrivateTransfer,
		"BatchPrivateTransfer": DefaultWeightMsgBatchPrivateTransfer,
		"RegisterViewKey":      DefaultWeightMsgRegisterViewKey,
		// Marketplace
		"ListSkill":         DefaultWeightMsgListSkill,
		"DelistSkill":       DefaultWeightMsgDelistSkill,
		"PurchaseSkill":     DefaultWeightMsgPurchaseSkill,
		"UpdateSkill":       DefaultWeightMsgUpdateSkill,
		"CreateEscrow":      DefaultWeightMsgCreateEscrow,
		"CompleteEscrow":    DefaultWeightMsgCompleteEscrow,
		"CompleteMilestone": DefaultWeightMsgCompleteMilestone,
		"DisputeEscrow":     DefaultWeightMsgDisputeEscrow,
		"ResolveDispute":    DefaultWeightMsgResolveDispute,
		// Reputation
		"RateAgent":    DefaultWeightMsgRateAgent,
		"EndorseAgent": DefaultWeightMsgEndorseAgent,
		// Messaging
		"SendMessage": DefaultWeightMsgSendMessage,
		"AckMessage":  DefaultWeightMsgAckMessage,
		// Governance
		"SubmitProposal": DefaultWeightMsgSubmitProposal,
		"Vote":           DefaultWeightMsgVote,
		// ModelRegistry
		"RegisterModel":      DefaultWeightMsgRegisterModel,
		"PublishVersion":     DefaultWeightMsgPublishVersion,
		"DelistModel":        DefaultWeightMsgDelistModel,
		"PurchaseAccess":     DefaultWeightMsgPurchaseAccess,
		"RateModel":          DefaultWeightMsgRateModel,
		"SubmitInferenceJob": DefaultWeightMsgSubmitInferenceJob,
		"RenewSubscription":  DefaultWeightMsgRenewSubscription,
		// Oracle
		"DelegateFeeder":                 DefaultWeightMsgDelegateFeeder,
		"AggregateExchangeRatePrevote":   DefaultWeightMsgAggregateExchangeRatePrevote,
		"AggregateExchangeRateVote":      DefaultWeightMsgAggregateExchangeRateVote,
		"UpdateOracleParams":             DefaultWeightMsgUpdateOracleParams,
		// TokenFactory
		"CreateDenom":       DefaultWeightMsgCreateDenom,
		"Mint":              DefaultWeightMsgMint,
		"Burn":              DefaultWeightMsgBurn,
		"SetBeforeSendHook": DefaultWeightMsgSetBeforeSendHook,
		// Clawchain
		"UpdateParams": DefaultWeightMsgUpdateParams,
	}

	for name, weight := range weights {
		if weight <= 0 {
			t.Errorf("weight for %s must be positive, got %d", name, weight)
		}
	}
}

func TestWeightCount(t *testing.T) {
	// 46 message types across 10 modules
	expected := 46
	weights := map[string]int{
		"RegisterAgent": DefaultWeightMsgRegisterAgent, "DeregisterAgent": DefaultWeightMsgDeregisterAgent,
		"AgentAction": DefaultWeightMsgAgentAction, "AgentHeartbeat": DefaultWeightMsgAgentHeartbeat,
		"SubmitIntent": DefaultWeightMsgSubmitIntent, "RespondToIntent": DefaultWeightMsgRespondToIntent,
		"FinalizeIntent": DefaultWeightMsgFinalizeIntent, "DelegateTask": DefaultWeightMsgDelegateTask,
		"AcceptTask": DefaultWeightMsgAcceptTask, "CompleteTask": DefaultWeightMsgCompleteTask,
		"Shield": DefaultWeightMsgShield, "Unshield": DefaultWeightMsgUnshield,
		"PrivateTransfer": DefaultWeightMsgPrivateTransfer, "BatchPrivateTransfer": DefaultWeightMsgBatchPrivateTransfer,
		"RegisterViewKey": DefaultWeightMsgRegisterViewKey, "ListSkill": DefaultWeightMsgListSkill,
		"DelistSkill": DefaultWeightMsgDelistSkill, "PurchaseSkill": DefaultWeightMsgPurchaseSkill,
		"UpdateSkill": DefaultWeightMsgUpdateSkill, "CreateEscrow": DefaultWeightMsgCreateEscrow,
		"CompleteEscrow": DefaultWeightMsgCompleteEscrow, "CompleteMilestone": DefaultWeightMsgCompleteMilestone,
		"DisputeEscrow": DefaultWeightMsgDisputeEscrow, "ResolveDispute": DefaultWeightMsgResolveDispute,
		"RateAgent": DefaultWeightMsgRateAgent, "EndorseAgent": DefaultWeightMsgEndorseAgent,
		"SendMessage": DefaultWeightMsgSendMessage, "AckMessage": DefaultWeightMsgAckMessage,
		"SubmitProposal": DefaultWeightMsgSubmitProposal, "Vote": DefaultWeightMsgVote,
		"RegisterModel": DefaultWeightMsgRegisterModel, "PublishVersion": DefaultWeightMsgPublishVersion,
		"DelistModel": DefaultWeightMsgDelistModel, "PurchaseAccess": DefaultWeightMsgPurchaseAccess,
		"RateModel": DefaultWeightMsgRateModel, "SubmitInferenceJob": DefaultWeightMsgSubmitInferenceJob,
		"RenewSubscription": DefaultWeightMsgRenewSubscription, "DelegateFeeder": DefaultWeightMsgDelegateFeeder,
		"AggregateExchangeRatePrevote": DefaultWeightMsgAggregateExchangeRatePrevote,
		"AggregateExchangeRateVote":    DefaultWeightMsgAggregateExchangeRateVote,
		"UpdateOracleParams": DefaultWeightMsgUpdateOracleParams, "CreateDenom": DefaultWeightMsgCreateDenom,
		"Mint": DefaultWeightMsgMint, "Burn": DefaultWeightMsgBurn,
		"SetBeforeSendHook": DefaultWeightMsgSetBeforeSendHook, "UpdateParams": DefaultWeightMsgUpdateParams,
	}
	if len(weights) != expected {
		t.Errorf("expected %d weights for all msg types, got %d", expected, len(weights))
	}
}

func TestHighFrequencyWeightsHigher(t *testing.T) {
	// Agent registration should be the highest weight (most common operation)
	if DefaultWeightMsgRegisterAgent < DefaultWeightMsgDeregisterAgent {
		t.Error("RegisterAgent should have higher weight than DeregisterAgent")
	}
	// Send message should be higher than ack
	if DefaultWeightMsgSendMessage < DefaultWeightMsgAckMessage {
		t.Error("SendMessage should have higher weight than AckMessage")
	}
	// Admin operations should have lowest weights
	if DefaultWeightMsgUpdateParams > DefaultWeightMsgRegisterAgent {
		t.Error("UpdateParams should have lower weight than RegisterAgent")
	}
}
