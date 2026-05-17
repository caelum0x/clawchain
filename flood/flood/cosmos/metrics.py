"""Metrics collection and reporting for ClawChain load tests.

All data structures use only the standard library so that the module
has zero external runtime dependencies beyond ``requests``.
"""

from __future__ import annotations

import math
import time
import typing
from dataclasses import dataclass, field

from .client import RequestResult


# ------------------------------------------------------------------
# Per-operation metrics bucket
# ------------------------------------------------------------------


@dataclass
class OperationMetrics:
    """Running metrics for a single operation type (e.g. ``register_agent``)."""

    operation: str
    latencies_ms: typing.List[float] = field(default_factory=list)
    successes: int = 0
    failures: int = 0
    total_bytes: int = 0

    def record(self, result: RequestResult) -> None:
        """Record a single ``RequestResult`` into this bucket."""
        self.latencies_ms.append(result.latency_ms)
        if result.success:
            self.successes += 1
        else:
            self.failures += 1
        self.total_bytes += result.response_bytes

    @property
    def total(self) -> int:
        return self.successes + self.failures

    @property
    def success_rate(self) -> float:
        return self.successes / max(self.total, 1)

    @property
    def failure_rate(self) -> float:
        return self.failures / max(self.total, 1)

    @property
    def mean_latency_ms(self) -> float:
        if not self.latencies_ms:
            return 0.0
        return sum(self.latencies_ms) / len(self.latencies_ms)

    @property
    def min_latency_ms(self) -> float:
        return min(self.latencies_ms) if self.latencies_ms else 0.0

    @property
    def max_latency_ms(self) -> float:
        return max(self.latencies_ms) if self.latencies_ms else 0.0

    def percentile(self, pct: float) -> float:
        """Return the *pct*-th percentile of recorded latencies."""
        if not self.latencies_ms:
            return 0.0
        s = sorted(self.latencies_ms)
        idx = int(len(s) * pct / 100)
        return s[min(idx, len(s) - 1)]

    @property
    def p50_ms(self) -> float:
        return self.percentile(50)

    @property
    def p95_ms(self) -> float:
        return self.percentile(95)

    @property
    def p99_ms(self) -> float:
        return self.percentile(99)

    def stddev_ms(self) -> float:
        """Standard deviation of latencies in milliseconds."""
        if len(self.latencies_ms) < 2:
            return 0.0
        mean = self.mean_latency_ms
        variance = sum((x - mean) ** 2 for x in self.latencies_ms) / len(
            self.latencies_ms
        )
        return math.sqrt(variance)


# ------------------------------------------------------------------
# Aggregate collector across multiple operation types
# ------------------------------------------------------------------


@dataclass
class MetricsCollector:
    """Collects metrics across all operation types for a load test run.

    Usage::

        collector = MetricsCollector()
        collector.record("register_agent", result)
        collector.record("query_balance", result2)
        report = collector.summary()
    """

    _start: float = field(default_factory=time.monotonic)
    _buckets: typing.Dict[str, OperationMetrics] = field(default_factory=dict)
    _block_times: typing.List[float] = field(default_factory=list)

    # -- recording -----------------------------------------------

    def record(self, operation: str, result: RequestResult) -> None:
        """Record a ``RequestResult`` into the named operation bucket."""
        if operation not in self._buckets:
            self._buckets[operation] = OperationMetrics(operation=operation)
        self._buckets[operation].record(result)

    def record_block_time(self, block_time_s: float) -> None:
        """Record a block time observation (seconds)."""
        self._block_times.append(block_time_s)

    # -- queries -------------------------------------------------

    @property
    def elapsed_s(self) -> float:
        return time.monotonic() - self._start

    @property
    def operations(self) -> typing.List[str]:
        return sorted(self._buckets.keys())

    def get(self, operation: str) -> OperationMetrics:
        """Return metrics for *operation*, creating an empty bucket if needed."""
        if operation not in self._buckets:
            self._buckets[operation] = OperationMetrics(operation=operation)
        return self._buckets[operation]

    @property
    def total_requests(self) -> int:
        return sum(b.total for b in self._buckets.values())

    @property
    def total_successes(self) -> int:
        return sum(b.successes for b in self._buckets.values())

    @property
    def total_failures(self) -> int:
        return sum(b.failures for b in self._buckets.values())

    @property
    def overall_success_rate(self) -> float:
        total = self.total_requests
        return self.total_successes / max(total, 1)

    @property
    def overall_tps(self) -> float:
        """Transactions (requests) per second across the whole run."""
        elapsed = self.elapsed_s
        return self.total_requests / max(elapsed, 0.001)

    @property
    def mean_block_time_s(self) -> float:
        if not self._block_times:
            return 0.0
        return sum(self._block_times) / len(self._block_times)

    # -- reporting -----------------------------------------------

    def summary(self) -> typing.Dict[str, typing.Any]:
        """Return a JSON-serialisable summary of all collected metrics."""
        elapsed = self.elapsed_s
        per_op: typing.Dict[str, typing.Any] = {}
        for name, bucket in sorted(self._buckets.items()):
            per_op[name] = {
                "total": bucket.total,
                "successes": bucket.successes,
                "failures": bucket.failures,
                "success_rate": round(bucket.success_rate, 4),
                "latency_mean_ms": round(bucket.mean_latency_ms, 2),
                "latency_min_ms": round(bucket.min_latency_ms, 2),
                "latency_max_ms": round(bucket.max_latency_ms, 2),
                "latency_p50_ms": round(bucket.p50_ms, 2),
                "latency_p95_ms": round(bucket.p95_ms, 2),
                "latency_p99_ms": round(bucket.p99_ms, 2),
                "latency_stddev_ms": round(bucket.stddev_ms(), 2),
                "total_bytes": bucket.total_bytes,
            }
        return {
            "elapsed_s": round(elapsed, 3),
            "total_requests": self.total_requests,
            "total_successes": self.total_successes,
            "total_failures": self.total_failures,
            "overall_success_rate": round(self.overall_success_rate, 4),
            "overall_tps": round(self.overall_tps, 2),
            "mean_block_time_s": round(self.mean_block_time_s, 3),
            "block_time_observations": len(self._block_times),
            "operations": per_op,
        }

    def format_report(self) -> str:
        """Return a human-readable text report."""
        lines: typing.List[str] = []
        s = self.summary()
        lines.append("")
        lines.append("=" * 60)
        lines.append("ClawChain Load Test Metrics Report")
        lines.append("=" * 60)
        lines.append(f"Elapsed:           {s['elapsed_s']:.1f}s")
        lines.append(f"Total requests:    {s['total_requests']:,}")
        lines.append(f"Successes:         {s['total_successes']:,}")
        lines.append(f"Failures:          {s['total_failures']:,}")
        lines.append(
            f"Success rate:      {s['overall_success_rate'] * 100:.1f}%"
        )
        lines.append(f"Overall TPS:       {s['overall_tps']:.1f}")
        if s["block_time_observations"] > 0:
            lines.append(
                f"Mean block time:   {s['mean_block_time_s']:.3f}s"
                f" ({s['block_time_observations']} samples)"
            )
        lines.append("")
        lines.append("-" * 60)
        lines.append(
            f"{'Operation':<28} {'Total':>6} {'OK%':>6}"
            f" {'p50':>7} {'p95':>7} {'p99':>7}"
        )
        lines.append("-" * 60)
        for name, op in sorted(s["operations"].items()):
            lines.append(
                f"{name:<28} {op['total']:>6}"
                f" {op['success_rate'] * 100:>5.1f}%"
                f" {op['latency_p50_ms']:>6.1f}ms"
                f" {op['latency_p95_ms']:>6.1f}ms"
                f" {op['latency_p99_ms']:>6.1f}ms"
            )
        lines.append("-" * 60)
        lines.append("")
        return "\n".join(lines)


# ------------------------------------------------------------------
# Block time monitor (standalone helper)
# ------------------------------------------------------------------


class BlockTimeMonitor:
    """Poll block heights and derive inter-block times.

    This is a synchronous helper meant to be run in its own thread
    alongside the async load-test workers.
    """

    def __init__(
        self,
        rest_url: str = "http://localhost:1317",
        poll_interval_s: float = 1.0,
    ) -> None:
        self.rest_url = rest_url.rstrip("/")
        self.poll_interval_s = poll_interval_s
        self._block_times: typing.List[float] = []
        self._last_height: int = 0
        self._last_ts: float = 0.0

    def poll_once(self) -> typing.Optional[float]:
        """Query the latest block and return the block time delta, or
        ``None`` if not enough data points yet.

        Uses ``requests`` for simplicity (runs in a background thread).
        """
        import requests  # type: ignore

        try:
            url = (
                f"{self.rest_url}"
                "/cosmos/base/tendermint/v1beta1/blocks/latest"
            )
            resp = requests.get(url, timeout=5)
            if resp.status_code != 200:
                return None
            data = resp.json()
            height = int(data["block"]["header"]["height"])
            now = time.monotonic()
            if self._last_height > 0 and height > self._last_height:
                delta = now - self._last_ts
                self._block_times.append(delta)
                self._last_height = height
                self._last_ts = now
                return delta
            if self._last_height == 0:
                self._last_height = height
                self._last_ts = now
            return None
        except Exception:
            return None

    @property
    def block_times(self) -> typing.List[float]:
        return list(self._block_times)

    @property
    def mean_block_time(self) -> float:
        if not self._block_times:
            return 0.0
        return sum(self._block_times) / len(self._block_times)
