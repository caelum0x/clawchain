"""Load test scenarios for CometBFT / Cosmos SDK chains.

Includes generic Cosmos scenarios (read, blocks, validators, mixed)
and ClawChain-specific multi-step scenarios (agent_lifecycle,
privacy_flow, marketplace_flow, governance_flow, dex_flow,
mixed_workload).
"""

from __future__ import annotations

import asyncio
import hashlib
import random
import time
import typing
from dataclasses import dataclass, field

if typing.TYPE_CHECKING:
    import aiohttp

from .client import CometBFTClient, RequestResult
from .config import (
    AGENT_REST_ENDPOINTS,
    PRIVACY_REST_ENDPOINTS,
    MARKETPLACE_REST_ENDPOINTS,
    GOVERNANCE_REST_ENDPOINTS,
    REPUTATION_REST_ENDPOINTS,
    ALL_CLAWCHAIN_REST_ENDPOINTS,
    COSMOS_REST_ENDPOINTS,
    ChainConfig,
)


# ------------------------------------------------------------------
# result types
# ------------------------------------------------------------------


@dataclass
class ScenarioResult:
    """Aggregated results from a load test scenario."""

    scenario: str
    duration_s: float
    total_requests: int
    successful: int
    failed: int
    requests_per_second: float
    latency_min_ms: float
    latency_max_ms: float
    latency_mean_ms: float
    latency_p50_ms: float
    latency_p95_ms: float
    latency_p99_ms: float
    error_rate: float
    errors: typing.Dict[str, int] = field(default_factory=dict)
    total_bytes: int = 0


# ------------------------------------------------------------------
# helpers
# ------------------------------------------------------------------


def calculate_percentile(
    sorted_values: typing.List[float],
    percentile: float,
) -> float:
    """Calculate a percentile from a **pre-sorted** list of values."""
    if not sorted_values:
        return 0.0
    idx = int(len(sorted_values) * percentile / 100)
    return sorted_values[min(idx, len(sorted_values) - 1)]


def aggregate_results(
    scenario: str,
    results: typing.List[RequestResult],
    duration: float,
) -> ScenarioResult:
    """Aggregate individual ``RequestResult`` items into a summary."""
    successful = sum(1 for r in results if r.success)
    failed = len(results) - successful
    latencies = sorted(r.latency_ms for r in results)

    errors: typing.Dict[str, int] = {}
    for r in results:
        if r.error:
            errors[r.error] = errors.get(r.error, 0) + 1

    return ScenarioResult(
        scenario=scenario,
        duration_s=duration,
        total_requests=len(results),
        successful=successful,
        failed=failed,
        requests_per_second=len(results) / max(duration, 0.001),
        latency_min_ms=latencies[0] if latencies else 0,
        latency_max_ms=latencies[-1] if latencies else 0,
        latency_mean_ms=sum(latencies) / max(len(latencies), 1),
        latency_p50_ms=calculate_percentile(latencies, 50),
        latency_p95_ms=calculate_percentile(latencies, 95),
        latency_p99_ms=calculate_percentile(latencies, 99),
        error_rate=failed / max(len(results), 1),
        errors=errors,
        total_bytes=sum(r.response_bytes for r in results),
    )


# ------------------------------------------------------------------
# endpoint definitions
# ------------------------------------------------------------------


# CometBFT JSON-RPC read-only endpoints
READ_ENDPOINTS: typing.List[
    typing.Tuple[str, typing.Optional[typing.Dict[str, typing.Any]]]
] = [
    ("status", None),
    ("block", None),
    ("net_info", None),
    ("consensus_state", None),
]

# Cosmos SDK REST (LCD) read-only endpoints
REST_ENDPOINTS: typing.List[str] = [
    "/cosmos/bank/v1beta1/supply",
    "/cosmos/staking/v1beta1/validators",
    "/clawchain/agent/v1/agents",
    "/cosmos/base/tendermint/v1beta1/blocks/latest",
]


# ------------------------------------------------------------------
# internal worker
# ------------------------------------------------------------------


async def _worker(
    client: CometBFTClient,
    session: 'aiohttp.ClientSession',
    results: typing.List[RequestResult],
    stop_event: asyncio.Event,
    make_request: typing.Callable[
        [CometBFTClient, 'aiohttp.ClientSession'],
        typing.Coroutine[typing.Any, typing.Any, RequestResult],
    ],
) -> None:
    """Fire requests in a loop until *stop_event* is set."""
    while not stop_event.is_set():
        result = await make_request(client, session)
        results.append(result)


async def _run_scenario(
    name: str,
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
    make_request: typing.Callable[
        [CometBFTClient, 'aiohttp.ClientSession'],
        typing.Coroutine[typing.Any, typing.Any, RequestResult],
    ],
) -> ScenarioResult:
    """Generic scenario runner shared by all concrete scenarios."""
    import aiohttp as _aiohttp

    results: typing.List[RequestResult] = []
    stop_event = asyncio.Event()

    async with _aiohttp.ClientSession() as session:
        workers = [
            asyncio.ensure_future(
                _worker(client, session, results, stop_event, make_request)
            )
            for _ in range(concurrency)
        ]
        t_start = time.monotonic()
        await asyncio.sleep(duration_s)
        stop_event.set()
        # Let in-flight requests finish (bounded by client timeout).
        await asyncio.gather(*workers, return_exceptions=True)
        elapsed = time.monotonic() - t_start

    return aggregate_results(name, results, elapsed)


# ------------------------------------------------------------------
# concrete scenarios
# ------------------------------------------------------------------


async def run_read_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
) -> ScenarioResult:
    """Read-only scenario: mix of CometBFT RPC and Cosmos REST queries."""

    async def _req(
        c: CometBFTClient, s: 'aiohttp.ClientSession'
    ) -> RequestResult:
        if random.random() < 0.5:
            method, params = random.choice(READ_ENDPOINTS)
            return await c.rpc_request(s, method, params)
        else:
            path = random.choice(REST_ENDPOINTS)
            return await c.rest_request(s, path)

    return await _run_scenario("read", client, concurrency, duration_s, _req)


async def run_block_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
) -> ScenarioResult:
    """Block query stress test: request random block heights."""

    async def _req(
        c: CometBFTClient, s: 'aiohttp.ClientSession'
    ) -> RequestResult:
        height = random.randint(1, 1_000_000)
        return await c.rpc_request(s, "block", {"height": str(height)})

    return await _run_scenario(
        "blocks", client, concurrency, duration_s, _req
    )


async def run_validator_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
) -> ScenarioResult:
    """Validator query scenario: CometBFT validators + REST staking."""

    async def _req(
        c: CometBFTClient, s: 'aiohttp.ClientSession'
    ) -> RequestResult:
        if random.random() < 0.5:
            return await c.rpc_request(s, "validators")
        else:
            return await c.rest_request(
                s, "/cosmos/staking/v1beta1/validators"
            )

    return await _run_scenario(
        "validators", client, concurrency, duration_s, _req
    )


async def run_agent_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
) -> ScenarioResult:
    """ClawChain agent module query scenario."""

    agent_paths = [
        "/clawchain/agent/v1/agents",
        "/clawchain/agent/v1/params",
    ]

    async def _req(
        c: CometBFTClient, s: 'aiohttp.ClientSession'
    ) -> RequestResult:
        path = random.choice(agent_paths)
        return await c.rest_request(s, path)

    return await _run_scenario(
        "agents", client, concurrency, duration_s, _req
    )


async def run_mixed_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
) -> ScenarioResult:
    """Mixed workload: 50% CometBFT RPC + 50% Cosmos REST."""

    async def _req(
        c: CometBFTClient, s: 'aiohttp.ClientSession'
    ) -> RequestResult:
        if random.random() < 0.5:
            method, params = random.choice(READ_ENDPOINTS)
            return await c.rpc_request(s, method, params)
        else:
            path = random.choice(REST_ENDPOINTS)
            return await c.rest_request(s, path)

    return await _run_scenario(
        "mixed", client, concurrency, duration_s, _req
    )


# ------------------------------------------------------------------
# ClawChain-specific scenarios (synchronous, use requests)
# ------------------------------------------------------------------
#
# These scenarios exercise the full ClawChain module surface.  They
# are synchronous (use ``requests`` under the hood via
# ``ClawchainClient``) and run with a simple thread-pool model so
# they don't require ``aiohttp``.
# ------------------------------------------------------------------


def _sync_worker(
    fn: typing.Callable[[], RequestResult],
    results: typing.List[RequestResult],
    stop_time: float,
) -> None:
    """Call *fn* in a tight loop until wall-clock exceeds *stop_time*."""
    while time.monotonic() < stop_time:
        results.append(fn())


def _run_sync_scenario(
    name: str,
    fns: typing.List[typing.Callable[[], RequestResult]],
    concurrency: int,
    duration_s: float,
) -> ScenarioResult:
    """Run a list of callables round-robin across *concurrency* threads."""
    import concurrent.futures

    results: typing.List[RequestResult] = []
    stop_time = time.monotonic() + duration_s
    idx = 0

    def _pick() -> RequestResult:
        nonlocal idx
        fn = fns[idx % len(fns)]
        idx += 1
        return fn()

    t_start = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=concurrency
    ) as pool:
        futures = [
            pool.submit(_sync_worker, _pick, results, stop_time)
            for _ in range(concurrency)
        ]
        concurrent.futures.wait(futures)
    elapsed = time.monotonic() - t_start
    return aggregate_results(name, results, elapsed)


def _get_clawchain_client(
    config: typing.Optional[ChainConfig] = None,
) -> "ClawchainClient":
    """Lazy import to avoid circular dependency at module level."""
    from .clawchain import ClawchainClient

    return ClawchainClient(config=config or ChainConfig())


# -- agent lifecycle ------------------------------------------------


def run_agent_lifecycle_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
    config: typing.Optional[ChainConfig] = None,
) -> ScenarioResult:
    """Agent lifecycle: register -> heartbeat -> accept task -> complete.

    Exercises the full agent module transaction path via simulate.
    """
    cc = _get_clawchain_client(config)
    creator = "claw1loadtestagent00000000000000000000000000"

    def _register() -> RequestResult:
        return cc.register_agent(creator, name=f"agent-{random.randint(0, 9999)}")

    def _heartbeat() -> RequestResult:
        return cc.agent_heartbeat(creator)

    def _delegate() -> RequestResult:
        return cc.delegate_task(creator, creator, description="perf-task")

    def _accept() -> RequestResult:
        return cc.accept_task(creator, task_id=f"task-{random.randint(0, 999)}")

    def _complete() -> RequestResult:
        return cc.complete_task(
            creator, task_id=f"task-{random.randint(0, 999)}", result_data="ok"
        )

    def _query_rewards() -> RequestResult:
        return cc.query_agent_rewards(creator)

    fns: typing.List[typing.Callable[[], RequestResult]] = [
        _register,
        _heartbeat,
        _delegate,
        _accept,
        _complete,
        _query_rewards,
    ]
    return _run_sync_scenario(
        "agent_lifecycle", fns, concurrency, duration_s
    )


# -- privacy flow ---------------------------------------------------


def run_privacy_flow_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
    config: typing.Optional[ChainConfig] = None,
) -> ScenarioResult:
    """Privacy flow: shield -> private transfer -> unshield.

    Exercises the privacy module transaction path via simulate.
    """
    cc = _get_clawchain_client(config)
    creator = "claw1loadtestprivacy000000000000000000000000"

    def _shield() -> RequestResult:
        return cc.shield_tokens(creator, amount="10000")

    def _transfer() -> RequestResult:
        return cc.private_transfer(creator)

    def _unshield() -> RequestResult:
        return cc.unshield_tokens(creator, amount="5000")

    def _query_root() -> RequestResult:
        return cc.query_merkle_root()

    def _query_stats() -> RequestResult:
        return cc.query_tree_stats()

    fns: typing.List[typing.Callable[[], RequestResult]] = [
        _shield,
        _transfer,
        _unshield,
        _query_root,
        _query_stats,
    ]
    return _run_sync_scenario(
        "privacy_flow", fns, concurrency, duration_s
    )


# -- marketplace flow -----------------------------------------------


def run_marketplace_flow_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
    config: typing.Optional[ChainConfig] = None,
) -> ScenarioResult:
    """Marketplace: list skill -> purchase -> escrow -> complete.

    Exercises the marketplace module transaction path via simulate.
    """
    cc = _get_clawchain_client(config)
    seller = "claw1loadtestseller0000000000000000000000000"
    buyer = "claw1loadtestbuyer00000000000000000000000000"

    def _list_skill() -> RequestResult:
        return cc.list_skill(
            seller,
            name=f"skill-{random.randint(0, 9999)}",
            category="inference",
        )

    def _purchase() -> RequestResult:
        return cc.purchase_skill(
            buyer, skill_id=f"skill-{random.randint(0, 999)}"
        )

    def _create_escrow() -> RequestResult:
        return cc.create_escrow(buyer, provider=seller, amount="10000")

    def _complete_escrow() -> RequestResult:
        return cc.complete_escrow(
            seller, escrow_id=f"escrow-{random.randint(0, 999)}"
        )

    def _query_skills() -> RequestResult:
        return cc.query_skills()

    fns: typing.List[typing.Callable[[], RequestResult]] = [
        _list_skill,
        _purchase,
        _create_escrow,
        _complete_escrow,
        _query_skills,
    ]
    return _run_sync_scenario(
        "marketplace_flow", fns, concurrency, duration_s
    )


# -- governance flow ------------------------------------------------


def run_governance_flow_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
    config: typing.Optional[ChainConfig] = None,
) -> ScenarioResult:
    """Governance: submit proposal -> vote -> query.

    Exercises the governance module transaction path via simulate.
    """
    cc = _get_clawchain_client(config)
    creator = "claw1loadtestgov000000000000000000000000000"

    def _submit_proposal() -> RequestResult:
        return cc.submit_proposal(
            creator, title=f"Prop-{random.randint(0, 9999)}"
        )

    def _vote_yes() -> RequestResult:
        return cc.submit_vote(
            creator,
            proposal_id=str(random.randint(1, 100)),
            option="VOTE_OPTION_YES",
        )

    def _vote_no() -> RequestResult:
        return cc.submit_vote(
            creator,
            proposal_id=str(random.randint(1, 100)),
            option="VOTE_OPTION_NO",
        )

    def _query_proposals() -> RequestResult:
        return cc.query_proposals()

    fns: typing.List[typing.Callable[[], RequestResult]] = [
        _submit_proposal,
        _vote_yes,
        _vote_no,
        _query_proposals,
    ]
    return _run_sync_scenario(
        "governance_flow", fns, concurrency, duration_s
    )


# -- DEX flow -------------------------------------------------------


def run_dex_flow_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
    config: typing.Optional[ChainConfig] = None,
) -> ScenarioResult:
    """DEX flow: query pairs + bank send (simulating swaps/LP).

    Since DEX operations go through CosmWasm, this scenario mixes
    bank sends (as a proxy for token movement) with DEX pair queries.
    """
    cc = _get_clawchain_client(config)
    user = "claw1loadtestdex0000000000000000000000000000"
    lp = "claw1loadtestlp000000000000000000000000000000"

    def _provide_liquidity() -> RequestResult:
        return cc.send_tokens(user, lp, amount="50000")

    def _swap() -> RequestResult:
        return cc.send_tokens(user, lp, amount="1000")

    def _remove_liquidity() -> RequestResult:
        return cc.send_tokens(lp, user, amount="50000")

    def _query_pairs() -> RequestResult:
        return cc.query_dex_pairs()

    def _query_balance() -> RequestResult:
        return cc.query_balance(user)

    fns: typing.List[typing.Callable[[], RequestResult]] = [
        _provide_liquidity,
        _swap,
        _remove_liquidity,
        _query_pairs,
        _query_balance,
    ]
    return _run_sync_scenario(
        "dex_flow", fns, concurrency, duration_s
    )


# -- mixed ClawChain workload --------------------------------------


def run_clawchain_mixed_scenario(
    client: CometBFTClient,
    concurrency: int,
    duration_s: float,
    config: typing.Optional[ChainConfig] = None,
) -> ScenarioResult:
    """Mixed workload: random selection across all ClawChain modules.

    Combines agent, privacy, marketplace, governance, DEX, and
    generic Cosmos queries into a single high-entropy scenario.
    """
    cc = _get_clawchain_client(config)
    creator = "claw1loadtestmixed0000000000000000000000000"

    all_read_paths = (
        ALL_CLAWCHAIN_REST_ENDPOINTS + COSMOS_REST_ENDPOINTS
    )

    def _random_query() -> RequestResult:
        path = random.choice(all_read_paths)
        return cc._rest_get(path)

    def _register_agent() -> RequestResult:
        return cc.register_agent(creator)

    def _shield() -> RequestResult:
        return cc.shield_tokens(creator)

    def _list_skill() -> RequestResult:
        return cc.list_skill(creator)

    def _vote() -> RequestResult:
        return cc.submit_vote(creator, proposal_id="1")

    def _send() -> RequestResult:
        return cc.send_tokens(creator, creator, amount="100")

    def _heartbeat() -> RequestResult:
        return cc.agent_heartbeat(creator)

    fns: typing.List[typing.Callable[[], RequestResult]] = [
        _random_query,
        _random_query,
        _random_query,
        _register_agent,
        _shield,
        _list_skill,
        _vote,
        _send,
        _heartbeat,
    ]
    return _run_sync_scenario(
        "clawchain_mixed", fns, concurrency, duration_s
    )


# ------------------------------------------------------------------
# scenario registry
# ------------------------------------------------------------------


SCENARIOS: typing.Dict[
    str,
    typing.Callable[..., typing.Any],
] = {
    # --- original generic scenarios (async, require aiohttp) ---
    "read": run_read_scenario,
    "blocks": run_block_scenario,
    "validators": run_validator_scenario,
    "agents": run_agent_scenario,
    "mixed": run_mixed_scenario,
    # --- ClawChain-specific scenarios (sync, use requests) ---
    "agent_lifecycle": run_agent_lifecycle_scenario,
    "privacy_flow": run_privacy_flow_scenario,
    "marketplace_flow": run_marketplace_flow_scenario,
    "governance_flow": run_governance_flow_scenario,
    "dex_flow": run_dex_flow_scenario,
    "clawchain_mixed": run_clawchain_mixed_scenario,
}


# ------------------------------------------------------------------
# reporting
# ------------------------------------------------------------------


def format_results(result: ScenarioResult) -> str:
    """Format a ``ScenarioResult`` as a human-readable report."""
    return (
        "\n"
        "Flood Cosmos Load Test Results\n"
        "{'=' * 40}\n"
        f"Scenario:     {result.scenario}\n"
        f"Duration:     {result.duration_s:.1f}s\n"
        "\n"
        "Requests\n"
        f"  Total:      {result.total_requests:,}\n"
        f"  Successful: {result.successful:,}"
        f" ({result.successful / max(result.total_requests, 1) * 100:.1f}%)\n"
        f"  Failed:     {result.failed:,}\n"
        f"  Rate:       {result.requests_per_second:.1f} req/s\n"
        "\n"
        "Latency (ms)\n"
        f"  Min:    {result.latency_min_ms:.1f}\n"
        f"  Mean:   {result.latency_mean_ms:.1f}\n"
        f"  p50:    {result.latency_p50_ms:.1f}\n"
        f"  p95:    {result.latency_p95_ms:.1f}\n"
        f"  p99:    {result.latency_p99_ms:.1f}\n"
        f"  Max:    {result.latency_max_ms:.1f}\n"
        "\n"
        f"Data:         {result.total_bytes:,} bytes\n"
    )
