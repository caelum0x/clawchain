package types

import "cosmossdk.io/collections"

const (
	ModuleName    = "reputation"
	StoreKey      = ModuleName
	GovModuleName = "gov"
)

var ParamsKey = collections.NewPrefix("p_reputation")
var ReputationsKey = collections.NewPrefix("r_reputation")
var RatingsKey = collections.NewPrefix("ra_reputation")
var RatingCountKey = collections.NewPrefix("rac_reputation")
var EndorsementsKey = collections.NewPrefix("e_reputation")
var EndorsementCountKey = collections.NewPrefix("ec_reputation")
var HeartbeatStaleStateKey = collections.NewPrefix("hs_reputation")
var TaskSLACursorKey = collections.NewPrefix("tsc_reputation")
