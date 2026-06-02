package keeper

import (
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"

	"clawchain/x/modelregistry/types"
)

type Keeper struct {
	storeService     corestore.KVStoreService
	cdc              codec.Codec
	addressCodec     address.Codec
	authority        []byte
	bankKeeper       types.BankKeeper
	reputationKeeper types.ReputationKeeper

	Schema            collections.Schema
	Params            collections.Item[types.ModelRegistryParams]
	Models            collections.Map[uint64, string] // ID -> JSON of ModelRecord
	ModelCount        collections.Sequence
	ModelVersions     collections.Map[string, string] // "modelId/versionId" -> JSON of ModelVersion
	ModelVersionCount collections.Sequence
	ModelAccess       collections.Map[string, string] // "modelId/address" -> JSON of ModelAccess
	ModelUsage        collections.Map[string, string] // "modelId/address" -> JSON of ModelUsageRecord

	// Inference marketplace
	InferenceJobs      collections.Map[uint64, string] // jobID -> JSON of InferenceJob
	InferenceJobCount  collections.Sequence
	InferenceProviders collections.Map[string, string] // address -> JSON of InferenceProvider
	InferencePricing   collections.Map[uint64, string] // modelID -> JSON of InferencePricing
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,
	bankKeeper types.BankKeeper,
	reputationKeeper types.ReputationKeeper,
) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService:     storeService,
		cdc:              cdc,
		addressCodec:     addressCodec,
		authority:        authority,
		bankKeeper:       bankKeeper,
		reputationKeeper: reputationKeeper,

		Params:            collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.ModelRegistryParams](cdc)),
		Models:            collections.NewMap(sb, types.ModelsKey, "models", collections.Uint64Key, collections.StringValue),
		ModelCount:        collections.NewSequence(sb, types.ModelCountKey, "model_count"),
		ModelVersions:     collections.NewMap(sb, types.ModelVersionsKey, "model_versions", collections.StringKey, collections.StringValue),
		ModelVersionCount: collections.NewSequence(sb, types.ModelVersionCountKey, "model_version_count"),
		ModelAccess:       collections.NewMap(sb, types.ModelAccessKey, "model_access", collections.StringKey, collections.StringValue),
		ModelUsage:        collections.NewMap(sb, types.ModelUsageKey, "model_usage", collections.StringKey, collections.StringValue),

		// Inference marketplace
		InferenceJobs:      collections.NewMap(sb, types.InferenceJobsKey, "inference_jobs", collections.Uint64Key, collections.StringValue),
		InferenceJobCount:  collections.NewSequence(sb, types.InferenceJobCountKey, "inference_job_count"),
		InferenceProviders: collections.NewMap(sb, types.InferenceProvidersKey, "inference_providers", collections.StringKey, collections.StringValue),
		InferencePricing:   collections.NewMap(sb, types.InferencePricingKey, "inference_pricing", collections.Uint64Key, collections.StringValue),
	}

	schema, err := sb.Build()
	if err != nil {
		panic(err)
	}
	k.Schema = schema

	return k
}

func (k Keeper) GetAuthority() []byte {
	return k.authority
}
