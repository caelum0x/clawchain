"""ClawChain-specific load test client.

Wraps the generic ``CometBFTClient`` with methods that map 1:1 to
ClawChain module transactions and queries.  Transaction methods build
the Cosmos SDK ``/cosmos/tx/v1beta1/txs`` REST payload structure
expected by the LCD broadcast endpoint.

Only depends on the standard library and ``requests``.
"""

from __future__ import annotations

import hashlib
import json
import time
import typing
from dataclasses import dataclass, field

from .client import CometBFTClient, RequestResult
from .config import ChainConfig


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _ts_now() -> str:
    """ISO-8601 timestamp string (UTC)."""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _make_tx_body(
    messages: typing.List[typing.Dict[str, typing.Any]],
    memo: str = "",
) -> typing.Dict[str, typing.Any]:
    """Build a minimal ``TxBody`` dict for Cosmos SDK broadcast."""
    return {
        "body": {
            "messages": messages,
            "memo": memo,
            "timeout_height": "0",
            "extension_options": [],
            "non_critical_extension_options": [],
        },
        "auth_info": {
            "signer_infos": [],
            "fee": {
                "amount": [{"denom": "uclaw", "amount": "500"}],
                "gas_limit": "200000",
                "payer": "",
                "granter": "",
            },
        },
        "signatures": [],
    }


# ------------------------------------------------------------------
# ClawchainClient
# ------------------------------------------------------------------


@dataclass
class ClawchainClient:
    """High-level ClawChain load test client.

    Each method returns a :class:`RequestResult` so that callers can
    feed them directly into the metrics collector.

    **Query methods** hit the Cosmos LCD REST endpoint.
    **Transaction methods** build an unsigned tx and POST it to
    ``/cosmos/tx/v1beta1/simulate`` (by default) so that the load test
    can exercise the full ante-handler pipeline without needing real
    private keys.  Set *broadcast* to ``True`` to use the broadcast
    endpoint instead (requires valid signatures).
    """

    config: ChainConfig = field(default_factory=ChainConfig)
    _inner: CometBFTClient = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._inner = CometBFTClient(
            rpc_url=self.config.rpc_url,
            rest_url=self.config.rest_url,
            timeout=self.config.timeout,
        )

    # =============================================================
    # Generic helpers
    # =============================================================

    def _rest_get(self, path: str) -> RequestResult:
        """Synchronous REST GET request."""
        import requests  # type: ignore

        start = time.monotonic()
        try:
            url = f"{self.config.rest_url.rstrip('/')}{path}"
            resp = requests.get(url, timeout=self.config.timeout)
            latency = (time.monotonic() - start) * 1000
            return RequestResult(
                method=f"GET {path}",
                latency_ms=latency,
                success=resp.status_code == 200,
                status_code=resp.status_code,
                response_bytes=len(resp.content),
            )
        except Exception as exc:
            latency = (time.monotonic() - start) * 1000
            return RequestResult(
                method=f"GET {path}",
                latency_ms=latency,
                success=False,
                status_code=0,
                error=str(exc),
            )

    def _rest_post(
        self,
        path: str,
        body: typing.Dict[str, typing.Any],
    ) -> RequestResult:
        """Synchronous REST POST request."""
        import requests  # type: ignore

        start = time.monotonic()
        try:
            url = f"{self.config.rest_url.rstrip('/')}{path}"
            resp = requests.post(
                url,
                json=body,
                timeout=self.config.timeout,
            )
            latency = (time.monotonic() - start) * 1000
            return RequestResult(
                method=f"POST {path}",
                latency_ms=latency,
                success=resp.status_code in (200, 201),
                status_code=resp.status_code,
                response_bytes=len(resp.content),
            )
        except Exception as exc:
            latency = (time.monotonic() - start) * 1000
            return RequestResult(
                method=f"POST {path}",
                latency_ms=latency,
                success=False,
                status_code=0,
                error=str(exc),
            )

    def _simulate_tx(
        self,
        messages: typing.List[typing.Dict[str, typing.Any]],
        label: str = "simulate",
    ) -> RequestResult:
        """Simulate a transaction through ``/cosmos/tx/v1beta1/simulate``."""
        tx = _make_tx_body(messages)
        return self._rest_post(
            "/cosmos/tx/v1beta1/simulate",
            {"tx_bytes": "", "tx": tx},
        )

    # =============================================================
    # Node / chain queries
    # =============================================================

    def query_status(self) -> RequestResult:
        """Query CometBFT node status via JSON-RPC."""
        import requests  # type: ignore

        start = time.monotonic()
        try:
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "status",
                "params": {},
            }
            resp = requests.post(
                self.config.rpc_url,
                json=payload,
                timeout=self.config.timeout,
            )
            latency = (time.monotonic() - start) * 1000
            data = resp.json()
            success = resp.status_code == 200 and "error" not in data
            return RequestResult(
                method="rpc_status",
                latency_ms=latency,
                success=success,
                status_code=resp.status_code,
                response_bytes=len(resp.content),
            )
        except Exception as exc:
            latency = (time.monotonic() - start) * 1000
            return RequestResult(
                method="rpc_status",
                latency_ms=latency,
                success=False,
                status_code=0,
                error=str(exc),
            )

    def query_block(self, height: typing.Optional[int] = None) -> RequestResult:
        """Query a block by height (latest if *height* is ``None``)."""
        if height is not None:
            path = f"/cosmos/base/tendermint/v1beta1/blocks/{height}"
        else:
            path = "/cosmos/base/tendermint/v1beta1/blocks/latest"
        return self._rest_get(path)

    def query_balance(self, address: str) -> RequestResult:
        """Query all balances for *address*."""
        return self._rest_get(
            f"/cosmos/bank/v1beta1/balances/{address}"
        )

    # =============================================================
    # Agent module
    # =============================================================

    def query_agents(self) -> RequestResult:
        """List live agents."""
        return self._rest_get("/clawchain/agent/v1/live")

    def query_agent(self, address: str) -> RequestResult:
        """Query a specific agent by address."""
        return self._rest_get(f"/clawchain/agent/v1/agent/{address}")

    def query_agent_tasks(self, address: str) -> RequestResult:
        """Query tasks assigned to an agent."""
        return self._rest_get(
            f"/clawchain/agent/v1/tasks/assignee/{address}"
        )

    def query_agent_rewards(self, address: str) -> RequestResult:
        """Query accumulated rewards for an agent."""
        return self._rest_get(f"/clawchain/agent/v1/rewards/{address}")

    def register_agent(
        self,
        creator: str,
        name: str = "load-test-agent",
        description: str = "flood load test agent",
        capabilities: typing.Optional[typing.List[str]] = None,
    ) -> RequestResult:
        """Simulate a ``MsgRegisterAgent`` transaction."""
        msg = {
            "@type": "/clawchain.agent.v1.MsgRegisterAgent",
            "creator": creator,
            "name": name,
            "description": description,
            "url": "https://load-test.clawchain.dev",
            "capabilities": capabilities or ["inference", "compute"],
        }
        return self._simulate_tx([msg], label="register_agent")

    def agent_heartbeat(self, creator: str) -> RequestResult:
        """Simulate a ``MsgAgentHeartbeat`` transaction."""
        msg = {
            "@type": "/clawchain.agent.v1.MsgAgentHeartbeat",
            "creator": creator,
            "metadata": json.dumps({"ts": _ts_now(), "load": 0.42}),
        }
        return self._simulate_tx([msg], label="agent_heartbeat")

    def delegate_task(
        self,
        creator: str,
        agent_address: str,
        description: str = "load-test-task",
        reward_amount: str = "1000",
    ) -> RequestResult:
        """Simulate a ``MsgDelegateTask`` transaction."""
        msg = {
            "@type": "/clawchain.agent.v1.MsgDelegateTask",
            "creator": creator,
            "agent_address": agent_address,
            "description": description,
            "reward": {
                "denom": self.config.denom,
                "amount": reward_amount,
            },
        }
        return self._simulate_tx([msg], label="delegate_task")

    def accept_task(self, creator: str, task_id: str) -> RequestResult:
        """Simulate a ``MsgAcceptTask`` transaction."""
        msg = {
            "@type": "/clawchain.agent.v1.MsgAcceptTask",
            "creator": creator,
            "task_id": task_id,
        }
        return self._simulate_tx([msg], label="accept_task")

    def complete_task(
        self,
        creator: str,
        task_id: str,
        result_data: str = "done",
    ) -> RequestResult:
        """Simulate a ``MsgCompleteTask`` transaction."""
        msg = {
            "@type": "/clawchain.agent.v1.MsgCompleteTask",
            "creator": creator,
            "task_id": task_id,
            "result": result_data,
        }
        return self._simulate_tx([msg], label="complete_task")

    # =============================================================
    # Privacy module
    # =============================================================

    def query_merkle_root(self) -> RequestResult:
        """Query the privacy pool Merkle root."""
        return self._rest_get("/clawchain/privacy/v1/merkle_root")

    def query_tree_stats(self) -> RequestResult:
        """Query Merkle tree statistics."""
        return self._rest_get("/clawchain/privacy/v1/tree_stats")

    def query_nullifier_exists(self, nullifier: str) -> RequestResult:
        """Check whether a nullifier has been spent."""
        return self._rest_get(
            f"/clawchain/privacy/v1/nullifier_exists/{nullifier}"
        )

    def shield_tokens(
        self,
        creator: str,
        amount: str = "10000",
        commitment: str = "",
    ) -> RequestResult:
        """Simulate a ``MsgShield`` transaction."""
        if not commitment:
            commitment = hashlib.sha256(
                f"{creator}:{amount}:{time.monotonic()}".encode()
            ).hexdigest()
        msg = {
            "@type": "/clawchain.privacy.v1.MsgShield",
            "creator": creator,
            "amount": {"denom": self.config.denom, "amount": amount},
            "commitment": commitment,
        }
        return self._simulate_tx([msg], label="shield_tokens")

    def private_transfer(
        self,
        creator: str,
        nullifier: str = "",
        commitment: str = "",
        proof: str = "",
    ) -> RequestResult:
        """Simulate a ``MsgPrivateTransfer`` transaction."""
        if not nullifier:
            nullifier = hashlib.sha256(
                f"null:{creator}:{time.monotonic()}".encode()
            ).hexdigest()
        if not commitment:
            commitment = hashlib.sha256(
                f"comm:{creator}:{time.monotonic()}".encode()
            ).hexdigest()
        msg = {
            "@type": "/clawchain.privacy.v1.MsgPrivateTransfer",
            "creator": creator,
            "nullifier": nullifier,
            "new_commitment": commitment,
            "proof": proof or "0x00",
            "root": "",
        }
        return self._simulate_tx([msg], label="private_transfer")

    def unshield_tokens(
        self,
        creator: str,
        amount: str = "5000",
        nullifier: str = "",
        proof: str = "",
    ) -> RequestResult:
        """Simulate a ``MsgUnshield`` transaction."""
        if not nullifier:
            nullifier = hashlib.sha256(
                f"unshield:{creator}:{time.monotonic()}".encode()
            ).hexdigest()
        msg = {
            "@type": "/clawchain.privacy.v1.MsgUnshield",
            "creator": creator,
            "amount": {"denom": self.config.denom, "amount": amount},
            "nullifier": nullifier,
            "proof": proof or "0x00",
            "root": "",
        }
        return self._simulate_tx([msg], label="unshield_tokens")

    # =============================================================
    # Marketplace module
    # =============================================================

    def query_skills(self) -> RequestResult:
        """List marketplace skills."""
        return self._rest_get("/clawchain/marketplace/v1/skills")

    def query_skill(self, skill_id: str) -> RequestResult:
        """Query a single marketplace skill."""
        return self._rest_get(f"/clawchain/marketplace/v1/skill/{skill_id}")

    def query_escrow(self, escrow_id: str) -> RequestResult:
        """Query escrow details."""
        return self._rest_get(
            f"/clawchain/marketplace/v1/escrow/{escrow_id}"
        )

    def list_skill(
        self,
        creator: str,
        name: str = "load-test-skill",
        price: str = "5000",
        category: str = "compute",
    ) -> RequestResult:
        """Simulate a ``MsgListSkill`` transaction."""
        msg = {
            "@type": "/clawchain.marketplace.v1.MsgListSkill",
            "creator": creator,
            "name": name,
            "description": f"Load test skill {name}",
            "price": {"denom": self.config.denom, "amount": price},
            "category": category,
        }
        return self._simulate_tx([msg], label="list_skill")

    def purchase_skill(
        self,
        creator: str,
        skill_id: str,
    ) -> RequestResult:
        """Simulate a ``MsgPurchaseSkill`` transaction."""
        msg = {
            "@type": "/clawchain.marketplace.v1.MsgPurchaseSkill",
            "creator": creator,
            "skill_id": skill_id,
        }
        return self._simulate_tx([msg], label="purchase_skill")

    def create_escrow(
        self,
        creator: str,
        provider: str,
        amount: str = "10000",
    ) -> RequestResult:
        """Simulate a ``MsgCreateEscrow`` transaction."""
        msg = {
            "@type": "/clawchain.marketplace.v1.MsgCreateEscrow",
            "creator": creator,
            "provider": provider,
            "amount": {"denom": self.config.denom, "amount": amount},
            "description": "load-test escrow",
        }
        return self._simulate_tx([msg], label="create_escrow")

    def complete_escrow(
        self,
        creator: str,
        escrow_id: str,
    ) -> RequestResult:
        """Simulate a ``MsgCompleteEscrow`` transaction."""
        msg = {
            "@type": "/clawchain.marketplace.v1.MsgCompleteEscrow",
            "creator": creator,
            "escrow_id": escrow_id,
        }
        return self._simulate_tx([msg], label="complete_escrow")

    # =============================================================
    # Governance module
    # =============================================================

    def query_proposals(self) -> RequestResult:
        """List governance proposals."""
        return self._rest_get("/clawchain/governance/v1/proposals")

    def query_proposal(self, proposal_id: str) -> RequestResult:
        """Query a single governance proposal."""
        return self._rest_get(
            f"/clawchain/governance/v1/proposal/{proposal_id}"
        )

    def submit_vote(
        self,
        creator: str,
        proposal_id: str = "1",
        option: str = "VOTE_OPTION_YES",
    ) -> RequestResult:
        """Simulate a ``MsgVote`` transaction."""
        msg = {
            "@type": "/clawchain.governance.v1.MsgVote",
            "creator": creator,
            "proposal_id": proposal_id,
            "option": option,
        }
        return self._simulate_tx([msg], label="submit_vote")

    def submit_proposal(
        self,
        creator: str,
        title: str = "Load Test Proposal",
        description: str = "Automated load test governance proposal",
    ) -> RequestResult:
        """Simulate a ``MsgSubmitProposal`` transaction."""
        msg = {
            "@type": "/clawchain.governance.v1.MsgSubmitProposal",
            "creator": creator,
            "title": title,
            "description": description,
            "deposit": [{"denom": self.config.denom, "amount": "100000"}],
        }
        return self._simulate_tx([msg], label="submit_proposal")

    # =============================================================
    # DEX (CosmWasm) queries
    # =============================================================

    def query_dex_pairs(self) -> RequestResult:
        """Query the DEX factory for registered pairs."""
        return self._rest_get(
            "/cosmwasm/wasm/v1/contract/claw1factory/smart/"
            "eyJwYWlycyI6e319"  # base64('{"pairs":{}}')
        )

    # =============================================================
    # Bank / token transfer
    # =============================================================

    def send_tokens(
        self,
        from_address: str,
        to_address: str,
        amount: str = "1000",
    ) -> RequestResult:
        """Simulate a ``MsgSend`` transaction."""
        msg = {
            "@type": "/cosmos.bank.v1beta1.MsgSend",
            "from_address": from_address,
            "to_address": to_address,
            "amount": [{"denom": self.config.denom, "amount": amount}],
        }
        return self._simulate_tx([msg], label="send_tokens")
