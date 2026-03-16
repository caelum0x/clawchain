package keeper

import (
	"context"
	"fmt"

	"clawchain/x/modelregistry/types"
)

type queryServer struct {
	keeper Keeper
}

// NewQueryServerImpl returns an implementation of the QueryServer interface.
func NewQueryServerImpl(keeper Keeper) types.QueryServer {
	return &queryServer{keeper: keeper}
}

var _ types.QueryServer = queryServer{}

func (q queryServer) Model(ctx context.Context, req *types.QueryModelRequest) (*types.QueryModelResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("empty request")
	}

	model, err := q.keeper.QueryModel(ctx, req.ModelId)
	if err != nil {
		return nil, err
	}

	return &types.QueryModelResponse{Model: model}, nil
}

func (q queryServer) Models(ctx context.Context, req *types.QueryModelsRequest) (*types.QueryModelsResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("empty request")
	}

	var tags []string
	if req.Tag != "" {
		tags = []string{req.Tag}
	}

	models, err := q.keeper.QueryModels(ctx, req.Framework, tags, req.OnlyFree)
	if err != nil {
		return nil, err
	}

	// Convert value slice to pointer slice for pb compatibility
	pbModels := make([]*types.ModelRecord, len(models))
	for i := range models {
		pbModels[i] = &models[i]
	}

	return &types.QueryModelsResponse{Models: pbModels}, nil
}

func (q queryServer) ModelVersions(ctx context.Context, req *types.QueryModelVersionsRequest) (*types.QueryModelVersionsResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("empty request")
	}

	versions, err := q.keeper.QueryModelVersions(ctx, req.ModelId)
	if err != nil {
		return nil, err
	}

	// Convert value slice to pointer slice for pb compatibility
	pbVersions := make([]*types.ModelVersion, len(versions))
	for i := range versions {
		pbVersions[i] = &versions[i]
	}

	return &types.QueryModelVersionsResponse{Versions: pbVersions}, nil
}

func (q queryServer) InferenceJob(ctx context.Context, req *types.QueryInferenceJobRequest) (*types.QueryInferenceJobResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("empty request")
	}

	job, err := q.keeper.QueryInferenceJob(ctx, req.JobId)
	if err != nil {
		return nil, err
	}

	return &types.QueryInferenceJobResponse{Job: job}, nil
}

func (q queryServer) InferenceJobs(ctx context.Context, req *types.QueryInferenceJobsRequest) (*types.QueryInferenceJobsResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("empty request")
	}

	jobs, err := q.keeper.QueryInferenceJobs(ctx, req.ModelId, req.Status)
	if err != nil {
		return nil, err
	}

	// Convert value slice to pointer slice for pb compatibility
	pbJobs := make([]*types.InferenceJob, len(jobs))
	for i := range jobs {
		pbJobs[i] = &jobs[i]
	}

	return &types.QueryInferenceJobsResponse{Jobs: pbJobs}, nil
}

func (q queryServer) InferenceProviders(ctx context.Context, req *types.QueryInferenceProvidersRequest) (*types.QueryInferenceProvidersResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("empty request")
	}

	providers, err := q.keeper.QueryInferenceProviders(ctx, req.ModelId)
	if err != nil {
		return nil, err
	}

	// Convert value slice to pointer slice for pb compatibility
	pbProviders := make([]*types.InferenceProvider, len(providers))
	for i := range providers {
		pbProviders[i] = &providers[i]
	}

	return &types.QueryInferenceProvidersResponse{Providers: pbProviders}, nil
}

func (q queryServer) InferencePricing(ctx context.Context, req *types.QueryInferencePricingRequest) (*types.QueryInferencePricingResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("empty request")
	}

	pricing, err := q.keeper.QueryInferencePricing(ctx, req.ModelId)
	if err != nil {
		return nil, err
	}

	return &types.QueryInferencePricingResponse{Pricing: pricing}, nil
}

func (q queryServer) Params(ctx context.Context, req *types.QueryModelRegistryParamsRequest) (*types.QueryModelRegistryParamsResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("empty request")
	}

	// Return default params for now
	return &types.QueryModelRegistryParamsResponse{}, nil
}
