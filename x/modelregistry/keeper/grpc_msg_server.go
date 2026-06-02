package keeper

import (
	"context"

	"clawchain/x/modelregistry/types"

	"cosmossdk.io/math"
)

type msgServer struct {
	keeper Keeper
}

// NewMsgServerImpl returns an implementation of the MsgServer interface.
func NewMsgServerImpl(keeper Keeper) types.MsgServer {
	return &msgServer{keeper: keeper}
}

var _ types.MsgServer = msgServer{}

func (m msgServer) RegisterModel(ctx context.Context, msg *types.MsgRegisterModel) (*types.MsgRegisterModelResponse, error) {
	model := types.ModelRecord{
		Owner:                    msg.Owner,
		Name:                     msg.Name,
		Description:              msg.Description,
		Framework:                msg.Framework,
		Architecture:             msg.Architecture,
		ParameterCount:           msg.ParameterCount,
		License:                  msg.License,
		Tags:                     msg.Tags,
		StorageType:              msg.StorageType,
		StorageUri:               msg.StorageUri,
		ChecksumSha256:           msg.ChecksumSha256,
		SizeBytes:                msg.SizeBytes,
		AccessType:               msg.AccessType,
		PricePerQueryUclaw:       msg.PricePerQueryUclaw,
		PriceOneTimeUclaw:        msg.PriceOneTimeUclaw,
		PriceSubscriptionUclaw:   msg.PriceSubscriptionUclaw,
		SubscriptionPeriodBlocks: msg.SubscriptionPeriodBlocks,
	}

	modelID, err := m.keeper.RegisterModel(ctx, msg.Owner, model)
	if err != nil {
		return nil, err
	}

	return &types.MsgRegisterModelResponse{ModelId: modelID}, nil
}

func (m msgServer) PublishVersion(ctx context.Context, msg *types.MsgPublishVersion) (*types.MsgPublishVersionResponse, error) {
	version := types.ModelVersion{
		StorageUri:     msg.StorageUri,
		ChecksumSha256: msg.ChecksumSha256,
		SizeBytes:      msg.SizeBytes,
		Changelog:      msg.Changelog,
	}

	versionID, err := m.keeper.PublishVersion(ctx, msg.ModelId, msg.Caller, version)
	if err != nil {
		return nil, err
	}

	return &types.MsgPublishVersionResponse{VersionId: versionID}, nil
}

func (m msgServer) DelistModel(ctx context.Context, msg *types.MsgDelistModel) (*types.MsgDelistModelResponse, error) {
	if err := m.keeper.DelistModel(ctx, msg.ModelId, msg.Caller); err != nil {
		return nil, err
	}
	return &types.MsgDelistModelResponse{}, nil
}

func (m msgServer) PurchaseAccess(ctx context.Context, msg *types.MsgPurchaseAccess) (*types.MsgPurchaseAccessResponse, error) {
	if err := m.keeper.PurchaseAccess(ctx, msg.ModelId, msg.Buyer, msg.SubscriptionPeriods); err != nil {
		return nil, err
	}
	return &types.MsgPurchaseAccessResponse{}, nil
}

func (m msgServer) RenewSubscription(ctx context.Context, msg *types.MsgRenewSubscription) (*types.MsgRenewSubscriptionResponse, error) {
	if err := m.keeper.PurchaseAccess(ctx, msg.ModelId, msg.Buyer, msg.Periods); err != nil {
		return nil, err
	}
	return &types.MsgRenewSubscriptionResponse{}, nil
}

func (m msgServer) RateModel(ctx context.Context, msg *types.MsgRateModel) (*types.MsgRateModelResponse, error) {
	if err := m.keeper.RateModel(ctx, msg.ModelId, msg.Rater, msg.Rating); err != nil {
		return nil, err
	}
	return &types.MsgRateModelResponse{}, nil
}

func (m msgServer) SubmitInferenceJob(ctx context.Context, msg *types.MsgSubmitInferenceJob) (*types.MsgSubmitInferenceJobResponse, error) {
	payment, ok := math.NewIntFromString(msg.Payment)
	if !ok {
		payment = math.ZeroInt()
	}

	jobID, err := m.keeper.SubmitInferenceJob(ctx, msg.ModelId, msg.ModelVersion, msg.Requester, msg.Input, msg.MaxTokens, msg.Temperature, payment)
	if err != nil {
		return nil, err
	}

	return &types.MsgSubmitInferenceJobResponse{JobId: jobID}, nil
}

func (m msgServer) UpdateModel(ctx context.Context, msg *types.MsgUpdateModel) (*types.MsgUpdateModelResponse, error) {
	updates := types.ModelRecord{
		Name:               msg.Name,
		Description:        msg.Description,
		Framework:          msg.Framework,
		AccessType:         msg.AccessType,
		PricePerQueryUclaw: msg.PricePerQueryUclaw,
		PriceOneTimeUclaw:  msg.PriceOneTimeUclaw,
	}

	if err := m.keeper.UpdateModel(ctx, msg.ModelId, msg.Caller, updates); err != nil {
		return nil, err
	}
	return &types.MsgUpdateModelResponse{}, nil
}

func (m msgServer) RegisterInferenceProvider(ctx context.Context, msg *types.MsgRegisterInferenceProvider) (*types.MsgRegisterInferenceProviderResponse, error) {
	if err := m.keeper.RegisterInferenceProvider(ctx, msg.Address, msg.ModelIds, msg.MaxConcurrent, msg.Endpoint); err != nil {
		return nil, err
	}
	return &types.MsgRegisterInferenceProviderResponse{}, nil
}

func (m msgServer) SetInferencePricing(ctx context.Context, msg *types.MsgSetInferencePricing) (*types.MsgSetInferencePricingResponse, error) {
	pricePerToken, ok := math.NewIntFromString(msg.PricePerToken)
	if !ok {
		pricePerToken = math.ZeroInt()
	}
	pricePerQuery, ok := math.NewIntFromString(msg.PricePerQuery)
	if !ok {
		pricePerQuery = math.ZeroInt()
	}
	minPayment, ok := math.NewIntFromString(msg.MinPayment)
	if !ok {
		minPayment = math.ZeroInt()
	}

	if err := m.keeper.SetInferencePricing(ctx, msg.ModelId, msg.Caller, pricePerToken, pricePerQuery, minPayment, msg.MaxTokens); err != nil {
		return nil, err
	}
	return &types.MsgSetInferencePricingResponse{}, nil
}

func (m msgServer) StartInferenceJob(ctx context.Context, msg *types.MsgStartInferenceJob) (*types.MsgStartInferenceJobResponse, error) {
	if err := m.keeper.StartInferenceJob(ctx, msg.JobId, msg.Provider); err != nil {
		return nil, err
	}
	return &types.MsgStartInferenceJobResponse{}, nil
}

func (m msgServer) CompleteInferenceJob(ctx context.Context, msg *types.MsgCompleteInferenceJob) (*types.MsgCompleteInferenceJobResponse, error) {
	if err := m.keeper.CompleteInferenceJob(ctx, msg.JobId, msg.Provider, msg.Output, msg.TokensUsed); err != nil {
		return nil, err
	}
	return &types.MsgCompleteInferenceJobResponse{}, nil
}

func (m msgServer) FailInferenceJob(ctx context.Context, msg *types.MsgFailInferenceJob) (*types.MsgFailInferenceJobResponse, error) {
	if err := m.keeper.FailInferenceJob(ctx, msg.JobId, msg.Provider, msg.ErrorMsg); err != nil {
		return nil, err
	}
	return &types.MsgFailInferenceJobResponse{}, nil
}

func (m msgServer) ProviderHeartbeat(ctx context.Context, msg *types.MsgProviderHeartbeat) (*types.MsgProviderHeartbeatResponse, error) {
	if err := m.keeper.ProviderHeartbeat(ctx, msg.Address); err != nil {
		return nil, err
	}
	return &types.MsgProviderHeartbeatResponse{}, nil
}

func (m msgServer) SubmitUsageAttestation(ctx context.Context, msg *types.MsgSubmitUsageAttestation) (*types.MsgSubmitUsageAttestationResponse, error) {
	if err := m.keeper.SubmitUsageAttestation(ctx, msg.JobId, msg.Creator, msg.OutputTokens, msg.AttestationHash); err != nil {
		return nil, err
	}
	return &types.MsgSubmitUsageAttestationResponse{}, nil
}

func (m msgServer) DisputeInferenceJob(ctx context.Context, msg *types.MsgDisputeInferenceJob) (*types.MsgDisputeInferenceJobResponse, error) {
	if err := m.keeper.DisputeInferenceJob(ctx, msg.JobId, msg.Creator, msg.Reason); err != nil {
		return nil, err
	}
	return &types.MsgDisputeInferenceJobResponse{}, nil
}
