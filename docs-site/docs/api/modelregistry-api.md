---
sidebar_position: 5
title: Model Registry API
---

# Model Registry Module API

The Model Registry module manages AI model registration, versioning, access control, inference job lifecycle, and provider management on ClawChain.

**Proto package:** `clawchain.modelregistry.v1`
**Base path:** `/clawchain/modelregistry/v1`

---

## Query Endpoints

### GET /clawchain/modelregistry/v1/params

Returns the model registry module parameters.

**Response:**

```json
{
  "params": {
    "max_model_name_length": 64,
    "max_description_length": 1024,
    "min_model_deposit_uclaw": "100000"
  }
}
```

---

### Models

#### GET /clawchain/modelregistry/v1/models

Returns all registered models, with optional filters.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `framework` | string | Filter by framework (e.g., `pytorch`, `tensorflow`) |
| `tag` | string | Filter by tag |
| `only_free` | bool | If true, only return free-access models |

**Response:**

```json
{
  "models": [
    {
      "id": "1",
      "owner": "claw1owner...",
      "name": "llama-70b-clawchain",
      "description": "Fine-tuned Llama 70B for ClawChain agent tasks",
      "framework": "pytorch",
      "architecture": "transformer",
      "parameter_count": "70000000000",
      "license": "apache-2.0",
      "tags": ["llm", "text-generation", "agent"],
      "storage_type": "ipfs",
      "storage_uri": "ipfs://QmABC123...",
      "checksum_sha256": "abc123def456...",
      "size_bytes": "140000000000",
      "access_type": "paid_per_query",
      "price_per_query_uclaw": "100",
      "price_one_time_uclaw": "0",
      "active": true,
      "current_version": "3",
      "total_downloads": "1500",
      "total_revenue": "150000",
      "rating": 450,
      "rating_count": 25,
      "created_at": "1741305600",
      "updated_at": "1741400000",
      "price_subscription_uclaw": "50000",
      "subscription_period_blocks": "43200"
    }
  ]
}
```

**Access Type Values:** `free`, `paid_per_query`, `paid_one_time`, `subscription`

#### GET /clawchain/modelregistry/v1/model/\{model_id\}

Returns a single model by ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `model_id` | uint64 | Model ID |

**Response:**

```json
{
  "model": { ... }
}
```

#### GET /clawchain/modelregistry/v1/model/\{model_id\}/versions

Returns all versions of a model.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `model_id` | uint64 | Model ID |

**Response:**

```json
{
  "versions": [
    {
      "id": "1",
      "model_id": "1",
      "version": "1",
      "storage_uri": "ipfs://QmVersion1...",
      "checksum_sha256": "aaa111...",
      "size_bytes": "140000000000",
      "changelog": "Initial release",
      "created_at": "1741305600"
    },
    {
      "id": "2",
      "model_id": "1",
      "version": "2",
      "storage_uri": "ipfs://QmVersion2...",
      "checksum_sha256": "bbb222...",
      "size_bytes": "141000000000",
      "changelog": "Improved instruction following",
      "created_at": "1741400000"
    }
  ]
}
```

---

### Inference

#### GET /clawchain/modelregistry/v1/inference/jobs

Returns inference jobs, optionally filtered.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `model_id` | uint64 | Filter by model ID |
| `status` | string | Filter by status |

**Response:**

```json
{
  "jobs": [
    {
      "job_id": "1",
      "model_id": "1",
      "model_version": "3",
      "requester": "claw1requester...",
      "provider": "claw1provider...",
      "input": "Explain how ClawChain privacy works",
      "output": "ClawChain uses a Pedersen commitment scheme...",
      "status": "completed",
      "max_tokens": "2048",
      "temperature": "0.7",
      "payment": "100",
      "gas_used": "150000",
      "created_at": "1741305600",
      "started_at": "1741305610",
      "completed_at": "1741305615",
      "timeout_block": "55000",
      "error_msg": ""
    }
  ]
}
```

**Job Status Values:** `pending`, `running`, `completed`, `failed`, `timeout`

#### GET /clawchain/modelregistry/v1/inference/job/\{job_id\}

Returns a single inference job by ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | uint64 | Job ID |

#### GET /clawchain/modelregistry/v1/inference/providers

Returns all registered inference providers, optionally filtered by model.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `model_id` | uint64 | Filter by model ID (0 = all providers) |

**Response:**

```json
{
  "providers": [
    {
      "address": "claw1provider...",
      "model_ids": ["1", "5", "12"],
      "max_concurrent": "10",
      "active_jobs": "3",
      "total_jobs": "500",
      "total_earnings": "50000",
      "avg_latency_ms": "250",
      "endpoint": "https://inference.provider.com:8080",
      "is_online": true,
      "last_heartbeat": "1741400000"
    }
  ]
}
```

#### GET /clawchain/modelregistry/v1/inference/pricing/\{model_id\}

Returns inference pricing for a model.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `model_id` | uint64 | Model ID |

**Response:**

```json
{
  "pricing": {
    "model_id": "1",
    "price_per_token": "1",
    "price_per_query": "100",
    "min_payment": "50",
    "max_tokens": "4096"
  }
}
```

---

## Transaction Messages

### MsgRegisterModel

Registers a new AI model on the chain.

**Type URL:** `/clawchain.modelregistry.v1.MsgRegisterModel`
**Signer:** `owner`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgRegisterModel",
  "owner": "claw1owner...",
  "name": "llama-70b-clawchain",
  "description": "Fine-tuned Llama 70B",
  "framework": "pytorch",
  "architecture": "transformer",
  "parameter_count": "70000000000",
  "license": "apache-2.0",
  "tags": ["llm", "text-generation"],
  "storage_type": "ipfs",
  "storage_uri": "ipfs://QmABC123...",
  "checksum_sha256": "abc123...",
  "size_bytes": "140000000000",
  "access_type": "paid_per_query",
  "price_per_query_uclaw": "100",
  "price_one_time_uclaw": "0"
}
```

**Response:** `{ "model_id": "1" }`

### MsgUpdateModel

Updates an existing model's metadata (owner only).

**Type URL:** `/clawchain.modelregistry.v1.MsgUpdateModel`
**Signer:** `caller`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgUpdateModel",
  "caller": "claw1owner...",
  "model_id": "1",
  "name": "llama-70b-clawchain-v2",
  "description": "Updated description",
  "framework": "pytorch",
  "access_type": "subscription",
  "price_per_query_uclaw": "0",
  "price_one_time_uclaw": "0"
}
```

### MsgPublishVersion

Publishes a new version of a model (owner only).

**Type URL:** `/clawchain.modelregistry.v1.MsgPublishVersion`
**Signer:** `caller`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgPublishVersion",
  "caller": "claw1owner...",
  "model_id": "1",
  "storage_uri": "ipfs://QmNewVersion...",
  "checksum_sha256": "def456...",
  "size_bytes": "141000000000",
  "changelog": "Improved instruction following and reduced hallucination"
}
```

**Response:** `{ "version_id": "2" }`

### MsgDelistModel

Deactivates a model (owner only).

**Type URL:** `/clawchain.modelregistry.v1.MsgDelistModel`
**Signer:** `caller`

### MsgPurchaseAccess

Purchases access to a paid model.

**Type URL:** `/clawchain.modelregistry.v1.MsgPurchaseAccess`
**Signer:** `buyer`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgPurchaseAccess",
  "buyer": "claw1buyer...",
  "model_id": "1",
  "subscription_periods": "1"
}
```

### MsgRenewSubscription

Renews an existing subscription.

**Type URL:** `/clawchain.modelregistry.v1.MsgRenewSubscription`
**Signer:** `buyer`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgRenewSubscription",
  "buyer": "claw1buyer...",
  "model_id": "1",
  "periods": "3"
}
```

**Response:** `{ "new_expiry_height": "150000" }`

### MsgRateModel

Rates a model (1-5 stars, stored as 100-500 in basis points).

**Type URL:** `/clawchain.modelregistry.v1.MsgRateModel`
**Signer:** `rater`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgRateModel",
  "rater": "claw1rater...",
  "model_id": "1",
  "rating": 4
}
```

### MsgRegisterInferenceProvider

Registers as an inference provider for one or more models.

**Type URL:** `/clawchain.modelregistry.v1.MsgRegisterInferenceProvider`
**Signer:** `address`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgRegisterInferenceProvider",
  "address": "claw1provider...",
  "model_ids": ["1", "5"],
  "max_concurrent": "10",
  "endpoint": "https://inference.provider.com:8080"
}
```

### MsgSetInferencePricing

Sets inference pricing for a model (model owner only).

**Type URL:** `/clawchain.modelregistry.v1.MsgSetInferencePricing`
**Signer:** `caller`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgSetInferencePricing",
  "caller": "claw1owner...",
  "model_id": "1",
  "price_per_token": "1",
  "price_per_query": "100",
  "min_payment": "50",
  "max_tokens": "4096"
}
```

### MsgSubmitInferenceJob

Submits an inference job request. Payment is locked until the job completes.

**Type URL:** `/clawchain.modelregistry.v1.MsgSubmitInferenceJob`
**Signer:** `requester`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgSubmitInferenceJob",
  "requester": "claw1requester...",
  "model_id": "1",
  "model_version": "3",
  "input": "Explain how ClawChain privacy works in simple terms",
  "max_tokens": "2048",
  "temperature": "0.7",
  "payment": "200"
}
```

**Response:** `{ "job_id": "1" }`

### MsgStartInferenceJob

Marks a pending inference job as running (provider only).

**Type URL:** `/clawchain.modelregistry.v1.MsgStartInferenceJob`
**Signer:** `provider`

### MsgCompleteInferenceJob

Completes an inference job with results (provider only). Payment is released.

**Type URL:** `/clawchain.modelregistry.v1.MsgCompleteInferenceJob`
**Signer:** `provider`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgCompleteInferenceJob",
  "provider": "claw1provider...",
  "job_id": "1",
  "output": "ClawChain uses a Pedersen commitment scheme with...",
  "tokens_used": "150"
}
```

### MsgFailInferenceJob

Marks a job as failed (provider only). Payment is refunded.

**Type URL:** `/clawchain.modelregistry.v1.MsgFailInferenceJob`
**Signer:** `provider`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgFailInferenceJob",
  "provider": "claw1provider...",
  "job_id": "1",
  "error_msg": "Model out of memory"
}
```

### MsgProviderHeartbeat

Sends a heartbeat from an inference provider to signal liveness.

**Type URL:** `/clawchain.modelregistry.v1.MsgProviderHeartbeat`
**Signer:** `address`

```json
{
  "@type": "/clawchain.modelregistry.v1.MsgProviderHeartbeat",
  "address": "claw1provider..."
}
```
