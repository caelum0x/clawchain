package keeper

import (
	"fmt"

	"cosmossdk.io/collections"
	"cosmossdk.io/core/address"
	corestore "cosmossdk.io/core/store"
	"github.com/cosmos/cosmos-sdk/codec"

	"clawchain/x/marketplace/types"
)

type Keeper struct {
	storeService corestore.KVStoreService
	cdc          codec.Codec
	addressCodec address.Codec
	authority    []byte
	bankKeeper   types.BankKeeper
	agentKeeper  types.AgentKeeper

	Schema        collections.Schema
	Params        collections.Item[types.Params]
	Skills        collections.Map[uint64, types.SkillRecord]
	SkillCount    collections.Sequence
	SkillVersions collections.Map[string, types.SkillVersionEntry]
	Escrows       collections.Map[uint64, types.EscrowAgreement]
	EscrowCount   collections.Sequence
	Disputes      collections.Map[uint64, types.EscrowDispute]
	DisputeCount  collections.Sequence
	Purchases     collections.Map[string, bool]

	// GPU compute marketplace
	ComputeResources     collections.Map[uint64, string] // ID -> JSON of ComputeResource
	ComputeResourceCount collections.Sequence
	ComputeLeases        collections.Map[uint64, string] // ID -> JSON of ComputeLease
	ComputeLeaseCount    collections.Sequence
	ComputeJobs          collections.Map[uint64, string] // ID -> JSON of ComputeJob
	ComputeJobCount      collections.Sequence
	ComputeUsage         collections.Map[string, string] // "leaseId:periodStart" -> JSON of UsageRecord
	ProviderStats        collections.Map[string, string] // address -> JSON of ProviderStats
	GPUMetrics           collections.Map[uint64, string] // resourceId -> JSON of GPUMetrics
	ComputeChallenges    collections.Map[uint64, string] // jobId -> JSON of ComputeChallenge
}

func NewKeeper(
	storeService corestore.KVStoreService,
	cdc codec.Codec,
	addressCodec address.Codec,
	authority []byte,
	bankKeeper types.BankKeeper,
	agentKeeper types.AgentKeeper,
) Keeper {
	if _, err := addressCodec.BytesToString(authority); err != nil {
		panic(fmt.Sprintf("invalid authority address %s: %s", authority, err))
	}

	sb := collections.NewSchemaBuilder(storeService)

	k := Keeper{
		storeService: storeService,
		cdc:          cdc,
		addressCodec: addressCodec,
		authority:    authority,
		bankKeeper:   bankKeeper,
		agentKeeper:  agentKeeper,

		Params:        collections.NewItem(sb, types.ParamsKey, "params", codec.CollValue[types.Params](cdc)),
		Skills:        collections.NewMap(sb, types.SkillsKey, "skills", collections.Uint64Key, codec.CollValue[types.SkillRecord](cdc)),
		SkillCount:    collections.NewSequence(sb, types.SkillCountKey, "skill_count"),
		SkillVersions: collections.NewMap(sb, types.SkillVersionsKey, "skill_versions", collections.StringKey, codec.CollValue[types.SkillVersionEntry](cdc)),
		Escrows:       collections.NewMap(sb, types.EscrowsKey, "escrows", collections.Uint64Key, codec.CollValue[types.EscrowAgreement](cdc)),
		EscrowCount:   collections.NewSequence(sb, types.EscrowCountKey, "escrow_count"),
		Disputes:      collections.NewMap(sb, types.DisputesKey, "disputes", collections.Uint64Key, codec.CollValue[types.EscrowDispute](cdc)),
		DisputeCount:  collections.NewSequence(sb, types.DisputeCountKey, "dispute_count"),
		Purchases:     collections.NewMap(sb, types.PurchasesKey, "purchases", collections.StringKey, collections.BoolValue),

		// GPU compute marketplace
		ComputeResources:     collections.NewMap(sb, types.ComputeResourcesKey, "compute_resources", collections.Uint64Key, collections.StringValue),
		ComputeResourceCount: collections.NewSequence(sb, types.ComputeResourceCountKey, "compute_resource_count"),
		ComputeLeases:        collections.NewMap(sb, types.ComputeLeasesKey, "compute_leases", collections.Uint64Key, collections.StringValue),
		ComputeLeaseCount:    collections.NewSequence(sb, types.ComputeLeaseCountKey, "compute_lease_count"),
		ComputeJobs:          collections.NewMap(sb, types.ComputeJobsKey, "compute_jobs", collections.Uint64Key, collections.StringValue),
		ComputeJobCount:      collections.NewSequence(sb, types.ComputeJobCountKey, "compute_job_count"),
		ComputeUsage:         collections.NewMap(sb, types.ComputeUsageKey, "compute_usage", collections.StringKey, collections.StringValue),
		ProviderStats:        collections.NewMap(sb, types.ProviderStatsKey, "provider_stats", collections.StringKey, collections.StringValue),
		GPUMetrics:           collections.NewMap(sb, types.GPUMetricsKey, "gpu_metrics", collections.Uint64Key, collections.StringValue),
		ComputeChallenges:    collections.NewMap(sb, types.ComputeChallengesKey, "compute_challenges", collections.Uint64Key, collections.StringValue),
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
