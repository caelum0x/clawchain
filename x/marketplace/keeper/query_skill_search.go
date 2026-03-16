package keeper

import (
	"context"
	"strings"

	"clawchain/x/marketplace/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) SkillSearch(ctx context.Context, req *types.QuerySkillSearchRequest) (*types.QuerySkillSearchResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	query := strings.ToLower(strings.TrimSpace(req.Query))
	if query == "" {
		return nil, status.Error(codes.InvalidArgument, "query cannot be empty")
	}

	skills := make([]types.SkillRecord, 0)
	err := q.k.Skills.Walk(ctx, nil, func(_ uint64, value types.SkillRecord) (bool, error) {
		if matchesSkillQuery(value, query) {
			skills = append(skills, value)
		}
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate skills")
	}

	return &types.QuerySkillSearchResponse{Skills: skills}, nil
}

func matchesSkillQuery(skill types.SkillRecord, query string) bool {
	if strings.Contains(strings.ToLower(skill.Name), query) {
		return true
	}
	if strings.Contains(strings.ToLower(skill.Description), query) {
		return true
	}
	for _, tag := range skill.Tags {
		if strings.Contains(strings.ToLower(tag), query) {
			return true
		}
	}
	return false
}
