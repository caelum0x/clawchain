// Package types provides chain-wide constants and utility functions
// used across ClawChain modules. Forked from Terra Classic core/types.
package types

import (
	sdk "github.com/cosmos/cosmos-sdk/types"
)

// Denom constants
const (
	// MicroClawDenom is the base denomination (1 CLAW = 1_000_000 uclaw)
	MicroClawDenom = "uclaw"

	// MicroUSDDenom is the USD stablecoin denomination for oracle price feeds
	MicroUSDDenom = "uusd"

	// MicroKRWDenom is the KRW denomination for oracle price feeds
	MicroKRWDenom = "ukrw"

	// MicroSDRDenom is the SDR denomination for oracle price feeds
	MicroSDRDenom = "usdr"

	// MicroCNYDenom is the CNY denomination for oracle price feeds
	MicroCNYDenom = "ucny"

	// MicroJPYDenom is the JPY denomination for oracle price feeds
	MicroJPYDenom = "ujpy"

	// MicroEURDenom is the EUR denomination for oracle price feeds
	MicroEURDenom = "ueur"

	// MicroGBPDenom is the GBP denomination for oracle price feeds
	MicroGBPDenom = "ugbp"

	// MicroMNTDenom is the MNT denomination for oracle price feeds
	MicroMNTDenom = "umnt"

	// MicroUnit is 10^6
	MicroUnit = int64(1_000_000)
)

// Alias: Terra code references MicroLunaDenom; in ClawChain this is uclaw.
const MicroLunaDenom = MicroClawDenom

// Block time constants (assuming ~5 second block time)
const (
	BlocksPerMinute = uint64(12)
	BlocksPerHour   = BlocksPerMinute * 60         // 720
	BlocksPerDay    = BlocksPerHour * 24            // 17,280
	BlocksPerWeek   = BlocksPerDay * 7              // 120,960
	BlocksPerMonth  = BlocksPerDay * 30             // 518,400
	BlocksPerYear   = BlocksPerDay * 365            // 6,307,200
)

// Bech32 prefixes for ClawChain addresses
const (
	Bech32PrefixAccAddr  = "claw"
	Bech32PrefixAccPub   = "clawpub"
	Bech32PrefixValAddr  = "clawvaloper"
	Bech32PrefixValPub   = "clawvaloperpub"
	Bech32PrefixConsAddr = "clawvalcons"
	Bech32PrefixConsPub  = "clawvalconspub"

	CoinType = uint32(118)
	Purpose  = uint32(44)
)

// IsPeriodLastBlock returns true if the current block is the last block
// of the given period. Used by the oracle EndBlocker to trigger vote
// tallying and slash window processing.
func IsPeriodLastBlock(ctx sdk.Context, period uint64) bool {
	if period == 0 {
		return false
	}
	return (uint64(ctx.BlockHeight())+1)%period == 0
}
