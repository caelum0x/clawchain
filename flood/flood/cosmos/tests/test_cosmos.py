"""Tests for Cosmos / CometBFT load testing module."""

from __future__ import annotations

import pytest

from flood.cosmos.client import CometBFTClient, RequestResult
from flood.cosmos.scenarios import (
    ScenarioResult,
    calculate_percentile,
    aggregate_results,
    format_results,
    SCENARIOS,
    READ_ENDPOINTS,
    REST_ENDPOINTS,
)


# ------------------------------------------------------------------
# calculate_percentile
# ------------------------------------------------------------------


class TestCalculatePercentile:
    def test_basic(self) -> None:
        values = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
        # idx = int(10 * 50/100) = 5 -> values[5] = 6.0
        assert calculate_percentile(values, 50) == 6.0
        assert calculate_percentile(values, 95) == 10.0

    def test_empty(self) -> None:
        assert calculate_percentile([], 50) == 0.0

    def test_single_element(self) -> None:
        assert calculate_percentile([42.0], 99) == 42.0

    def test_zeroth_percentile(self) -> None:
        values = [1.0, 2.0, 3.0]
        assert calculate_percentile(values, 0) == 1.0


# ------------------------------------------------------------------
# aggregate_results
# ------------------------------------------------------------------


class TestAggregateResults:
    def test_mixed_success_and_failure(self) -> None:
        results = [
            RequestResult(
                method="status",
                latency_ms=10.0,
                success=True,
                status_code=200,
                response_bytes=100,
            ),
            RequestResult(
                method="status",
                latency_ms=20.0,
                success=True,
                status_code=200,
                response_bytes=100,
            ),
            RequestResult(
                method="status",
                latency_ms=30.0,
                success=False,
                status_code=500,
                error="timeout",
            ),
        ]
        agg = aggregate_results("test", results, 1.0)
        assert agg.total_requests == 3
        assert agg.successful == 2
        assert agg.failed == 1
        assert agg.requests_per_second == 3.0
        assert agg.total_bytes == 200  # only successes have bytes

    def test_all_successful(self) -> None:
        results = [
            RequestResult(
                method="block",
                latency_ms=5.0,
                success=True,
                status_code=200,
                response_bytes=50,
            ),
        ]
        agg = aggregate_results("ok", results, 2.0)
        assert agg.successful == 1
        assert agg.failed == 0
        assert agg.error_rate == 0

    def test_empty_results(self) -> None:
        agg = aggregate_results("empty", [], 1.0)
        assert agg.total_requests == 0
        assert agg.latency_min_ms == 0
        assert agg.latency_mean_ms == 0


# ------------------------------------------------------------------
# error aggregation
# ------------------------------------------------------------------


class TestErrorAggregation:
    def test_counts_grouped(self) -> None:
        results = [
            RequestResult(
                method="x",
                latency_ms=1,
                success=False,
                status_code=0,
                error="timeout",
            ),
            RequestResult(
                method="x",
                latency_ms=1,
                success=False,
                status_code=0,
                error="timeout",
            ),
            RequestResult(
                method="x",
                latency_ms=1,
                success=False,
                status_code=0,
                error="refused",
            ),
        ]
        agg = aggregate_results("err", results, 1.0)
        assert agg.errors["timeout"] == 2
        assert agg.errors["refused"] == 1

    def test_no_errors(self) -> None:
        results = [
            RequestResult(
                method="y",
                latency_ms=2,
                success=True,
                status_code=200,
            ),
        ]
        agg = aggregate_results("clean", results, 1.0)
        assert agg.errors == {}


# ------------------------------------------------------------------
# format_results
# ------------------------------------------------------------------


class TestFormatResults:
    def test_contains_key_info(self) -> None:
        result = ScenarioResult(
            scenario="read",
            duration_s=10.0,
            total_requests=100,
            successful=95,
            failed=5,
            requests_per_second=10.0,
            latency_min_ms=1.0,
            latency_max_ms=100.0,
            latency_mean_ms=20.0,
            latency_p50_ms=15.0,
            latency_p95_ms=80.0,
            latency_p99_ms=95.0,
            error_rate=0.05,
            total_bytes=10000,
        )
        output = format_results(result)
        assert "read" in output
        assert "10.0 req/s" in output
        assert "95" in output
        assert "10,000" in output  # total_bytes formatted


# ------------------------------------------------------------------
# scenario registry
# ------------------------------------------------------------------


class TestScenarioRegistry:
    def test_all_present(self) -> None:
        assert "read" in SCENARIOS
        assert "blocks" in SCENARIOS
        assert "validators" in SCENARIOS
        assert "agents" in SCENARIOS
        assert "mixed" in SCENARIOS

    def test_clawchain_scenarios_present(self) -> None:
        assert "agent_lifecycle" in SCENARIOS
        assert "privacy_flow" in SCENARIOS
        assert "marketplace_flow" in SCENARIOS
        assert "governance_flow" in SCENARIOS
        assert "dex_flow" in SCENARIOS
        assert "clawchain_mixed" in SCENARIOS

    def test_count(self) -> None:
        assert len(SCENARIOS) == 11

    def test_values_are_callable(self) -> None:
        for name, fn in SCENARIOS.items():
            assert callable(fn), f"Scenario {name!r} is not callable"


# ------------------------------------------------------------------
# CometBFTClient
# ------------------------------------------------------------------


class TestCometBFTClient:
    def test_defaults(self) -> None:
        client = CometBFTClient()
        assert client.rpc_url == "http://localhost:26657"
        assert client.rest_url == "http://localhost:1317"
        assert client.timeout == 10.0

    def test_custom_urls(self) -> None:
        client = CometBFTClient(
            rpc_url="http://node:26657",
            rest_url="http://node:1317",
            timeout=5.0,
        )
        assert client.rpc_url == "http://node:26657"
        assert client.timeout == 5.0


# ------------------------------------------------------------------
# RequestResult
# ------------------------------------------------------------------


class TestRequestResult:
    def test_fields(self) -> None:
        r = RequestResult(
            method="status",
            latency_ms=15.5,
            success=True,
            status_code=200,
        )
        assert r.method == "status"
        assert r.latency_ms == 15.5
        assert r.error is None
        assert r.response_bytes == 0

    def test_with_error(self) -> None:
        r = RequestResult(
            method="block",
            latency_ms=100.0,
            success=False,
            status_code=0,
            error="connection refused",
        )
        assert not r.success
        assert r.error == "connection refused"


# ------------------------------------------------------------------
# endpoint lists sanity
# ------------------------------------------------------------------


class TestEndpoints:
    def test_read_endpoints_nonempty(self) -> None:
        assert len(READ_ENDPOINTS) > 0

    def test_rest_endpoints_nonempty(self) -> None:
        assert len(REST_ENDPOINTS) > 0

    def test_rest_endpoints_start_with_slash(self) -> None:
        for path in REST_ENDPOINTS:
            assert path.startswith("/"), f"{path!r} missing leading /"

    def test_clawchain_agent_endpoint_present(self) -> None:
        agent_paths = [p for p in REST_ENDPOINTS if "clawchain" in p]
        assert len(agent_paths) >= 1
