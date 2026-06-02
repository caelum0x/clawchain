package modelregistry

import (
	autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"

	"clawchain/x/modelregistry/types"
)

// AutoCLIOptions implements the autocli.HasAutoCLIConfig interface.
func (am AppModule) AutoCLIOptions() *autocliv1.ModuleOptions {
	return &autocliv1.ModuleOptions{
		Query: &autocliv1.ServiceCommandDescriptor{
			Service: types.Query_serviceDesc.ServiceName,
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod:      "Model",
					Use:            "model [model-id]",
					Short:          "Query a model by ID",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "model_id"}},
				},
				{
					RpcMethod: "Models",
					Use:       "models",
					Short:     "Query all registered models",
				},
				{
					RpcMethod:      "ModelVersions",
					Use:            "model-versions [model-id]",
					Short:          "Query all versions of a model",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "model_id"}},
				},
				{
					RpcMethod:      "InferenceJob",
					Use:            "inference-job [job-id]",
					Short:          "Query an inference job by ID",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "job_id"}},
				},
				{
					RpcMethod: "InferenceJobs",
					Use:       "inference-jobs",
					Short:     "Query inference jobs",
				},
				{
					RpcMethod: "InferenceProviders",
					Use:       "inference-providers",
					Short:     "Query registered inference providers",
				},
			},
		},
		Tx: &autocliv1.ServiceCommandDescriptor{
			Service:              types.Msg_serviceDesc.ServiceName,
			EnhanceCustomCommand: true,
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod:      "RegisterModel",
					Use:            "register-model [name] [framework] [storage-uri]",
					Short:          "Register a new AI model",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "name"}, {ProtoField: "framework"}, {ProtoField: "storage_uri"}},
				},
				{
					RpcMethod:      "PublishVersion",
					Use:            "publish-version [model-id] [storage-uri]",
					Short:          "Publish a new version of a model",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "model_id"}, {ProtoField: "storage_uri"}},
				},
				{
					RpcMethod:      "DelistModel",
					Use:            "delist-model [model-id]",
					Short:          "Delist a model",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "model_id"}},
				},
				{
					RpcMethod:      "PurchaseAccess",
					Use:            "purchase-access [model-id]",
					Short:          "Purchase access to a paid model",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "model_id"}},
				},
				{
					RpcMethod:      "RateModel",
					Use:            "rate-model [model-id] [rating]",
					Short:          "Rate a model (0-500)",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "model_id"}, {ProtoField: "rating"}},
				},
				{
					RpcMethod:      "SubmitInferenceJob",
					Use:            "submit-inference-job [model-id] [input] [payment]",
					Short:          "Submit an inference job",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "model_id"}, {ProtoField: "input"}, {ProtoField: "payment"}},
				},
				{
					RpcMethod:      "RenewSubscription",
					Use:            "renew-subscription [model-id] [periods]",
					Short:          "Renew a model subscription",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "model_id"}, {ProtoField: "periods"}},
				},
				{
					RpcMethod:      "CompleteInferenceJob",
					Use:            "complete-inference-job [job-id] [result] [tokens-used]",
					Short:          "Complete an inference job with results",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "job_id"}, {ProtoField: "output"}, {ProtoField: "tokens_used"}},
				},
				{
					RpcMethod:      "SubmitUsageAttestation",
					Use:            "submit-usage-attestation [job-id] [output-tokens] [attestation-hash]",
					Short:          "Submit a usage attestation for a completed inference job",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "job_id"}, {ProtoField: "output_tokens"}, {ProtoField: "attestation_hash"}},
				},
			},
		},
	}
}
