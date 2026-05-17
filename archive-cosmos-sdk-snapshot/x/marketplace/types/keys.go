package types

import "cosmossdk.io/collections"

const (
	ModuleName    = "marketplace"
	StoreKey      = ModuleName
	GovModuleName = "gov"
)

var ParamsKey = collections.NewPrefix("p_marketplace")
var SkillsKey = collections.NewPrefix("s_marketplace")
var SkillCountKey = collections.NewPrefix("sc_marketplace")
var SkillVersionsKey = collections.NewPrefix("sv_marketplace")
var EscrowsKey = collections.NewPrefix("e_marketplace")
var EscrowCountKey = collections.NewPrefix("ec_marketplace")
var DisputesKey = collections.NewPrefix("d_marketplace")
var DisputeCountKey = collections.NewPrefix("dc_marketplace")
var PurchasesKey = collections.NewPrefix("pu_marketplace")
