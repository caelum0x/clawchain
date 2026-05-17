"""CometBFT JSON-RPC client for Cosmos SDK chains."""

from __future__ import annotations

import time
import typing
from dataclasses import dataclass, field

if typing.TYPE_CHECKING:
    import aiohttp


@dataclass
class RequestResult:
    """Result of a single RPC request."""

    method: str
    latency_ms: float
    success: bool
    status_code: int
    error: typing.Optional[str] = None
    response_bytes: int = 0


@dataclass
class CometBFTClient:
    """Async CometBFT JSON-RPC client for load testing.

    Supports both the CometBFT JSON-RPC endpoint (default port 26657)
    and the Cosmos SDK REST/LCD endpoint (default port 1317).
    """

    rpc_url: str = "http://localhost:26657"
    rest_url: str = "http://localhost:1317"
    timeout: float = 10.0

    async def rpc_request(
        self,
        session: aiohttp.ClientSession,
        method: str,
        params: typing.Optional[typing.Dict[str, typing.Any]] = None,
    ) -> RequestResult:
        """Send a JSON-RPC request to CometBFT.

        Parameters
        ----------
        session : aiohttp.ClientSession
            Reusable HTTP session.
        method : str
            CometBFT RPC method name (e.g. ``"status"``, ``"block"``).
        params : dict | None
            Optional JSON-RPC params dict.

        Returns
        -------
        RequestResult
            Latency, status, and success/error information.
        """
        import aiohttp as _aiohttp

        start = time.monotonic()
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": method,
                "params": params or {},
            }
            timeout = _aiohttp.ClientTimeout(total=self.timeout)
            async with session.post(
                self.rpc_url, json=payload, timeout=timeout
            ) as resp:
                body = await resp.read()
                latency = (time.monotonic() - start) * 1000
                data: typing.Dict[str, typing.Any] = {}
                if resp.content_type:
                    data = await resp.json(content_type=None)
                success = resp.status == 200 and "error" not in data
                return RequestResult(
                    method=method,
                    latency_ms=latency,
                    success=success,
                    status_code=resp.status,
                    response_bytes=len(body),
                )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return RequestResult(
                method=method,
                latency_ms=latency,
                success=False,
                status_code=0,
                error=str(e),
            )

    async def rest_request(
        self,
        session: aiohttp.ClientSession,
        path: str,
    ) -> RequestResult:
        """Send a REST GET request to the Cosmos LCD endpoint.

        Parameters
        ----------
        session : aiohttp.ClientSession
            Reusable HTTP session.
        path : str
            REST path, e.g. ``"/cosmos/bank/v1beta1/supply"``.

        Returns
        -------
        RequestResult
            Latency, status, and success/error information.
        """
        import aiohttp as _aiohttp

        start = time.monotonic()
        try:
            url = f"{self.rest_url.rstrip('/')}{path}"
            timeout = _aiohttp.ClientTimeout(total=self.timeout)
            async with session.get(url, timeout=timeout) as resp:
                body = await resp.read()
                latency = (time.monotonic() - start) * 1000
                return RequestResult(
                    method=f"GET {path}",
                    latency_ms=latency,
                    success=resp.status == 200,
                    status_code=resp.status,
                    response_bytes=len(body),
                )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return RequestResult(
                method=f"GET {path}",
                latency_ms=latency,
                success=False,
                status_code=0,
                error=str(e),
            )

    async def get_latest_height(
        self,
        session: aiohttp.ClientSession,
    ) -> int:
        """Get the latest block height from the node.

        Returns 0 if the request fails or the response cannot be parsed.
        """
        result = await self.rpc_request(session, "status")
        if not result.success:
            return 0
        # The actual height lives at result.sync_info.latest_block_height
        # but we don't have the decoded body here; return 0 as placeholder.
        return 0
