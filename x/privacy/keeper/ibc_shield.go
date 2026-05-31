package keeper

import (
	"encoding/hex"
	"fmt"
	"math/big"

	"clawchain/x/privacy/merkle"
	"clawchain/x/privacy/types"

	errorsmod "cosmossdk.io/errors"
	"cosmossdk.io/math"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// ShieldForAccount shields tokens from an account into the privacy pool.
// This is called by the IBC privacy middleware when auto-shielding is requested
// on an incoming IBC transfer.
//
// It mirrors the logic in msgServer.Shield but accepts a pre-resolved AccAddress
// and does not require a MsgShield proto message.
func (k Keeper) ShieldForAccount(ctx sdk.Context, senderAddr sdk.AccAddress, amount uint64, denom string) (string, uint64, error) {
	if amount == 0 {
		return "", 0, errorsmod.Wrap(types.ErrInvalidAmount, "amount must be greater than zero")
	}

	// The shielded pool is single-denom (the chain's native bond denom).
	// Auto-shielding a foreign IBC voucher would let it be withdrawn as the
	// native denom via Unshield, draining the pool — so only the native denom
	// may be auto-shielded. The IBC middleware treats this error as a soft
	// failure and lets the underlying transfer proceed unshielded.
	poolDenom := types.PoolDenom()
	if denom == "" {
		denom = poolDenom
	}
	if denom != poolDenom {
		return "", 0, errorsmod.Wrapf(types.ErrUnsupportedDenom,
			"pool denom is %q, got %q", poolDenom, denom)
	}
	coins := sdk.NewCoins(sdk.NewCoin(denom, math.NewIntFromUint64(amount)))

	// Send coins from the user to the module account (shielded pool).
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, senderAddr, types.ModuleName, coins); err != nil {
		return "", 0, errorsmod.Wrap(types.ErrInsufficientFunds, err.Error())
	}

	// Get the next leaf index for deterministic blinding.
	commitCount, err := k.CommitmentCount.Peek(ctx)
	if err != nil {
		commitCount = 0
	}

	amountBig := new(big.Int).SetUint64(amount)
	blinding := new(big.Int).SetUint64(commitCount + 1)

	commitment := merkle.MiMCHashPair(amountBig, blinding)
	commitmentBytes := commitment.Bytes()
	commitmentHex := hex.EncodeToString(commitmentBytes)

	// Get the next leaf index and store the commitment.
	leafIndex, err := k.CommitmentCount.Next(ctx)
	if err != nil {
		return "", 0, errorsmod.Wrap(types.ErrInvalidCommitment, "failed to get next commitment index")
	}

	if err := k.Commitments.Set(ctx, leafIndex, commitmentBytes); err != nil {
		return "", 0, errorsmod.Wrap(types.ErrInvalidCommitment, "failed to store commitment")
	}

	if err := k.CommitmentIndex.Set(ctx, commitmentHex, leafIndex); err != nil {
		return "", 0, errorsmod.Wrap(types.ErrInvalidCommitment, "failed to store commitment index")
	}

	// Insert into the on-chain Merkle tree and update nodes.
	if err := k.insertLeafAndUpdateTree(ctx, leafIndex, commitment); err != nil {
		return "", 0, errorsmod.Wrap(types.ErrMerkleTreeFull, err.Error())
	}

	// Compute and store the new Merkle root.
	root, err := k.computeRootFromState(ctx)
	if err != nil {
		return "", 0, errorsmod.Wrap(types.ErrInvalidCommitment, "failed to compute merkle root")
	}
	rootHex := hex.EncodeToString(root.Bytes())
	if err := k.MerkleRoots.Set(ctx, rootHex, true); err != nil {
		return "", 0, errorsmod.Wrap(types.ErrInvalidCommitment, "failed to store merkle root")
	}

	// Emit event.
	senderStr, _ := k.addressCodec.BytesToString(senderAddr)
	ctx.EventManager().EmitEvent(
		sdk.NewEvent(
			"ibc_shield",
			sdk.NewAttribute("receiver", senderStr),
			sdk.NewAttribute("amount", fmt.Sprintf("%d", amount)),
			sdk.NewAttribute("denom", denom),
			sdk.NewAttribute("commitment", commitmentHex),
			sdk.NewAttribute("leaf_index", fmt.Sprintf("%d", leafIndex)),
			sdk.NewAttribute("merkle_root", rootHex),
		),
	)

	return commitmentHex, leafIndex, nil
}
