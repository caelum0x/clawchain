package keeper

import (
	"context"
	"encoding/json"

	"clawchain/x/marketplace/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ComputeResources implements the gRPC query handler for QueryComputeResourcesRequest.
func (q queryServer) ComputeResources(ctx context.Context, req *types.QueryComputeResourcesRequest) (*types.QueryComputeResourcesResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	resources, err := q.k.QueryComputeResources(ctx, req.OnlyAvailable)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query compute resources")
	}

	records := make([]types.ComputeResourceRecord, 0, len(resources))
	for _, r := range resources {
		records = append(records, types.ComputeResourceRecord{
			Id:                 r.Id,
			Owner:              r.Owner,
			Name:               r.Name,
			Description:        r.Description,
			GpuModel:           r.GpuModel,
			GpuCount:           r.GpuCount,
			VramGb:             r.VramGb,
			CpuCores:           r.CpuCores,
			RamGb:              r.RamGb,
			StorageGb:          r.StorageGb,
			PricePerHourUclaw:  r.PricePerHourUclaw,
			MinLeaseHours:      r.MinLeaseHours,
			MaxLeaseHours:      r.MaxLeaseHours,
			Active:             r.Active,
			CurrentLessee:      r.CurrentLessee,
			LeaseExpiresAt:     r.LeaseExpiresAt,
			Region:             r.Region,
			Endpoint:           r.Endpoint,
			Tags:               r.Tags,
			TotalLeases:        r.TotalLeases,
			TotalRevenue:       r.TotalRevenue,
		})
	}

	return &types.QueryComputeResourcesResponse{Resources: records}, nil
}

// ComputeResource implements the gRPC query handler for QueryComputeResourceRequest.
func (q queryServer) ComputeResource(ctx context.Context, req *types.QueryComputeResourceRequest) (*types.QueryComputeResourceResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	resource, err := q.k.QueryComputeResource(ctx, req.Id)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "compute resource %d not found", req.Id)
	}

	record := types.ComputeResourceRecord{
		Id:                 resource.Id,
		Owner:              resource.Owner,
		Name:               resource.Name,
		Description:        resource.Description,
		GpuModel:           resource.GpuModel,
		GpuCount:           resource.GpuCount,
		VramGb:             resource.VramGb,
		CpuCores:           resource.CpuCores,
		RamGb:              resource.RamGb,
		StorageGb:          resource.StorageGb,
		PricePerHourUclaw:  resource.PricePerHourUclaw,
		MinLeaseHours:      resource.MinLeaseHours,
		MaxLeaseHours:      resource.MaxLeaseHours,
		Active:             resource.Active,
		CurrentLessee:      resource.CurrentLessee,
		LeaseExpiresAt:     resource.LeaseExpiresAt,
		Region:             resource.Region,
		Endpoint:           resource.Endpoint,
		Tags:               resource.Tags,
		TotalLeases:        resource.TotalLeases,
		TotalRevenue:       resource.TotalRevenue,
	}

	return &types.QueryComputeResourceResponse{Resource: record}, nil
}

// ComputeJobs implements the gRPC query handler for QueryComputeJobsRequest.
func (q queryServer) ComputeJobs(ctx context.Context, req *types.QueryComputeJobsRequest) (*types.QueryComputeJobsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	jobs := make([]types.ComputeJobRecord, 0)
	err := q.k.ComputeJobs.Walk(ctx, nil, func(_ uint64, value string) (bool, error) {
		var job types.ComputeJob
		if err := json.Unmarshal([]byte(value), &job); err != nil {
			return false, nil // skip malformed
		}
		if req.Address != "" && job.Submitter != req.Address && job.Provider != req.Address {
			return false, nil
		}
		if req.ResourceId != 0 && job.ResourceId != req.ResourceId {
			return false, nil
		}
		jobs = append(jobs, types.ComputeJobRecord{
			Id:            job.Id,
			ResourceId:    job.ResourceId,
			LeaseId:       job.LeaseId,
			Submitter:     job.Submitter,
			Provider:      job.Provider,
			Name:          job.Name,
			JobType:       job.JobType,
			ExecutionType: job.ExecutionType,
			DockerImage:   job.DockerImage,
			ScriptContent: job.ScriptContent,
			InputDataUri:  job.InputDataUri,
			OutputDataUri: job.OutputDataUri,
			GpuType:       job.GpuType,
			GpuCount:      job.GpuCount,
			Status:        job.Status,
			Result:        job.Result,
			ErrorMessage:  job.ErrorMessage,
			SubmittedAt:   job.SubmittedAt,
			StartedAt:     job.StartedAt,
			CompletedAt:   job.CompletedAt,
			Params:        job.Params,
		})
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query compute jobs")
	}

	return &types.QueryComputeJobsResponse{Jobs: jobs}, nil
}

// ComputeLeases implements the gRPC query handler for QueryComputeLeasesRequest.
func (q queryServer) ComputeLeases(ctx context.Context, req *types.QueryComputeLeasesRequest) (*types.QueryComputeLeasesResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	leases, err := q.k.QueryComputeLeases(ctx, "")
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query compute leases")
	}

	records := make([]types.ComputeLeaseRecord, 0, len(leases))
	for _, l := range leases {
		records = append(records, types.ComputeLeaseRecord{
			Id:             l.Id,
			ResourceId:     l.ResourceId,
			Lessee:         l.Lessee,
			Provider:       l.Provider,
			StartBlock:     l.StartBlock,
			EndBlock:       l.EndBlock,
			TotalCostUclaw: l.TotalCostUclaw,
			Status:         l.Status,
		})
	}

	return &types.QueryComputeLeasesResponse{Leases: records}, nil
}

// ComputeLeasesForAddress implements the gRPC query handler for QueryComputeLeasesForAddressRequest.
func (q queryServer) ComputeLeasesForAddress(ctx context.Context, req *types.QueryComputeLeasesForAddressRequest) (*types.QueryComputeLeasesForAddressResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.Address == "" {
		return nil, status.Error(codes.InvalidArgument, "address cannot be empty")
	}

	leases, err := q.k.QueryComputeLeases(ctx, req.Address)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query compute leases")
	}

	records := make([]types.ComputeLeaseRecord, 0, len(leases))
	for _, l := range leases {
		records = append(records, types.ComputeLeaseRecord{
			Id:             l.Id,
			ResourceId:     l.ResourceId,
			Lessee:         l.Lessee,
			Provider:       l.Provider,
			StartBlock:     l.StartBlock,
			EndBlock:       l.EndBlock,
			TotalCostUclaw: l.TotalCostUclaw,
			Status:         l.Status,
		})
	}

	return &types.QueryComputeLeasesForAddressResponse{Leases: records}, nil
}

// ProviderStats implements the gRPC query handler for QueryProviderStatsRequest.
func (q queryServer) ProviderStats(ctx context.Context, req *types.QueryProviderStatsRequest) (*types.QueryProviderStatsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.Address == "" {
		return nil, status.Error(codes.InvalidArgument, "address cannot be empty")
	}

	statsJSON, err := q.k.ProviderStats.Get(ctx, req.Address)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "provider stats not found for %s", req.Address)
	}

	var stats types.ProviderStats
	if err := json.Unmarshal([]byte(statsJSON), &stats); err != nil {
		return nil, status.Error(codes.Internal, "failed to parse provider stats")
	}

	return &types.QueryProviderStatsResponse{
		Stats: types.ProviderStatsRecord{
			Address:        stats.Address,
			TotalResources: stats.TotalResources,
			ActiveLeases:   stats.ActiveLeases,
			TotalJobs:      stats.TotalJobs,
			CompletedJobs:  stats.CompletedJobs,
			FailedJobs:     stats.FailedJobs,
			TotalRevenue:   stats.TotalRevenue,
			AvgRating:      stats.AvgRating,
			UptimeBlocks:   stats.Uptime,
			LastHeartbeat:  stats.LastHeartbeat,
		},
	}, nil
}
