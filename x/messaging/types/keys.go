package types

import "cosmossdk.io/collections"

const (
	ModuleName    = "messaging"
	StoreKey      = ModuleName
	GovModuleName = "gov"
)

var ParamsKey = collections.NewPrefix("p_messaging")
var MessagesKey = collections.NewPrefix("m_messaging")
var MessageCountKey = collections.NewPrefix("mc_messaging")
var MessageNonceIndexKey = collections.NewPrefix("mni_messaging")
