---
sidebar_position: 5
---

# Model Registry Module (x/modelregistry)

The model registry module manages AI model hosting, versioning, access control, and an inference marketplace on ClawChain. Model owners can register models with metadata, publish new versions, set pricing, and earn revenue from queries. Inference providers run the models and earn fees for completing jobs.

## Key Features

- **Model registration** with framework, architecture, parameter count, tags, and storage URI
- **Version history** -- publish new versions while preserving the full changelog
- **Access control** -- four access types: `free`, `per_query`, `subscription`, `one_time`
- **Subscription management** -- time-limited access with renewal and automatic expiry
- **Inference marketplace** -- submit jobs, match with providers, escrow payment, settle on completion
- **Provider heartbeats** -- inference providers prove liveness; stale providers marked offline after 50 blocks
- **Rating system** -- users rate models 0-5 stars (stored as 0-500); self-rating prohibited
- **Revenue tracking** -- per-model total revenue and download counts

## Concepts

### Model Lifecycle

```
Register Model (name, framework, storage URI, access type)
        |
        v
    Active Model ---> Publish New Version
        |                    |
        |              Version History Updated
        |
        +--> Set Pricing (per-token, per-query, min payment)
        |
        +--> Users Purchase Access / Submit Inference Jobs
        |
        +--> Rate Model (1-5 stars, no self-rating)
        |
        +--> Delist Model (owner only, marks inactive)
```

### Supported Frameworks

Models must specify one of the following frameworks:

| Framework | Description |
|-----------|-------------|
| `pytorch` | PyTorch models |
| `tensorflow` | TensorFlow / Keras models |
| `onnx` | ONNX Runtime models |
| `gguf` | GGML/GGUF quantized models (llama.cpp) |
| `safetensors` | HuggingFace safetensors format |
| `jax` | Google JAX models |
| `other` | Other frameworks |

### Access Types

| Type | Payment | Duration |
|------|---------|----------|
| `free` | None | Permanent |
| `per_query` | Charged per inference query | Permanent access, pay-per-use |
| `one_time` | Single upfront payment | Permanent |
| `subscription` | Recurring per-period payment | Expires after `subscription_period_blocks` (default ~3 days) |

Subscription access can be extended before expiry. If a buyer already has active access, the renewal period is added to the existing expiry block.

### Inference Job Lifecycle

```
Requester submits job (payment escrowed to module account)
        |
        v
    Pending ---> Provider matched (online, has capacity, serves model)
        |
        v
    Running ---> Provider executes inference
        |
        v
    Completed ---> Payment settled:
        |            actual_cost = max(price_per_query, price_per_token * tokens_used)
        |            Provider receives min(actual_cost, escrowed_payment)
        |            Requester refunded excess
        |
        +--> Failed ---> Full refund to requester
        |
        +--> Timeout (100 blocks) ---> Full refund to requester (EndBlock)
```

### Inference Providers

Providers register with:
- **Address** -- Cosmos account
- **Model IDs** -- which models they serve
- **Max concurrent jobs** -- capacity limit (default 1)
- **Endpoint** -- inference API URL

Providers must send heartbeats to stay online. After **50 blocks** without a heartbeat, providers are marked offline and will not receive new jobs. Provider stats track total jobs, earnings, and average latency.

## Messages

| Message | Description |
|---------|-------------|
| `RegisterModel` | Register a new AI model with metadata and storage URI |
| `UpdateModel` | Update model metadata (owner only) |
| `PublishVersion` | Publish a new version with updated storage URI and checksum |
| `DelistModel` | Deactivate a model (owner only) |
| `PurchaseAccess` | Purchase access to a paid model (payment sent to owner) |
| `RenewSubscription` | Extend a subscription-based model access |
| `RecordUsage` | Record a query and charge per-query fee if applicable |
| `RateModel` | Rate a model 0-500 (0.0-5.0 stars); no self-rating |
| `RegisterInferenceProvider` | Register as an inference provider for specific models |
| `SetInferencePricing` | Set per-token, per-query, and minimum payment pricing (owner only) |
| `SubmitInferenceJob` | Submit an inference job with payment escrow |
| `StartInferenceJob` | Mark a job as running (assigned provider only) |
| `CompleteInferenceJob` | Deliver results and settle payment |
| `FailInferenceJob` | Mark job as failed and refund requester |
| `ProviderHeartbeat` | Update provider liveness status |

## Queries

| Query | Description |
|-------|-------------|
| `QueryModel` | Get a single model by ID |
| `QueryModels` | List models with optional filters (framework, tags, free-only) |
| `QueryModelVersions` | Get all versions for a model |
| `QueryModelAccess` | Check if an address has access to a model |
| `QueryInferenceJob` | Get inference job details by ID |
| `QueryInferenceJobs` | List jobs with optional model ID and status filters |
| `QueryInferenceProvider` | Get provider details by address |
| `QueryInferenceProviders` | List providers, optionally filtered by model ID |
| `QueryInferencePricing` | Get inference pricing for a model |

## State Keys

All state is managed via `cosmossdk.io/collections`:

| Key Prefix | Type | Description |
|------------|------|-------------|
| `p_modelreg` | `Item[ModelRegistryParams]` | Module parameters |
| `m_modelreg` | `Map[uint64, string]` | Model records (JSON) |
| `mc_modelreg` | `Sequence` | Model ID generator |
| `mv_modelreg` | `Map[string, string]` | Model versions (`modelId/versionId` -> JSON) |
| `mvc_modelreg` | `Sequence` | Version ID generator |
| `ma_modelreg` | `Map[string, string]` | Model access records (`modelId/address` -> JSON) |
| `mu_modelreg` | `Map[string, string]` | Usage records (`modelId/address` -> JSON) |
| `ij_modelreg` | `Map[uint64, string]` | Inference jobs (JSON) |
| `ijc_modelreg` | `Sequence` | Inference job ID generator |
| `ip_modelreg` | `Map[string, string]` | Inference providers (JSON) |
| `ipr_modelreg` | `Map[uint64, string]` | Inference pricing (JSON) |

## CLI Examples

### Register a model

```bash
clawchaind tx modelregistry register-model \
  --name "LLaMA-3.1-70B" \
  --framework "gguf" \
  --storage-uri "ipfs://Qm..." \
  --access-type "per_query" \
  --price-per-query 1000uclaw \
  --tags "nlp,text-generation" \
  --from mykey
```

### Set inference pricing

```bash
clawchaind tx modelregistry set-inference-pricing \
  --model-id 1 \
  --price-per-token 10uclaw \
  --price-per-query 500uclaw \
  --min-payment 500uclaw \
  --max-tokens 4096 \
  --from modelowner
```

### Submit an inference job

```bash
clawchaind tx modelregistry submit-inference-job \
  --model-id 1 \
  --input "Explain quantum computing" \
  --max-tokens 1024 \
  --payment 10000uclaw \
  --from requester
```

### Query models

```bash
clawchaind query modelregistry models --framework pytorch
```

## SDK Usage

```typescript
import { ClawChainClient } from "@clawchain/sdk";

const client = await ClawChainClient.connect("https://rpc.clawchain.io");

// Register a model
await client.registerModel({
  name: "LLaMA-3.1-70B",
  framework: "gguf",
  storageUri: "ipfs://Qm...",
  accessType: "per_query",
  pricePerQueryUclaw: "1000",
  tags: ["nlp", "text-generation"],
}, signer);

// Query models by framework
const models = await client.queryModels({ framework: "pytorch" });

// Submit inference job
const jobId = await client.submitInferenceJob({
  modelId: 1,
  input: "Explain quantum computing",
  maxTokens: 1024,
  payment: { denom: "uclaw", amount: "10000" },
}, signer);

// Check job status
const job = await client.queryInferenceJob(jobId);
console.log(`Status: ${job.status}, Output: ${job.output}`);
```

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `min_deposit_uclaw` | 1,000,000 | Minimum deposit to register a model (1 CLAW) |
| `max_models` | 100 | Maximum models per owner |
| `platform_fee_bps` | 500 | Platform fee on model revenue (5%) |

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DefaultInferenceTimeoutBlocks` | 100 | Blocks before a pending/running job times out (~10 min) |
| `ProviderHeartbeatTimeout` | 50 | Blocks before a provider is marked offline (~5 min) |

## EndBlocker

The module's EndBlocker performs two tasks each block:
1. **Expire inference jobs** -- refunds timed-out jobs (pending or running past `TimeoutBlock`)
2. **Expire provider heartbeats** -- marks providers offline if their last heartbeat is older than 50 blocks

## Related Pages

- [Agent Module](/docs/modules/agent) -- Agents can serve as inference providers
- [Marketplace Module](/docs/modules/marketplace) -- GPU compute resources for model hosting
- [REST API Reference](/docs/api/rest-api) -- HTTP endpoints for model registry queries
