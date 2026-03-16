package keeper

import (
	"context"
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	errorsmod "cosmossdk.io/errors"
	"cosmossdk.io/math"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"clawchain/x/tokenfactory/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	addressCodec address.Codec
	authority    []byte
	bankKeeper   types.BankKeeper

	Schema collections.Schema

	// DenomAdmins maps full denom (factory/{creator}/{subdenom}) → admin address.
	DenomAdmins collections.Map[string, string]

	// BeforeSendHooks maps full denom → cosmwasm contract address (stored but not invoked yet).
	BeforeSendHooks collections.Map[string, string]
}

func NewKeeper(
	storeService corestore.KVStoreService,
	addressCodec address.Codec,
	authority []byte,
	bankKeeper types.BankKeeper,
) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		addressCodec: addressCodec,
		authority:    authority,
		bankKeeper:   bankKeeper,

		DenomAdmins: collections.NewMap(
			sb, types.DenomAdminsKey, "denom_admins",
			collections.StringKey, collections.StringValue,
		),

		BeforeSendHooks: collections.NewMap(
			sb, types.BeforeSendHooksKey, "before_send_hooks",
			collections.StringKey, collections.StringValue,
		),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

// GetAuthority returns the module's authority.
func (k Keeper) GetAuthority() []byte {
	return k.authority
}

// InitGenesis initializes the module's state from genesis.
func (k Keeper) InitGenesis(_ context.Context, _ types.GenesisState) error {
	return nil
}

// ExportGenesis returns the module's exported genesis.
func (k Keeper) ExportGenesis(_ context.Context) (*types.GenesisState, error) {
	return types.DefaultGenesis(), nil
}

// CreateDenom creates a new factory denom and registers the sender as admin.
func (k Keeper) CreateDenom(ctx context.Context, sender, subdenom string) (string, error) {
	denom := types.FormatDenom(sender, subdenom)

	// Check if this denom is already registered.
	has, err := k.DenomAdmins.Has(ctx, denom)
	if err != nil {
		return "", err
	}
	if has {
		return "", errorsmod.Wrapf(types.ErrDenomAlreadyExists, "denom %s already exists", denom)
	}

	// Register the sender as admin for this denom.
	if err := k.DenomAdmins.Set(ctx, denom, sender); err != nil {
		return "", err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"create_denom",
			sdk.NewAttribute("creator", sender),
			sdk.NewAttribute("new_token_denom", denom),
		),
	)

	return denom, nil
}

// MintTo mints coins to a specific address. Only the denom admin can mint.
func (k Keeper) MintTo(ctx context.Context, sender string, coin sdk.Coin, mintTo string) error {
	// Verify sender is admin.
	if err := k.assertAdmin(ctx, sender, coin.Denom); err != nil {
		return err
	}

	coins := sdk.NewCoins(coin)

	// Mint to the module account.
	if err := k.bankKeeper.MintCoins(ctx, types.ModuleName, coins); err != nil {
		return err
	}

	// If mintTo is empty or same as sender, send to sender.
	if mintTo == "" {
		mintTo = sender
	}

	recipientAddr, err := sdk.AccAddressFromBech32(mintTo)
	if err != nil {
		return errorsmod.Wrapf(types.ErrInvalidAddress, "invalid mint_to_address: %s", err)
	}

	// Transfer from module to recipient.
	if err := k.bankKeeper.SendCoinsFromModuleToAccount(ctx, types.ModuleName, recipientAddr, coins); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"tf_mint",
			sdk.NewAttribute("mint_to_address", mintTo),
			sdk.NewAttribute("amount", coin.String()),
		),
	)

	return nil
}

// BurnFrom burns coins. The sender must be the denom admin.
// If burn_from_address is empty, burns from the sender's account.
func (k Keeper) BurnFrom(ctx context.Context, sender string, coin sdk.Coin, burnFrom string) error {
	// Verify sender is admin.
	if err := k.assertAdmin(ctx, sender, coin.Denom); err != nil {
		return err
	}

	// If burnFrom is empty, burn from sender.
	if burnFrom == "" {
		burnFrom = sender
	}

	burnFromAddr, err := sdk.AccAddressFromBech32(burnFrom)
	if err != nil {
		return errorsmod.Wrapf(types.ErrInvalidAddress, "invalid burn_from_address: %s", err)
	}

	coins := sdk.NewCoins(coin)

	// Transfer from burnFrom address to module account.
	if err := k.bankKeeper.SendCoinsFromAccountToModule(ctx, burnFromAddr, types.ModuleName, coins); err != nil {
		return err
	}

	// Burn from the module account.
	if err := k.bankKeeper.BurnCoins(ctx, types.ModuleName, coins); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"tf_burn",
			sdk.NewAttribute("burn_from_address", burnFrom),
			sdk.NewAttribute("amount", coin.String()),
		),
	)

	return nil
}

// SetBeforeSendHook stores a cosmwasm contract address as the before-send hook
// for a factory denom. Only the denom admin can set this.
func (k Keeper) SetBeforeSendHook(ctx context.Context, sender, denom, cosmwasmAddress string) error {
	// Verify sender is admin.
	if err := k.assertAdmin(ctx, sender, denom); err != nil {
		return err
	}

	if cosmwasmAddress == "" {
		// Remove the hook.
		return k.BeforeSendHooks.Remove(ctx, denom)
	}

	if err := k.BeforeSendHooks.Set(ctx, denom, cosmwasmAddress); err != nil {
		return err
	}

	sdkCtx := sdk.UnwrapSDKContext(ctx)
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"set_before_send_hook",
			sdk.NewAttribute("denom", denom),
			sdk.NewAttribute("cosmwasm_address", cosmwasmAddress),
		),
	)

	return nil
}

// assertAdmin checks that the sender is the admin of the given denom.
func (k Keeper) assertAdmin(ctx context.Context, sender, denom string) error {
	admin, err := k.DenomAdmins.Get(ctx, denom)
	if err != nil {
		return errorsmod.Wrapf(types.ErrDenomNotFound, "denom %s is not registered in tokenfactory", denom)
	}
	if admin != sender {
		return errorsmod.Wrapf(types.ErrUnauthorized, "sender %s is not the admin of %s (admin: %s)", sender, denom, admin)
	}
	return nil
}

// ParseCoinFromProto converts our ProtoCoin to sdk.Coin.
func ParseCoinFromProto(pc *types.ProtoCoin) (sdk.Coin, error) {
	if pc == nil {
		return sdk.Coin{}, errorsmod.Wrap(types.ErrInvalidCoin, "coin is nil")
	}
	amount, ok := math.NewIntFromString(pc.Amount)
	if !ok {
		return sdk.Coin{}, errorsmod.Wrapf(types.ErrInvalidCoin, "invalid amount: %s", pc.Amount)
	}
	return sdk.NewCoin(pc.Denom, amount), nil
}
