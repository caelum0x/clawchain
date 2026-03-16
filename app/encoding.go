package app

import (
	"clawchain/app/params"
)

// MakeEncodingConfig creates the EncodingConfig for ClawChain.
// This is a convenience wrapper around params.MakeEncodingConfig
// that lives in the app package for backward compatibility with
// test utilities and CLI bootstrapping code.
func MakeEncodingConfig() params.EncodingConfig {
	return params.MakeEncodingConfig()
}
