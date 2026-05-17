package keeper

import (
	"context"

	"clawchain/x/messaging/types"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) Messages(ctx context.Context, req *types.QueryMessagesRequest) (*types.QueryMessagesResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.Address == "" {
		return nil, status.Error(codes.InvalidArgument, "address cannot be empty")
	}

	var messages []*types.MessageEntry

	err := q.k.Messages.Walk(ctx, nil, func(id uint64, record types.MessageEntry) (bool, error) {
		if record.Sender == req.Address || record.Recipient == req.Address {
			r := record
			messages = append(messages, &r)
		}
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate messages")
	}

	return &types.QueryMessagesResponse{Messages: messages}, nil
}

func (q queryServer) Conversation(ctx context.Context, req *types.QueryConversationRequest) (*types.QueryConversationResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.AddressA == "" || req.AddressB == "" {
		return nil, status.Error(codes.InvalidArgument, "both addresses are required")
	}

	var messages []*types.MessageEntry

	err := q.k.Messages.Walk(ctx, nil, func(id uint64, record types.MessageEntry) (bool, error) {
		if (record.Sender == req.AddressA && record.Recipient == req.AddressB) ||
			(record.Sender == req.AddressB && record.Recipient == req.AddressA) {
			r := record
			messages = append(messages, &r)
		}
		return false, nil
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to iterate messages")
	}

	return &types.QueryConversationResponse{Messages: messages}, nil
}
