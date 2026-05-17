"""ClawChain load test configuration."""

from __future__ import annotations

import os
import typing
from dataclasses import dataclass, field


@dataclass
class ChainConfig:
    """Connection and identity settings for a ClawChain node."""

    rpc_url: str = "http://localhost:26657"
    rest_url: str = "http://localhost:1317"
    chain_id: str = "clawchain-local"
    denom: str = "uclaw"
    prefix: str = "claw"
    timeout: float = 10.0

    @classmethod
    def from_env(cls) -> "ChainConfig":
        """Build a ``ChainConfig`` from environment variables.

        Recognised variables (all optional, defaults used when absent):
            CLAWCHAIN_RPC_URL
            CLAWCHAIN_REST_URL
            CLAWCHAIN_CHAIN_ID
            CLAWCHAIN_DENOM
            CLAWCHAIN_PREFIX
            CLAWCHAIN_TIMEOUT
        """
        return cls(
            rpc_url=os.getenv("CLAWCHAIN_RPC_URL", "http://localhost:26657"),
            rest_url=os.getenv("CLAWCHAIN_REST_URL", "http://localhost:1317"),
            chain_id=os.getenv("CLAWCHAIN_CHAIN_ID", "clawchain-local"),
            denom=os.getenv("CLAWCHAIN_DENOM", "uclaw"),
            prefix=os.getenv("CLAWCHAIN_PREFIX", "claw"),
            timeout=float(os.getenv("CLAWCHAIN_TIMEOUT", "10.0")),
        )


# -----------------------------------------------------------------
# Test accounts
# -----------------------------------------------------------------


@dataclass
class TestAccount:
    """A test account used for load testing transactions."""

    name: str
    address: str
    mnemonic: str = ""


# Default dev account shipped with local-node genesis.
DEFAULT_DEV_ACCOUNT = TestAccount(
    name="dev-account",
    address="claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h",
    mnemonic="",
)

# Synthetic accounts generated for concurrent load tests.
# In a real deployment these would be funded from the faucet.
DEFAULT_TEST_ACCOUNTS: typing.List[TestAccount] = [
    TestAccount(name="load-test-0", address="claw1loadtest0placeholder000000000000000000"),
    TestAccount(name="load-test-1", address="claw1loadtest1placeholder000000000000000000"),
    TestAccount(name="load-test-2", address="claw1loadtest2placeholder000000000000000000"),
    TestAccount(name="load-test-3", address="claw1loadtest3placeholder000000000000000000"),
]


# -----------------------------------------------------------------
# Scenario parameters
# -----------------------------------------------------------------


@dataclass
class ScenarioParams:
    """Tuneable parameters for load test scenarios."""

    # How long to run each scenario (seconds).
    duration_s: float = 10.0

    # Number of concurrent workers.
    concurrency: int = 4

    # Target requests per second (0 = unlimited / saturation).
    target_rps: int = 0

    # Pause between requests per worker (seconds).  Ignored when
    # *target_rps* is non-zero.
    think_time_s: float = 0.0

    # Maximum number of requests (0 = no limit, use duration).
    max_requests: int = 0

    # Warm-up period before collecting metrics (seconds).
    warmup_s: float = 0.0

    @classmethod
    def from_env(cls) -> "ScenarioParams":
        """Build from ``CLAWCHAIN_SCENARIO_*`` environment variables."""
        return cls(
            duration_s=float(os.getenv("CLAWCHAIN_SCENARIO_DURATION", "10.0")),
            concurrency=int(os.getenv("CLAWCHAIN_SCENARIO_CONCURRENCY", "4")),
            target_rps=int(os.getenv("CLAWCHAIN_SCENARIO_TARGET_RPS", "0")),
            think_time_s=float(os.getenv("CLAWCHAIN_SCENARIO_THINK_TIME", "0.0")),
            max_requests=int(os.getenv("CLAWCHAIN_SCENARIO_MAX_REQUESTS", "0")),
            warmup_s=float(os.getenv("CLAWCHAIN_SCENARIO_WARMUP", "0.0")),
        )


# -----------------------------------------------------------------
# REST endpoint catalogues (used by scenarios and the client)
# -----------------------------------------------------------------


# Agent module query endpoints.
AGENT_REST_ENDPOINTS: typing.List[str] = [
    "/clawchain/agent/v1/params",
    "/clawchain/agent/v1/live",
    "/clawchain/agent/v1/remote_agents",
    "/clawchain/agent/v1/negotiations",
]

# Privacy module query endpoints.
PRIVACY_REST_ENDPOINTS: typing.List[str] = [
    "/clawchain/privacy/v1/params",
    "/clawchain/privacy/v1/merkle_root",
    "/clawchain/privacy/v1/tree_stats",
]

# Marketplace module query endpoints.
MARKETPLACE_REST_ENDPOINTS: typing.List[str] = [
    "/clawchain/marketplace/v1/params",
    "/clawchain/marketplace/v1/skills",
    "/clawchain/marketplace/v1/compute_resources",
    "/clawchain/marketplace/v1/compute_jobs",
]

# Governance module query endpoints.
GOVERNANCE_REST_ENDPOINTS: typing.List[str] = [
    "/clawchain/governance/v1/params",
    "/clawchain/governance/v1/proposals",
]

# Reputation module query endpoints.
REPUTATION_REST_ENDPOINTS: typing.List[str] = [
    "/clawchain/reputation/v1/params",
    "/clawchain/reputation/v1/top_agents",
]

# Model registry module query endpoints.
MODEL_REGISTRY_REST_ENDPOINTS: typing.List[str] = [
    "/clawchain/modelregistry/v1/models",
    "/clawchain/modelregistry/v1/inference/providers",
    "/clawchain/modelregistry/v1/params",
]

# Standard Cosmos SDK endpoints included in mixed workloads.
COSMOS_REST_ENDPOINTS: typing.List[str] = [
    "/cosmos/bank/v1beta1/supply",
    "/cosmos/staking/v1beta1/validators",
    "/cosmos/base/tendermint/v1beta1/blocks/latest",
    "/cosmos/gov/v1/proposals",
]

# All ClawChain-specific endpoints combined.
ALL_CLAWCHAIN_REST_ENDPOINTS: typing.List[str] = (
    AGENT_REST_ENDPOINTS
    + PRIVACY_REST_ENDPOINTS
    + MARKETPLACE_REST_ENDPOINTS
    + GOVERNANCE_REST_ENDPOINTS
    + REPUTATION_REST_ENDPOINTS
    + MODEL_REGISTRY_REST_ENDPOINTS
)
