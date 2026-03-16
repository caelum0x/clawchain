package keeper

import (
	"context"
	"encoding/json"

	"clawchain/x/agent/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Negotiations implements the gRPC query handler for QueryNegotiationsRequest.
// Returns all negotiations in the store.
func (q queryServer) Negotiations(ctx context.Context, req *types.QueryNegotiationsRequest) (*types.QueryNegotiationsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	var results []types.NegotiationRecord

	iter, err := q.k.Negotiations.Iterate(ctx, nil)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate negotiations")
	}
	defer iter.Close()

	for ; iter.Valid(); iter.Next() {
		kv, err := iter.KeyValue()
		if err != nil {
			continue
		}

		record, err := parseNegotiationRecord(kv.Value)
		if err != nil {
			continue
		}
		results = append(results, record)
	}

	return &types.QueryNegotiationsResponse{Negotiations: results}, nil
}

// NegotiationsByAddress implements the gRPC query handler for QueryNegotiationsByAddressRequest.
func (q queryServer) NegotiationsByAddress(ctx context.Context, req *types.QueryNegotiationsByAddressRequest) (*types.QueryNegotiationsByAddressResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.Address == "" {
		return nil, status.Error(codes.InvalidArgument, "address cannot be empty")
	}

	negotiations, err := q.k.QueryNegotiationsByAgent(ctx, req.Address)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query negotiations")
	}

	results := make([]types.NegotiationRecord, 0, len(negotiations))
	for _, neg := range negotiations {
		results = append(results, negotiationToRecord(neg))
	}

	return &types.QueryNegotiationsByAddressResponse{Negotiations: results}, nil
}

// Negotiation implements the gRPC query handler for QueryNegotiationRequest.
func (q queryServer) Negotiation(ctx context.Context, req *types.QueryNegotiationRequest) (*types.QueryNegotiationResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	neg, err := q.k.QueryNegotiation(ctx, req.Id)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "negotiation %d not found", req.Id)
	}

	record := negotiationToRecord(*neg)
	return &types.QueryNegotiationResponse{Negotiation: record}, nil
}

func negotiationToRecord(neg types.Negotiation) types.NegotiationRecord {
	history := make([]types.NegotiationRoundRecord, 0, len(neg.History))
	for _, h := range neg.History {
		history = append(history, types.NegotiationRoundRecord{
			Round:    h.Round,
			Proposer: h.Proposer,
			Budget:   h.Budget,
			Deadline: h.Deadline,
			Message:  h.Message,
			Height:   h.Height,
		})
	}
	return types.NegotiationRecord{
		Id:               neg.Id,
		Initiator:        neg.Initiator,
		Counterparty:     neg.Counterparty,
		Description:      neg.Description,
		Requirements:     neg.Requirements,
		SkillId:          neg.SkillId,
		ProposedBudget:   neg.ProposedBudget,
		ProposedDeadline: neg.ProposedDeadline,
		Status:           neg.Status,
		Round:            neg.Round,
		MaxRounds:        neg.MaxRounds,
		LastProposer:     neg.LastProposer,
		CreatedAt:        neg.CreatedAt,
		UpdatedAt:        neg.UpdatedAt,
		ExpiresAt:        neg.ExpiresAt,
		History:          history,
	}
}

func parseNegotiationRecord(jsonStr string) (types.NegotiationRecord, error) {
	var neg types.Negotiation
	if err := json.Unmarshal([]byte(jsonStr), &neg); err != nil {
		return types.NegotiationRecord{}, err
	}
	return negotiationToRecord(neg), nil
}
