"""Tests for ClawChain-specific load testing modules.

Covers:
  - ClawchainClient construction and method signatures
  - ChainConfig / ScenarioParams defaults and env loading
  - MetricsCollector / OperationMetrics recording and reporting
  - Scenario registry completeness
  - BlockTimeMonitor arithmetic
"""

from __future__ import annotations

import os
import sys
import time
import types
import typing
from unittest import mock

import pytest

# ---- Bootstrap a fake ``requests`` module so that mock.patch works
#      even when the real ``requests`` package is not installed. -----
_fake_requests = types.ModuleType("requests")
_fake_requests.get = lambda *a, **kw: None  # type: ignore[attr-defined]
_fake_requests.post = lambda *a, **kw: None  # type: ignore[attr-defined]
if "requests" not in sys.modules:
    sys.modules["requests"] = _fake_requests
# -------------------------------------------------------------------

from flood.cosmos.client import RequestResult
from flood.cosmos.clawchain import ClawchainClient, _make_tx_body
from flood.cosmos.config import (
    ChainConfig,
    ScenarioParams,
    TestAccount,
    DEFAULT_DEV_ACCOUNT,
    DEFAULT_TEST_ACCOUNTS,
    AGENT_REST_ENDPOINTS,
    PRIVACY_REST_ENDPOINTS,
    MARKETPLACE_REST_ENDPOINTS,
    GOVERNANCE_REST_ENDPOINTS,
    REPUTATION_REST_ENDPOINTS,
    MODEL_REGISTRY_REST_ENDPOINTS,
    COSMOS_REST_ENDPOINTS,
    ALL_CLAWCHAIN_REST_ENDPOINTS,
)
from flood.cosmos.metrics import (
    OperationMetrics,
    MetricsCollector,
    BlockTimeMonitor,
)
from flood.cosmos.scenarios import SCENARIOS


# ==================================================================
# Helpers
# ==================================================================


def _make_mock_response(
    status_code: int = 200,
    json_data: typing.Optional[typing.Dict[str, typing.Any]] = None,
    content: bytes = b"{}",
) -> mock.MagicMock:
    resp = mock.MagicMock()
    resp.status_code = status_code
    resp.content = content
    resp.json.return_value = json_data or {}
    return resp


# ==================================================================
# ChainConfig
# ==================================================================


class TestChainConfig:
    def test_defaults(self) -> None:
        cfg = ChainConfig()
        assert cfg.rpc_url == "http://localhost:26657"
        assert cfg.rest_url == "http://localhost:1317"
        assert cfg.chain_id == "clawchain-local"
        assert cfg.denom == "uclaw"
        assert cfg.prefix == "claw"
        assert cfg.timeout == 10.0

    def test_from_env(self) -> None:
        env = {
            "CLAWCHAIN_RPC_URL": "http://rpc:1234",
            "CLAWCHAIN_REST_URL": "http://rest:5678",
            "CLAWCHAIN_CHAIN_ID": "testnet-1",
            "CLAWCHAIN_DENOM": "utest",
            "CLAWCHAIN_PREFIX": "test",
            "CLAWCHAIN_TIMEOUT": "5.0",
        }
        with mock.patch.dict(os.environ, env, clear=False):
            cfg = ChainConfig.from_env()
        assert cfg.rpc_url == "http://rpc:1234"
        assert cfg.rest_url == "http://rest:5678"
        assert cfg.chain_id == "testnet-1"
        assert cfg.denom == "utest"
        assert cfg.prefix == "test"
        assert cfg.timeout == 5.0

    def test_from_env_defaults(self) -> None:
        """With no env vars set, from_env returns the same as __init__."""
        cfg = ChainConfig.from_env()
        assert isinstance(cfg.rpc_url, str)


# ==================================================================
# ScenarioParams
# ==================================================================


class TestScenarioParams:
    def test_defaults(self) -> None:
        sp = ScenarioParams()
        assert sp.duration_s == 10.0
        assert sp.concurrency == 4
        assert sp.target_rps == 0
        assert sp.think_time_s == 0.0
        assert sp.max_requests == 0
        assert sp.warmup_s == 0.0

    def test_from_env(self) -> None:
        env = {
            "CLAWCHAIN_SCENARIO_DURATION": "30.0",
            "CLAWCHAIN_SCENARIO_CONCURRENCY": "16",
            "CLAWCHAIN_SCENARIO_TARGET_RPS": "200",
            "CLAWCHAIN_SCENARIO_THINK_TIME": "0.05",
            "CLAWCHAIN_SCENARIO_MAX_REQUESTS": "5000",
            "CLAWCHAIN_SCENARIO_WARMUP": "2.0",
        }
        with mock.patch.dict(os.environ, env, clear=False):
            sp = ScenarioParams.from_env()
        assert sp.duration_s == 30.0
        assert sp.concurrency == 16
        assert sp.target_rps == 200
        assert sp.think_time_s == 0.05
        assert sp.max_requests == 5000
        assert sp.warmup_s == 2.0


# ==================================================================
# TestAccount / defaults
# ==================================================================


class TestTestAccount:
    def test_dev_account(self) -> None:
        assert DEFAULT_DEV_ACCOUNT.name == "dev-account"
        assert DEFAULT_DEV_ACCOUNT.address.startswith("claw1")

    def test_load_accounts(self) -> None:
        assert len(DEFAULT_TEST_ACCOUNTS) == 4
        for acct in DEFAULT_TEST_ACCOUNTS:
            assert acct.name.startswith("load-test-")
            assert acct.address.startswith("claw1")


# ==================================================================
# Endpoint catalogues
# ==================================================================


class TestEndpointCatalogues:
    def test_agent_endpoints_nonempty(self) -> None:
        assert len(AGENT_REST_ENDPOINTS) >= 2

    def test_privacy_endpoints_nonempty(self) -> None:
        assert len(PRIVACY_REST_ENDPOINTS) >= 2

    def test_marketplace_endpoints_nonempty(self) -> None:
        assert len(MARKETPLACE_REST_ENDPOINTS) >= 2

    def test_governance_endpoints_nonempty(self) -> None:
        assert len(GOVERNANCE_REST_ENDPOINTS) >= 1

    def test_reputation_endpoints_nonempty(self) -> None:
        assert len(REPUTATION_REST_ENDPOINTS) >= 1

    def test_model_registry_endpoints_nonempty(self) -> None:
        assert len(MODEL_REGISTRY_REST_ENDPOINTS) >= 1

    def test_cosmos_endpoints_nonempty(self) -> None:
        assert len(COSMOS_REST_ENDPOINTS) >= 2

    def test_all_clawchain_combined(self) -> None:
        expected_min = (
            len(AGENT_REST_ENDPOINTS)
            + len(PRIVACY_REST_ENDPOINTS)
            + len(MARKETPLACE_REST_ENDPOINTS)
            + len(GOVERNANCE_REST_ENDPOINTS)
            + len(REPUTATION_REST_ENDPOINTS)
            + len(MODEL_REGISTRY_REST_ENDPOINTS)
        )
        assert len(ALL_CLAWCHAIN_REST_ENDPOINTS) == expected_min

    def test_all_start_with_slash(self) -> None:
        for ep in ALL_CLAWCHAIN_REST_ENDPOINTS:
            assert ep.startswith("/"), f"{ep!r} missing leading /"
        for ep in COSMOS_REST_ENDPOINTS:
            assert ep.startswith("/"), f"{ep!r} missing leading /"

    def test_clawchain_paths_contain_module_name(self) -> None:
        for ep in AGENT_REST_ENDPOINTS:
            assert "agent" in ep
        for ep in PRIVACY_REST_ENDPOINTS:
            assert "privacy" in ep
        for ep in MARKETPLACE_REST_ENDPOINTS:
            assert "marketplace" in ep


# ==================================================================
# _make_tx_body
# ==================================================================


class TestMakeTxBody:
    def test_structure(self) -> None:
        msg = {"@type": "/cosmos.bank.v1beta1.MsgSend", "amount": []}
        body = _make_tx_body([msg], memo="test")
        assert "body" in body
        assert "auth_info" in body
        assert "signatures" in body
        assert body["body"]["messages"] == [msg]
        assert body["body"]["memo"] == "test"

    def test_default_memo(self) -> None:
        body = _make_tx_body([])
        assert body["body"]["memo"] == ""

    def test_fee_structure(self) -> None:
        body = _make_tx_body([])
        fee = body["auth_info"]["fee"]
        assert fee["gas_limit"] == "200000"
        assert len(fee["amount"]) == 1
        assert fee["amount"][0]["denom"] == "uclaw"


# ==================================================================
# ClawchainClient construction
# ==================================================================


class TestClawchainClientConstruction:
    def test_default_config(self) -> None:
        cc = ClawchainClient()
        assert cc.config.chain_id == "clawchain-local"
        assert cc.config.denom == "uclaw"

    def test_custom_config(self) -> None:
        cfg = ChainConfig(
            rpc_url="http://node:26657",
            rest_url="http://node:1317",
            chain_id="clawchain-testnet-1",
        )
        cc = ClawchainClient(config=cfg)
        assert cc.config.chain_id == "clawchain-testnet-1"
        assert cc._inner.rpc_url == "http://node:26657"
        assert cc._inner.rest_url == "http://node:1317"


# ==================================================================
# ClawchainClient methods (mock HTTP)
# ==================================================================


class TestClawchainClientQueries:
    """Test query methods by mocking ``requests.get``."""

    def _client(self) -> ClawchainClient:
        return ClawchainClient(config=ChainConfig())

    @mock.patch("requests.get")
    def test_query_block_latest(self, mock_get: mock.MagicMock) -> None:
        mock_get.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.query_block()
        assert result.success is True
        assert "blocks/latest" in result.method

    @mock.patch("requests.get")
    def test_query_block_by_height(self, mock_get: mock.MagicMock) -> None:
        mock_get.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.query_block(height=42)
        assert result.success is True
        assert "42" in result.method

    @mock.patch("requests.get")
    def test_query_balance(self, mock_get: mock.MagicMock) -> None:
        mock_get.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.query_balance("claw1abc")
        assert result.success is True
        assert "claw1abc" in result.method

    @mock.patch("requests.get")
    def test_query_agents(self, mock_get: mock.MagicMock) -> None:
        mock_get.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.query_agents()
        assert result.success is True
        assert "agent" in result.method

    @mock.patch("requests.get")
    def test_query_merkle_root(self, mock_get: mock.MagicMock) -> None:
        mock_get.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.query_merkle_root()
        assert result.success is True

    @mock.patch("requests.get")
    def test_query_skills(self, mock_get: mock.MagicMock) -> None:
        mock_get.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.query_skills()
        assert result.success is True
        assert "marketplace" in result.method

    @mock.patch("requests.get")
    def test_query_proposals(self, mock_get: mock.MagicMock) -> None:
        mock_get.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.query_proposals()
        assert result.success is True
        assert "governance" in result.method

    @mock.patch("requests.get")
    def test_query_failure(self, mock_get: mock.MagicMock) -> None:
        mock_get.return_value = _make_mock_response(500)
        cc = self._client()
        result = cc.query_agents()
        assert result.success is False
        assert result.status_code == 500

    @mock.patch("requests.get")
    def test_query_connection_error(self, mock_get: mock.MagicMock) -> None:
        mock_get.side_effect = ConnectionError("refused")
        cc = self._client()
        result = cc.query_agents()
        assert result.success is False
        assert result.error is not None
        assert "refused" in result.error


class TestClawchainClientTransactions:
    """Test transaction simulation methods by mocking ``requests.post``."""

    def _client(self) -> ClawchainClient:
        return ClawchainClient(config=ChainConfig())

    @mock.patch("requests.post")
    def test_register_agent(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.register_agent("claw1creator")
        assert result.success is True

    @mock.patch("requests.post")
    def test_agent_heartbeat(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.agent_heartbeat("claw1creator")
        assert result.success is True

    @mock.patch("requests.post")
    def test_delegate_task(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.delegate_task("claw1creator", "claw1agent")
        assert result.success is True

    @mock.patch("requests.post")
    def test_accept_task(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.accept_task("claw1creator", "task-1")
        assert result.success is True

    @mock.patch("requests.post")
    def test_complete_task(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.complete_task("claw1creator", "task-1")
        assert result.success is True

    @mock.patch("requests.post")
    def test_shield_tokens(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.shield_tokens("claw1creator", amount="5000")
        assert result.success is True

    @mock.patch("requests.post")
    def test_private_transfer(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.private_transfer("claw1creator")
        assert result.success is True

    @mock.patch("requests.post")
    def test_unshield_tokens(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.unshield_tokens("claw1creator")
        assert result.success is True

    @mock.patch("requests.post")
    def test_list_skill(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.list_skill("claw1creator", name="test-skill")
        assert result.success is True

    @mock.patch("requests.post")
    def test_purchase_skill(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.purchase_skill("claw1buyer", "skill-1")
        assert result.success is True

    @mock.patch("requests.post")
    def test_create_escrow(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.create_escrow("claw1buyer", "claw1seller")
        assert result.success is True

    @mock.patch("requests.post")
    def test_complete_escrow(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.complete_escrow("claw1seller", "escrow-1")
        assert result.success is True

    @mock.patch("requests.post")
    def test_submit_vote(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.submit_vote("claw1voter", proposal_id="1")
        assert result.success is True

    @mock.patch("requests.post")
    def test_submit_proposal(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.submit_proposal("claw1proposer")
        assert result.success is True

    @mock.patch("requests.post")
    def test_send_tokens(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(200)
        cc = self._client()
        result = cc.send_tokens("claw1from", "claw1to", amount="500")
        assert result.success is True

    @mock.patch("requests.post")
    def test_simulate_failure(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(400)
        cc = self._client()
        result = cc.register_agent("claw1bad")
        assert result.success is False
        assert result.status_code == 400

    @mock.patch("requests.post")
    def test_query_status(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(
            200, json_data={"result": {"sync_info": {"latest_block_height": "100"}}}
        )
        cc = self._client()
        result = cc.query_status()
        assert result.success is True
        assert result.method == "rpc_status"

    @mock.patch("requests.post")
    def test_query_status_with_error(self, mock_post: mock.MagicMock) -> None:
        mock_post.return_value = _make_mock_response(
            200, json_data={"error": {"code": -32600, "message": "bad"}}
        )
        cc = self._client()
        result = cc.query_status()
        assert result.success is False


# ==================================================================
# OperationMetrics
# ==================================================================


class TestOperationMetrics:
    def _make_result(
        self, success: bool = True, latency: float = 10.0, size: int = 100
    ) -> RequestResult:
        return RequestResult(
            method="test",
            latency_ms=latency,
            success=success,
            status_code=200 if success else 500,
            response_bytes=size,
        )

    def test_empty(self) -> None:
        om = OperationMetrics(operation="x")
        assert om.total == 0
        assert om.success_rate == 0.0
        assert om.mean_latency_ms == 0.0
        assert om.p50_ms == 0.0
        assert om.stddev_ms() == 0.0

    def test_record_success(self) -> None:
        om = OperationMetrics(operation="op")
        om.record(self._make_result(True, 10.0, 100))
        om.record(self._make_result(True, 20.0, 200))
        assert om.total == 2
        assert om.successes == 2
        assert om.failures == 0
        assert om.success_rate == 1.0
        assert om.total_bytes == 300

    def test_record_mixed(self) -> None:
        om = OperationMetrics(operation="op")
        om.record(self._make_result(True, 10.0))
        om.record(self._make_result(False, 20.0))
        om.record(self._make_result(True, 30.0))
        assert om.total == 3
        assert om.successes == 2
        assert om.failures == 1
        assert om.failure_rate == pytest.approx(1 / 3, abs=0.01)

    def test_latency_stats(self) -> None:
        om = OperationMetrics(operation="lat")
        for lat in [5.0, 10.0, 15.0, 20.0, 25.0]:
            om.record(self._make_result(True, lat))
        assert om.min_latency_ms == 5.0
        assert om.max_latency_ms == 25.0
        assert om.mean_latency_ms == 15.0

    def test_percentiles(self) -> None:
        om = OperationMetrics(operation="pct")
        for i in range(100):
            om.record(self._make_result(True, float(i)))
        assert om.p50_ms == 50.0
        assert om.p95_ms == 95.0
        assert om.p99_ms == 99.0

    def test_stddev(self) -> None:
        om = OperationMetrics(operation="std")
        for _ in range(10):
            om.record(self._make_result(True, 5.0))
        assert om.stddev_ms() == 0.0

    def test_stddev_nonzero(self) -> None:
        om = OperationMetrics(operation="std2")
        om.record(self._make_result(True, 0.0))
        om.record(self._make_result(True, 10.0))
        assert om.stddev_ms() == pytest.approx(5.0, abs=0.01)


# ==================================================================
# MetricsCollector
# ==================================================================


class TestMetricsCollector:
    def _result(
        self, success: bool = True, latency: float = 10.0
    ) -> RequestResult:
        return RequestResult(
            method="t",
            latency_ms=latency,
            success=success,
            status_code=200 if success else 500,
            response_bytes=50,
        )

    def test_empty_collector(self) -> None:
        mc = MetricsCollector()
        assert mc.total_requests == 0
        assert mc.total_successes == 0
        assert mc.total_failures == 0
        assert mc.overall_success_rate == 0.0
        assert mc.operations == []

    def test_record_and_summarise(self) -> None:
        mc = MetricsCollector()
        mc.record("op_a", self._result(True, 10.0))
        mc.record("op_a", self._result(True, 20.0))
        mc.record("op_b", self._result(False, 30.0))
        assert mc.total_requests == 3
        assert mc.total_successes == 2
        assert mc.total_failures == 1
        assert mc.operations == ["op_a", "op_b"]

    def test_get_creates_bucket(self) -> None:
        mc = MetricsCollector()
        bucket = mc.get("new_op")
        assert bucket.operation == "new_op"
        assert bucket.total == 0

    def test_block_time(self) -> None:
        mc = MetricsCollector()
        mc.record_block_time(1.0)
        mc.record_block_time(2.0)
        mc.record_block_time(3.0)
        assert mc.mean_block_time_s == 2.0

    def test_summary_structure(self) -> None:
        mc = MetricsCollector()
        mc.record("alpha", self._result(True))
        mc.record("beta", self._result(False))
        mc.record_block_time(1.5)
        s = mc.summary()
        assert "elapsed_s" in s
        assert "total_requests" in s
        assert "overall_tps" in s
        assert "operations" in s
        assert "alpha" in s["operations"]
        assert "beta" in s["operations"]
        assert s["block_time_observations"] == 1
        assert s["mean_block_time_s"] == 1.5

    def test_format_report_nocrash(self) -> None:
        mc = MetricsCollector()
        mc.record("op", self._result(True, 5.0))
        mc.record("op", self._result(False, 50.0))
        report = mc.format_report()
        assert "ClawChain Load Test Metrics Report" in report
        assert "op" in report

    def test_overall_tps(self) -> None:
        mc = MetricsCollector()
        for _ in range(10):
            mc.record("x", self._result(True))
        assert mc.overall_tps > 0

    def test_empty_block_time(self) -> None:
        mc = MetricsCollector()
        assert mc.mean_block_time_s == 0.0


# ==================================================================
# BlockTimeMonitor
# ==================================================================


class TestBlockTimeMonitor:
    def test_defaults(self) -> None:
        btm = BlockTimeMonitor()
        assert btm.rest_url == "http://localhost:1317"
        assert btm.poll_interval_s == 1.0
        assert btm.block_times == []
        assert btm.mean_block_time == 0.0

    def test_custom_url(self) -> None:
        btm = BlockTimeMonitor(
            rest_url="http://node:1317/",
            poll_interval_s=0.5,
        )
        assert btm.rest_url == "http://node:1317"

    @mock.patch("requests.get")
    def test_poll_once_first_call(self, mock_get: mock.MagicMock) -> None:
        mock_get.return_value = _make_mock_response(
            200,
            json_data={
                "block": {"header": {"height": "10"}},
            },
        )
        btm = BlockTimeMonitor()
        delta = btm.poll_once()
        assert delta is None
        assert btm._last_height == 10

    @mock.patch("requests.get")
    def test_poll_once_sequential(self, mock_get: mock.MagicMock) -> None:
        btm = BlockTimeMonitor()
        btm._last_height = 9
        btm._last_ts = time.monotonic() - 2.0
        mock_get.return_value = _make_mock_response(
            200,
            json_data={
                "block": {"header": {"height": "10"}},
            },
        )
        delta = btm.poll_once()
        assert delta is not None
        assert delta > 0
        assert len(btm.block_times) == 1

    @mock.patch("requests.get")
    def test_poll_once_same_height(self, mock_get: mock.MagicMock) -> None:
        btm = BlockTimeMonitor()
        btm._last_height = 10
        btm._last_ts = time.monotonic()
        mock_get.return_value = _make_mock_response(
            200,
            json_data={
                "block": {"header": {"height": "10"}},
            },
        )
        delta = btm.poll_once()
        assert delta is None

    @mock.patch("requests.get")
    def test_poll_once_error(self, mock_get: mock.MagicMock) -> None:
        mock_get.side_effect = ConnectionError("down")
        btm = BlockTimeMonitor()
        delta = btm.poll_once()
        assert delta is None

    def test_mean_block_time(self) -> None:
        btm = BlockTimeMonitor()
        btm._block_times = [1.0, 2.0, 3.0]
        assert btm.mean_block_time == 2.0


# ==================================================================
# Scenario registry
# ==================================================================


class TestScenarioRegistry:
    EXPECTED_SCENARIOS = [
        "read",
        "blocks",
        "validators",
        "agents",
        "mixed",
        "agent_lifecycle",
        "privacy_flow",
        "marketplace_flow",
        "governance_flow",
        "dex_flow",
        "clawchain_mixed",
    ]

    def test_all_present(self) -> None:
        for name in self.EXPECTED_SCENARIOS:
            assert name in SCENARIOS, f"Missing scenario: {name!r}"

    def test_count(self) -> None:
        assert len(SCENARIOS) == len(self.EXPECTED_SCENARIOS)

    def test_all_callable(self) -> None:
        for name, fn in SCENARIOS.items():
            assert callable(fn), f"Scenario {name!r} is not callable"


# ==================================================================
# Scenario functions exist and are importable
# ==================================================================


class TestScenarioImports:
    def test_agent_lifecycle_importable(self) -> None:
        from flood.cosmos.scenarios import run_agent_lifecycle_scenario
        assert callable(run_agent_lifecycle_scenario)

    def test_privacy_flow_importable(self) -> None:
        from flood.cosmos.scenarios import run_privacy_flow_scenario
        assert callable(run_privacy_flow_scenario)

    def test_marketplace_flow_importable(self) -> None:
        from flood.cosmos.scenarios import run_marketplace_flow_scenario
        assert callable(run_marketplace_flow_scenario)

    def test_governance_flow_importable(self) -> None:
        from flood.cosmos.scenarios import run_governance_flow_scenario
        assert callable(run_governance_flow_scenario)

    def test_dex_flow_importable(self) -> None:
        from flood.cosmos.scenarios import run_dex_flow_scenario
        assert callable(run_dex_flow_scenario)

    def test_clawchain_mixed_importable(self) -> None:
        from flood.cosmos.scenarios import run_clawchain_mixed_scenario
        assert callable(run_clawchain_mixed_scenario)


# ==================================================================
# Integration: _run_sync_scenario with mock HTTP
# ==================================================================


class TestSyncScenarioExecution:
    """Run a ClawChain scenario for a very short duration with mocked HTTP."""

    @mock.patch("requests.post", return_value=_make_mock_response(200))
    @mock.patch("requests.get", return_value=_make_mock_response(200))
    def test_agent_lifecycle_short_run(
        self,
        mock_get: mock.MagicMock,
        mock_post: mock.MagicMock,
    ) -> None:
        from flood.cosmos.scenarios import run_agent_lifecycle_scenario
        from flood.cosmos.client import CometBFTClient

        client = CometBFTClient()
        result = run_agent_lifecycle_scenario(
            client, concurrency=2, duration_s=0.2
        )
        assert result.scenario == "agent_lifecycle"
        assert result.total_requests > 0
        assert result.successful > 0
        assert result.duration_s > 0

    @mock.patch("requests.post", return_value=_make_mock_response(200))
    @mock.patch("requests.get", return_value=_make_mock_response(200))
    def test_privacy_flow_short_run(
        self,
        mock_get: mock.MagicMock,
        mock_post: mock.MagicMock,
    ) -> None:
        from flood.cosmos.scenarios import run_privacy_flow_scenario
        from flood.cosmos.client import CometBFTClient

        client = CometBFTClient()
        result = run_privacy_flow_scenario(
            client, concurrency=2, duration_s=0.2
        )
        assert result.scenario == "privacy_flow"
        assert result.total_requests > 0

    @mock.patch("requests.post", return_value=_make_mock_response(200))
    @mock.patch("requests.get", return_value=_make_mock_response(200))
    def test_marketplace_flow_short_run(
        self,
        mock_get: mock.MagicMock,
        mock_post: mock.MagicMock,
    ) -> None:
        from flood.cosmos.scenarios import run_marketplace_flow_scenario
        from flood.cosmos.client import CometBFTClient

        client = CometBFTClient()
        result = run_marketplace_flow_scenario(
            client, concurrency=2, duration_s=0.2
        )
        assert result.scenario == "marketplace_flow"
        assert result.total_requests > 0

    @mock.patch("requests.post", return_value=_make_mock_response(200))
    @mock.patch("requests.get", return_value=_make_mock_response(200))
    def test_governance_flow_short_run(
        self,
        mock_get: mock.MagicMock,
        mock_post: mock.MagicMock,
    ) -> None:
        from flood.cosmos.scenarios import run_governance_flow_scenario
        from flood.cosmos.client import CometBFTClient

        client = CometBFTClient()
        result = run_governance_flow_scenario(
            client, concurrency=2, duration_s=0.2
        )
        assert result.scenario == "governance_flow"
        assert result.total_requests > 0

    @mock.patch("requests.post", return_value=_make_mock_response(200))
    @mock.patch("requests.get", return_value=_make_mock_response(200))
    def test_dex_flow_short_run(
        self,
        mock_get: mock.MagicMock,
        mock_post: mock.MagicMock,
    ) -> None:
        from flood.cosmos.scenarios import run_dex_flow_scenario
        from flood.cosmos.client import CometBFTClient

        client = CometBFTClient()
        result = run_dex_flow_scenario(
            client, concurrency=2, duration_s=0.2
        )
        assert result.scenario == "dex_flow"
        assert result.total_requests > 0

    @mock.patch("requests.post", return_value=_make_mock_response(200))
    @mock.patch("requests.get", return_value=_make_mock_response(200))
    def test_clawchain_mixed_short_run(
        self,
        mock_get: mock.MagicMock,
        mock_post: mock.MagicMock,
    ) -> None:
        from flood.cosmos.scenarios import run_clawchain_mixed_scenario
        from flood.cosmos.client import CometBFTClient

        client = CometBFTClient()
        result = run_clawchain_mixed_scenario(
            client, concurrency=2, duration_s=0.2
        )
        assert result.scenario == "clawchain_mixed"
        assert result.total_requests > 0

    @mock.patch("requests.post")
    @mock.patch("requests.get")
    def test_scenario_with_failures(
        self,
        mock_get: mock.MagicMock,
        mock_post: mock.MagicMock,
    ) -> None:
        """Ensure scenarios handle mixed success/failure gracefully."""
        call_count = {"n": 0}

        def _alternating(*args: typing.Any, **kwargs: typing.Any) -> mock.MagicMock:
            call_count["n"] += 1
            if call_count["n"] % 3 == 0:
                return _make_mock_response(500)
            return _make_mock_response(200)

        mock_get.side_effect = _alternating
        mock_post.side_effect = _alternating

        from flood.cosmos.scenarios import run_agent_lifecycle_scenario
        from flood.cosmos.client import CometBFTClient

        client = CometBFTClient()
        result = run_agent_lifecycle_scenario(
            client, concurrency=1, duration_s=0.2
        )
        assert result.total_requests > 0
        assert result.failed >= 0
        assert result.error_rate >= 0
