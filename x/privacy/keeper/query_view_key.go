package keeper

import (
	"context"
	"encoding/hex"
	"errors"
	"math/big"

	"clawchain/x/privacy/circuit"
	"clawchain/x/privacy/types"

	"cosmossdk.io/collections"
	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/frontend"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) ViewKey(ctx context.Context, req *types.QueryViewKeyRequest) (*types.QueryViewKeyResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.CommitmentHex == "" {
		return nil, status.Error(codes.InvalidArgument, "commitment_hex cannot be empty")
	}

	noteBytes, err := q.k.ViewKeys.Get(ctx, req.CommitmentHex)
	if err != nil {
		if errors.Is(err, collections.ErrNotFound) {
			return &types.QueryViewKeyResponse{
				Found: false,
			}, nil
		}
		return nil, status.Error(codes.Internal, "failed to query view key")
	}

	return &types.QueryViewKeyResponse{
		EncryptedNote: string(noteBytes),
		Found:         true,
	}, nil
}

func (q queryServer) VerifyAmountProof(ctx context.Context, req *types.QueryVerifyAmountProofRequest) (*types.QueryVerifyAmountProofResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}
	if req.CommitmentHex == "" {
		return nil, status.Error(codes.InvalidArgument, "commitment_hex cannot be empty")
	}
	if len(req.Proof) == 0 {
		return nil, status.Error(codes.InvalidArgument, "proof cannot be empty")
	}

	// Check that the view key VK is loaded.
	if q.k.VKs.ViewKeyVK == nil {
		return nil, status.Error(codes.FailedPrecondition, "view key verifying key not loaded")
	}

	// Deserialize the proof.
	proof, err := circuit.DeserializeProof(req.Proof)
	if err != nil {
		return &types.QueryVerifyAmountProofResponse{Valid: false}, nil
	}

	// Decode commitment hex to big.Int.
	commitmentBytes, err := hex.DecodeString(req.CommitmentHex)
	if err != nil {
		return &types.QueryVerifyAmountProofResponse{Valid: false}, nil
	}
	commitmentBigInt := new(big.Int).SetBytes(commitmentBytes)

	// Build public witness: Commitment, Amount.
	amountBigInt := new(big.Int).SetUint64(req.Amount)

	assignment := &circuit.ViewKeyCircuit{
		Commitment: commitmentBigInt,
		Amount:     amountBigInt,
	}

	publicWitness, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		return &types.QueryVerifyAmountProofResponse{Valid: false}, nil
	}

	// Verify the proof.
	err = circuit.VerifyViewKeyProof(q.k.VKs.ViewKeyVK, proof, publicWitness)
	if err != nil {
		return &types.QueryVerifyAmountProofResponse{Valid: false}, nil
	}

	return &types.QueryVerifyAmountProofResponse{Valid: true}, nil
}
