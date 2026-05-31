package cli

import (
	"github.com/spf13/cobra"

	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/client/flags"
	"github.com/cosmos/cosmos-sdk/client/tx"

	"clawchain/x/tokenfactory/types"
)

// GetTxCmd returns the tokenfactory transaction commands. The module uses
// hand-crafted Osmosis-compatible message types without a generated gRPC service
// descriptor, so it cannot use AutoCLI — these commands are wired manually.
func GetTxCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:                        types.ModuleName,
		Short:                      "Tokenfactory transaction subcommands",
		DisableFlagParsing:         false,
		SuggestionsMinimumDistance: 2,
		RunE:                       client.ValidateCmd,
	}
	cmd.AddCommand(
		NewCreateDenomCmd(),
		NewMintCmd(),
		NewBurnCmd(),
	)
	return cmd
}

// NewCreateDenomCmd creates a new factory denom: factory/<creator>/<subdenom>.
func NewCreateDenomCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "create-denom [subdenom]",
		Short: "Create a new factory denom (factory/<your-address>/<subdenom>)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}
			msg := &types.MsgCreateDenom{
				Sender:   clientCtx.GetFromAddress().String(),
				Subdenom: args[0],
			}
			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), msg)
		},
	}
	flags.AddTxFlagsToCmd(cmd)
	return cmd
}

// NewMintCmd mints tokens of a factory denom to the sender (or --mint-to).
func NewMintCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "mint [amount] [denom]",
		Short: "Mint tokens of a factory denom you administer",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}
			mintTo, err := cmd.Flags().GetString("mint-to")
			if err != nil {
				return err
			}
			msg := &types.MsgMint{
				Sender:        clientCtx.GetFromAddress().String(),
				Amount:        &types.ProtoCoin{Denom: args[1], Amount: args[0]},
				MintToAddress: mintTo,
			}
			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), msg)
		},
	}
	cmd.Flags().String("mint-to", "", "address to mint to (defaults to the sender)")
	flags.AddTxFlagsToCmd(cmd)
	return cmd
}

// NewBurnCmd burns tokens of a factory denom from the sender (or --burn-from).
func NewBurnCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "burn [amount] [denom]",
		Short: "Burn tokens of a factory denom you administer",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			clientCtx, err := client.GetClientTxContext(cmd)
			if err != nil {
				return err
			}
			burnFrom, err := cmd.Flags().GetString("burn-from")
			if err != nil {
				return err
			}
			msg := &types.MsgBurn{
				Sender:          clientCtx.GetFromAddress().String(),
				Amount:          &types.ProtoCoin{Denom: args[1], Amount: args[0]},
				BurnFromAddress: burnFrom,
			}
			return tx.GenerateOrBroadcastTxCLI(clientCtx, cmd.Flags(), msg)
		},
	}
	cmd.Flags().String("burn-from", "", "address to burn from (defaults to the sender)")
	flags.AddTxFlagsToCmd(cmd)
	return cmd
}
