package types

import "cosmossdk.io/collections"

const (
	ModuleName    = "modelregistry"
	StoreKey      = ModuleName
	GovModuleName = "gov"
)

var ParamsKey = collections.NewPrefix("p_modelreg")
var ModelsKey = collections.NewPrefix("m_modelreg")
var ModelCountKey = collections.NewPrefix("mc_modelreg")
var ModelVersionsKey = collections.NewPrefix("mv_modelreg")
var ModelVersionCountKey = collections.NewPrefix("mvc_modelreg")
var ModelAccessKey = collections.NewPrefix("ma_modelreg")
var ModelUsageKey = collections.NewPrefix("mu_modelreg")

// Inference marketplace key prefixes
var InferenceJobsKey = collections.NewPrefix("ij_modelreg")
var InferenceJobCountKey = collections.NewPrefix("ijc_modelreg")
var InferenceProvidersKey = collections.NewPrefix("ip_modelreg")
var InferencePricingKey = collections.NewPrefix("ipr_modelreg")
