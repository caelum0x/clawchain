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

var ComputeResourcesKey    = collections.NewPrefix("cr_marketplace")
var ComputeResourceCountKey = collections.NewPrefix("crc_marketplace")
var ComputeLeasesKey       = collections.NewPrefix("cl_marketplace")
var ComputeLeaseCountKey   = collections.NewPrefix("clc_marketplace")
var ComputeJobsKey         = collections.NewPrefix("cj_marketplace")
var ComputeJobCountKey     = collections.NewPrefix("cjc_marketplace")
var ComputeUsageKey        = collections.NewPrefix("cu_marketplace")
var ProviderStatsKey       = collections.NewPrefix("ps_marketplace")
var GPUMetricsKey          = collections.NewPrefix("gm_marketplace")
var ComputeChallengesKey   = collections.NewPrefix("cc_marketplace")
