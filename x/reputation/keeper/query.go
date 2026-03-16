package keeper

import "clawchain/x/reputation/types"

var _ types.QueryServer = queryServer{}

type queryServer struct {
	k Keeper
}

func NewQueryServerImpl(k Keeper) types.QueryServer {
	return queryServer{k: k}
}
