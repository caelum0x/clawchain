package keeper

import (
	"context"
	"encoding/hex"
	"math/big"
	"strings"

	"clawchain/x/privacy/types"

	errorsmod "cosmossdk.io/errors"
)

// NormalizeHex canonicalizes a hex string (trim + lowercase) and returns decoded bytes.
func (k Keeper) NormalizeHex(raw string) (string, []byte, error) {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	if normalized == "" {
		return "", nil, errorsmod.Wrap(types.ErrInvalidCommitment, "hex string cannot be empty")
	}
	decoded, err := hex.DecodeString(normalized)
	if err != nil {
		return "", nil, errorsmod.Wrap(types.ErrInvalidCommitment, "invalid hex string")
	}
	if len(decoded) == 0 {
		return "", nil, errorsmod.Wrap(types.ErrInvalidCommitment, "hex value cannot be empty")
	}
	return normalized, decoded, nil
}

// ConsumeNullifiers validates and marks each nullifier as spent atomically in deterministic order.
func (k Keeper) ConsumeNullifiers(ctx context.Context, nullifierHexes []string) error {
	if len(nullifierHexes) == 0 {
		return errorsmod.Wrap(types.ErrInvalidProof, "no nullifiers provided")
	}

	normalized := make([]string, 0, len(nullifierHexes))
	seen := make(map[string]struct{}, len(nullifierHexes))
	for _, raw := range nullifierHexes {
		nfHex, _, err := k.NormalizeHex(raw)
		if err != nil {
			return errorsmod.Wrap(types.ErrInvalidProof, "invalid nullifier hex")
		}
		if _, dup := seen[nfHex]; dup {
			return errorsmod.Wrapf(types.ErrNullifierAlreadyUsed, "duplicate nullifier %s in transaction", nfHex)
		}
		seen[nfHex] = struct{}{}

		exists, err := k.Nullifiers.Has(ctx, nfHex)
		if err != nil {
			return errorsmod.Wrap(types.ErrInvalidProof, "failed to check nullifier")
		}
		if exists {
			return errorsmod.Wrapf(types.ErrNullifierAlreadyUsed, "nullifier %s", nfHex)
		}
		normalized = append(normalized, nfHex)
	}

	for _, nfHex := range normalized {
		if err := k.Nullifiers.Set(ctx, nfHex, true); err != nil {
			return errorsmod.Wrap(types.ErrInvalidProof, "failed to store nullifier")
		}
	}

	return nil
}

// ValidateKnownRoot verifies rootHex is canonical and present in historical valid roots.
func (k Keeper) ValidateKnownRoot(ctx context.Context, rootHex string) (string, error) {
	normalized, _, err := k.NormalizeHex(rootHex)
	if err != nil {
		return "", errorsmod.Wrap(types.ErrInvalidMerkleRoot, "invalid root hex")
	}

	exists, err := k.MerkleRoots.Has(ctx, normalized)
	if err != nil {
		return "", errorsmod.Wrap(types.ErrInvalidMerkleRoot, "failed to check merkle root")
	}
	if !exists {
		return "", errorsmod.Wrapf(types.ErrInvalidMerkleRoot, "root %s not recognized", normalized)
	}
	return normalized, nil
}

// AppendCommitment inserts one commitment, updates tree/root state, and records root transition.
func (k Keeper) AppendCommitment(ctx context.Context, commitmentBytes []byte) (uint64, string, string, error) {
	if len(commitmentBytes) == 0 {
		return 0, "", "", errorsmod.Wrap(types.ErrInvalidCommitment, "empty commitment")
	}

	commitmentHex := strings.ToLower(hex.EncodeToString(commitmentBytes))
	exists, err := k.CommitmentIndex.Has(ctx, commitmentHex)
	if err != nil {
		return 0, "", "", errorsmod.Wrap(types.ErrInvalidCommitment, "failed to check commitment index")
	}
	if exists {
		return 0, "", "", errorsmod.Wrapf(types.ErrInvalidCommitment, "duplicate commitment %s", commitmentHex)
	}

	leafIndex, err := k.CommitmentCount.Next(ctx)
	if err != nil {
		return 0, "", "", errorsmod.Wrap(types.ErrInvalidCommitment, "failed to get next commitment index")
	}

	if err := k.Commitments.Set(ctx, leafIndex, commitmentBytes); err != nil {
		return 0, "", "", errorsmod.Wrap(types.ErrInvalidCommitment, "failed to store commitment")
	}
	if err := k.CommitmentIndex.Set(ctx, commitmentHex, leafIndex); err != nil {
		return 0, "", "", errorsmod.Wrap(types.ErrInvalidCommitment, "failed to store commitment index")
	}

	if err := k.insertLeafAndUpdateTree(ctx, leafIndex, new(big.Int).SetBytes(commitmentBytes)); err != nil {
		return 0, "", "", errorsmod.Wrap(types.ErrMerkleTreeFull, err.Error())
	}

	root, err := k.computeRootFromState(ctx)
	if err != nil {
		return 0, "", "", errorsmod.Wrap(types.ErrInvalidCommitment, "failed to compute merkle root")
	}
	rootHex := strings.ToLower(hex.EncodeToString(root.Bytes()))
	if err := k.recordRootTransition(ctx, rootHex); err != nil {
		return 0, "", "", err
	}

	return leafIndex, commitmentHex, rootHex, nil
}

func (k Keeper) recordRootTransition(ctx context.Context, rootHex string) error {
	if err := k.MerkleRoots.Set(ctx, rootHex, true); err != nil {
		return errorsmod.Wrap(types.ErrInvalidCommitment, "failed to store merkle root")
	}

	rootHistoryIndex, err := k.RootHistoryCount.Next(ctx)
	if err != nil {
		return errorsmod.Wrap(types.ErrInvalidCommitment, "failed to allocate root history index")
	}
	if err := k.RootHistory.Set(ctx, rootHistoryIndex, rootHex); err != nil {
		return errorsmod.Wrap(types.ErrInvalidCommitment, "failed to store root history")
	}

	return nil
}
