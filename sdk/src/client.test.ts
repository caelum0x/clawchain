import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { ClawChainClient } from "./client.js";
import {
  DEFAULT_RPC_URL,
  DEFAULT_REST_URL,
  DEFAULT_PREFIX,
  DEFAULT_GAS_PRICE,
  DEFAULT_DENOM,
  IBC_PRIVACY_MEMO_KEY,
} from "./constants.js";

// ---------------------------------------------------------------------------
// ClawChainClient constructor & configuration
// ---------------------------------------------------------------------------

describe("ClawChainClient constructor", () => {
  test("uses defaults when no options provided", () => {
    const client = new ClawChainClient();
    // restUrl is derived from rpcUrl
    assert.equal((client as any).rpcUrl, DEFAULT_RPC_URL);
    assert.equal((client as any).prefix, DEFAULT_PREFIX);
    assert.equal((client as any).gasPriceStr, DEFAULT_GAS_PRICE);
  });

  test("accepts custom rpcUrl", () => {
    const client = new ClawChainClient({ rpcUrl: "http://mynode:26657" });
    assert.equal((client as any).rpcUrl, "http://mynode:26657");
  });

  test("derives restUrl from rpcUrl (port 1317)", () => {
    const client = new ClawChainClient({ rpcUrl: "http://mynode:26657" });
    assert.equal((client as any).restUrl, "http://mynode:1317");
  });

  test("derives restUrl from https rpcUrl", () => {
    const client = new ClawChainClient({ rpcUrl: "https://secure.node:26657" });
    assert.equal((client as any).restUrl, "https://secure.node:1317");
  });

  test("falls back to DEFAULT_REST_URL on invalid rpcUrl", () => {
    const client = new ClawChainClient({ rpcUrl: "not-a-url" });
    assert.equal((client as any).restUrl, DEFAULT_REST_URL);
  });

  test("accepts custom prefix", () => {
    const client = new ClawChainClient({ prefix: "claw" });
    assert.equal((client as any).prefix, "claw");
  });

  test("accepts custom gasPrice", () => {
    const client = new ClawChainClient({ gasPrice: "0.1uclaw" });
    assert.equal((client as any).gasPriceStr, "0.1uclaw");
  });

  test("stores mnemonic when provided", () => {
    const mnemonic = "test test test test test test test test test test test junk";
    const client = new ClawChainClient({ mnemonic });
    assert.equal((client as any).mnemonic, mnemonic);
  });

  test("mnemonic is undefined when not provided", () => {
    const client = new ClawChainClient();
    assert.equal((client as any).mnemonic, undefined);
  });

  test("starts with null clients", () => {
    const client = new ClawChainClient();
    assert.equal((client as any).queryClient, null);
    assert.equal((client as any).signingClient, null);
    assert.equal((client as any).wallet, null);
    assert.equal((client as any).signerAddress, null);
  });
});

// ---------------------------------------------------------------------------
// Error guards
// ---------------------------------------------------------------------------

describe("ClawChainClient error guards", () => {
  test("getAddress throws when not connected", () => {
    const client = new ClawChainClient();
    assert.throws(
      () => client.getAddress(),
      (err: Error) => {
        assert.ok(err.message.includes("not connected"));
        return true;
      },
    );
  });

  test("getBalance throws when query client not connected", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () => client.getBalance("cosmos1abc"),
      (err: Error) => {
        assert.ok(err.message.includes("not connected"));
        return true;
      },
    );
  });

  test("shield throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () => client.shield({ amount: 1000n }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("registerAgent throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.registerAgent({
          pubkey: "key",
          endpoint: "http://agent",
          name: "test",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("sendOnChainMessage throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.sendOnChainMessage({
          recipient: "cosmos1xyz",
          ciphertext: "enc",
          nonce: "n",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("listSkill throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.listSkill({
          name: "test-skill",
          description: "A skill",
          price: "100",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("vote throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () => client.vote({ proposalId: 1, option: "yes" }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("delegateTask throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.delegateTask({
          assignee: "cosmos1abc",
          description: "do work",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("rateAgent throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.rateAgent({
          agentAddress: "cosmos1abc",
          skillId: 1,
          score: 5,
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("createEscrow throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.createEscrow({
          skillId: 1,
          deadlineBlocks: 100,
          description: "test",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("ibcShieldTransfer throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.ibcShieldTransfer({
          sourceChannel: "channel-0",
          denom: "uclaw",
          amount: "1000",
          receiver: "cosmos1abc",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// IBC memo format
// ---------------------------------------------------------------------------

describe("IBC shield memo format", () => {
  test("IBC_PRIVACY_MEMO_KEY constructs valid JSON memo", () => {
    const memo = JSON.stringify({
      [IBC_PRIVACY_MEMO_KEY]: { auto_shield: true },
    });
    const parsed = JSON.parse(memo);
    assert.ok(IBC_PRIVACY_MEMO_KEY in parsed);
    assert.equal(parsed[IBC_PRIVACY_MEMO_KEY].auto_shield, true);
  });

  test("memo with auto_shield=false", () => {
    const memo = JSON.stringify({
      [IBC_PRIVACY_MEMO_KEY]: { auto_shield: false },
    });
    const parsed = JSON.parse(memo);
    assert.equal(parsed[IBC_PRIVACY_MEMO_KEY].auto_shield, false);
  });
});

// ---------------------------------------------------------------------------
// disconnect is safe when not connected
// ---------------------------------------------------------------------------

describe("ClawChainClient disconnect", () => {
  test("disconnect does not throw when not connected", async () => {
    const client = new ClawChainClient();
    await client.disconnect(); // should be a no-op
    assert.equal((client as any).queryClient, null);
    assert.equal((client as any).signingClient, null);
  });
});

// ---------------------------------------------------------------------------
// Staking query tests (mock fetch)
// ---------------------------------------------------------------------------

/**
 * Helper: create a ClawChainClient and override global fetch to return
 * the given mock response body.  Returns {client, fetchCalls} where
 * fetchCalls collects every URL that was fetched.
 */
function mockFetchClient(mockBody: unknown, httpStatus = 200) {
  const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: any, _init?: any) => {
    fetchCalls.push(String(input));
    return {
      ok: httpStatus >= 200 && httpStatus < 300,
      status: httpStatus,
      json: async () => mockBody,
      text: async () => JSON.stringify(mockBody),
    } as Response;
  }) as typeof globalThis.fetch;

  const restore = () => {
    globalThis.fetch = originalFetch;
  };

  return { client, fetchCalls, restore };
}

describe("ClawChainClient staking queries", () => {
  test("getValidators parses response correctly", async () => {
    const mockResponse = {
      validators: [
        {
          operator_address: "cosmosvaloper1abc",
          description: { moniker: "MyValidator" },
          tokens: "1000000",
          commission: { commission_rates: { rate: "0.100000" } },
          status: "BOND_STATUS_BONDED",
          jailed: false,
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getValidators();
      assert.equal(result.validators.length, 1);
      assert.equal(result.validators[0].operatorAddress, "cosmosvaloper1abc");
      assert.equal(result.validators[0].moniker, "MyValidator");
      assert.equal(result.validators[0].tokens, "1000000");
      assert.equal(result.validators[0].commission, "0.100000");
      assert.equal(result.validators[0].status, "BOND_STATUS_BONDED");
      assert.equal(result.validators[0].jailed, false);
      assert.ok(fetchCalls[0].includes("/cosmos/staking/v1beta1/validators"));
    } finally {
      restore();
    }
  });

  test("getValidators passes status filter", async () => {
    const { client, fetchCalls, restore } = mockFetchClient({ validators: [] });
    try {
      await client.getValidators("BOND_STATUS_BONDED");
      assert.ok(fetchCalls[0].includes("status=BOND_STATUS_BONDED"));
    } finally {
      restore();
    }
  });

  test("getDelegations parses response correctly", async () => {
    const mockResponse = {
      delegation_responses: [
        {
          delegation: {
            validator_address: "cosmosvaloper1abc",
            shares: "1000000.000000",
          },
          balance: { denom: "uclaw", amount: "1000000" },
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getDelegations("cosmos1delegator");
      assert.equal(result.delegations.length, 1);
      assert.equal(result.delegations[0].validatorAddress, "cosmosvaloper1abc");
      assert.equal(result.delegations[0].shares, "1000000.000000");
      assert.equal(result.delegations[0].balance.denom, "uclaw");
      assert.equal(result.delegations[0].balance.amount, "1000000");
      assert.ok(fetchCalls[0].includes("/cosmos/staking/v1beta1/delegations/cosmos1delegator"));
    } finally {
      restore();
    }
  });

  test("getStakingRewards parses response correctly", async () => {
    const mockResponse = {
      rewards: [
        {
          validator_address: "cosmosvaloper1abc",
          reward: [{ denom: "uclaw", amount: "500.000000" }],
        },
      ],
      total: [{ denom: "uclaw", amount: "500.000000" }],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getStakingRewards("cosmos1delegator");
      assert.equal(result.rewards.length, 1);
      assert.equal(result.rewards[0].validatorAddress, "cosmosvaloper1abc");
      assert.equal(result.rewards[0].reward[0].denom, "uclaw");
      assert.equal(result.rewards[0].reward[0].amount, "500.000000");
      assert.equal(result.total.length, 1);
      assert.equal(result.total[0].amount, "500.000000");
      assert.ok(fetchCalls[0].includes("/cosmos/distribution/v1beta1/delegators/cosmos1delegator/rewards"));
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Staking transaction tests (error guards)
// ---------------------------------------------------------------------------

describe("ClawChainClient staking transactions", () => {
  test("stakingDelegate throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.stakingDelegate({
          validatorAddress: "cosmosvaloper1abc",
          amount: "1000000",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("stakingUndelegate throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.stakingUndelegate({
          validatorAddress: "cosmosvaloper1abc",
          amount: "1000000",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("withdrawRewards throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.withdrawRewards({
          validatorAddress: "cosmosvaloper1abc",
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// IBC query tests (mock fetch)
// ---------------------------------------------------------------------------

describe("ClawChainClient IBC queries", () => {
  test("getIBCChannels parses response correctly", async () => {
    const mockResponse = {
      channels: [
        {
          channel_id: "channel-0",
          port_id: "transfer",
          state: "STATE_OPEN",
          counterparty: { channel_id: "channel-1", port_id: "transfer" },
          connection_hops: ["connection-0"],
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getIBCChannels();
      assert.equal(result.channels.length, 1);
      assert.equal(result.channels[0].channelId, "channel-0");
      assert.equal(result.channels[0].portId, "transfer");
      assert.equal(result.channels[0].state, "STATE_OPEN");
      assert.equal(result.channels[0].counterpartyChannelId, "channel-1");
      assert.equal(result.channels[0].counterpartyPortId, "transfer");
      assert.deepEqual(result.channels[0].connectionHops, ["connection-0"]);
      assert.ok(fetchCalls[0].includes("/ibc/core/channel/v1/channels"));
    } finally {
      restore();
    }
  });

  test("getIBCConnections parses response correctly", async () => {
    const mockResponse = {
      connections: [
        {
          id: "connection-0",
          client_id: "07-tendermint-0",
          state: "STATE_OPEN",
          counterparty: {
            connection_id: "connection-1",
            client_id: "07-tendermint-1",
          },
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getIBCConnections();
      assert.equal(result.connections.length, 1);
      assert.equal(result.connections[0].id, "connection-0");
      assert.equal(result.connections[0].clientId, "07-tendermint-0");
      assert.equal(result.connections[0].state, "STATE_OPEN");
      assert.equal(result.connections[0].counterpartyConnectionId, "connection-1");
      assert.equal(result.connections[0].counterpartyClientId, "07-tendermint-1");
      assert.ok(fetchCalls[0].includes("/ibc/core/connection/v1/connections"));
    } finally {
      restore();
    }
  });

  test("getIBCClients parses response correctly", async () => {
    const mockResponse = {
      client_states: [
        {
          client_id: "07-tendermint-0",
          client_state: {
            "@type": "/ibc.lightclients.tendermint.v1.ClientState",
            chain_id: "osmosis-1",
          },
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getIBCClients();
      assert.equal(result.clients.length, 1);
      assert.equal(result.clients[0].clientId, "07-tendermint-0");
      assert.equal(result.clients[0].clientType, "/ibc.lightclients.tendermint.v1.ClientState");
      assert.equal(result.clients[0].chainId, "osmosis-1");
      assert.ok(fetchCalls[0].includes("/ibc/core/client/v1/client_states"));
    } finally {
      restore();
    }
  });

  test("getIBCDenomTraces parses response correctly", async () => {
    const mockResponse = {
      denom_traces: [
        {
          path: "transfer/channel-0",
          base_denom: "uosmo",
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getIBCDenomTraces();
      assert.equal(result.denomTraces.length, 1);
      assert.equal(result.denomTraces[0].path, "transfer/channel-0");
      assert.equal(result.denomTraces[0].baseDenom, "uosmo");
      assert.ok(fetchCalls[0].includes("/ibc/apps/transfer/v1/denom_traces"));
    } finally {
      restore();
    }
  });

  test("getIBCRemoteAgents parses response correctly", async () => {
    const mockResponse = {
      agents: [
        {
          agent_address: "cosmos1remoteagent",
          name: "remote-gpt",
          source_chain: "osmosis-1",
          channel_id: "channel-0",
          capabilities: ["inference", "training"],
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getIBCRemoteAgents();
      assert.equal(result.agents.length, 1);
      assert.equal(result.agents[0].agentAddress, "cosmos1remoteagent");
      assert.equal(result.agents[0].name, "remote-gpt");
      assert.equal(result.agents[0].sourceChain, "osmosis-1");
      assert.equal(result.agents[0].channelId, "channel-0");
      assert.deepEqual(result.agents[0].capabilities, ["inference", "training"]);
      assert.ok(fetchCalls[0].includes("/clawchain/agent/v1/remote_agents"));
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Escrow query tests (mock fetch)
// ---------------------------------------------------------------------------

describe("ClawChainClient escrow queries", () => {
  test("getEscrow parses response correctly", async () => {
    const mockResponse = {
      escrow: {
        id: 1,
        buyer: "cosmos1buyer",
        seller: "cosmos1seller",
        skillId: "skill-42",
        amount: { denom: "uclaw", amount: "5000000" },
        status: "active",
        milestones: [],
        createdAt: "1709769600",
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getEscrow(1);
      assert.deepEqual(result.escrow.id, 1);
      assert.equal(result.escrow.buyer, "cosmos1buyer");
      assert.equal(result.escrow.seller, "cosmos1seller");
      assert.equal(result.escrow.status, "active");
      assert.ok(fetchCalls[0].includes("/clawchain/marketplace/v1/escrow/1"));
    } finally {
      restore();
    }
  });

  test("getEscrows parses response correctly", async () => {
    const mockResponse = {
      escrows: [
        {
          id: 1,
          buyer: "cosmos1buyer",
          seller: "cosmos1seller",
          skillId: "skill-42",
          amount: { denom: "uclaw", amount: "5000000" },
          status: "active",
          milestones: [],
          createdAt: "1709769600",
        },
        {
          id: 2,
          buyer: "cosmos1buyer",
          seller: "cosmos1other",
          skillId: "skill-99",
          amount: { denom: "uclaw", amount: "2000000" },
          status: "completed",
          milestones: [],
          createdAt: "1709856000",
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getEscrows("cosmos1buyer");
      assert.equal(result.escrows.length, 2);
      assert.equal(result.escrows[0].buyer, "cosmos1buyer");
      assert.equal(result.escrows[1].status, "completed");
      assert.ok(fetchCalls[0].includes("/clawchain/marketplace/v1/escrows/cosmos1buyer"));
    } finally {
      restore();
    }
  });

  test("getDispute parses response correctly", async () => {
    const mockResponse = {
      dispute: {
        escrowId: 1,
        initiator: "cosmos1buyer",
        reason: "Service not delivered",
        status: "open",
        createdAt: "1709769600",
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getDispute(1);
      assert.equal(result.dispute.escrowId, 1);
      assert.equal(result.dispute.initiator, "cosmos1buyer");
      assert.equal(result.dispute.reason, "Service not delivered");
      assert.equal(result.dispute.status, "open");
      assert.ok(fetchCalls[0].includes("/clawchain/marketplace/v1/dispute/1"));
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Compute job & resource query tests (mock fetch)
// ---------------------------------------------------------------------------

describe("ClawChainClient compute queries", () => {
  test("getComputeJob parses response correctly", async () => {
    const mockResponse = {
      job: {
        id: 42,
        resourceId: 1,
        leaseId: 10,
        submitter: "cosmos1submitter",
        provider: "cosmos1provider",
        name: "training-run-1",
        jobType: "ai-training",
        executionType: "docker",
        dockerImage: "nvidia/cuda:12.0",
        gpuType: "A100",
        gpuCount: 2,
        status: "completed",
        resultHash: "abcdef1234567890",
        submittedAt: 1709769600,
        completedAt: 1709773200,
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getComputeJob("42");
      assert.equal(result.job.id, 42);
      assert.equal(result.job.submitter, "cosmos1submitter");
      assert.equal(result.job.provider, "cosmos1provider");
      assert.equal(result.job.status, "completed");
      assert.equal(result.job.resultHash, "abcdef1234567890");
      assert.ok(fetchCalls[0].includes("/clawchain/marketplace/v1/compute_job/42"));
    } finally {
      restore();
    }
  });

  test("getComputeJobs parses response correctly", async () => {
    const mockResponse = {
      jobs: [
        {
          id: 1,
          resourceId: 1,
          leaseId: 5,
          submitter: "cosmos1submitter",
          provider: "cosmos1provider",
          name: "inference-job",
          jobType: "inference",
          executionType: "docker",
          gpuType: "A100",
          gpuCount: 1,
          status: "running",
          submittedAt: 1709769600,
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getComputeJobs("cosmos1submitter");
      assert.equal(result.jobs.length, 1);
      assert.equal(result.jobs[0].status, "running");
      assert.equal(result.jobs[0].submitter, "cosmos1submitter");
      assert.ok(fetchCalls[0].includes("/clawchain/marketplace/v1/compute_jobs"));
      assert.ok(fetchCalls[0].includes("address=cosmos1submitter"));
    } finally {
      restore();
    }
  });

  test("getComputeResources parses response correctly", async () => {
    const mockResponse = {
      resources: [
        {
          id: 1,
          owner: "cosmos1provider",
          name: "gpu-node-1",
          gpuModel: "NVIDIA A100",
          gpuCount: 4,
          vramGb: 80,
          cpuCores: 32,
          ramGb: 256,
          storageGb: 2000,
          pricePerHourUclaw: "500000",
          active: true,
          region: "us-east-1",
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getComputeResources();
      assert.equal(result.resources.length, 1);
      assert.equal(result.resources[0].owner, "cosmos1provider");
      assert.equal(result.resources[0].gpuModel, "NVIDIA A100");
      assert.equal(result.resources[0].active, true);
      assert.ok(fetchCalls[0].includes("/clawchain/marketplace/v1/compute_resources"));
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Task checkpoint queries
// ---------------------------------------------------------------------------

describe("ClawChainClient task checkpoint queries", () => {
  test("checkpointTask throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.checkpointTask({
          taskId: 1,
          checkpointData: '{"step":3}',
          percentComplete: 50,
        }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("getTaskCheckpoint parses response correctly", async () => {
    const mockResponse = {
      checkpoint: '{"step":3,"data":"partial"}',
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getTaskCheckpoint(42);
      assert.equal(result.found, true);
      assert.equal(result.checkpoint, '{"step":3,"data":"partial"}');
      assert.ok(fetchCalls[0].includes("/clawchain/agent/v1/task_checkpoint/42"));
    } finally {
      restore();
    }
  });

  test("getTaskCheckpoint returns found=false on 404", async () => {
    const { client, restore } = mockFetchClient({}, 404);
    try {
      const result = await client.getTaskCheckpoint(999);
      assert.equal(result.found, false);
      assert.equal(result.checkpoint, "");
    } finally {
      restore();
    }
  });

  test("getTaskCheckpoint throws on non-404 errors", async () => {
    const { client, restore } = mockFetchClient({ error: "server error" }, 500);
    try {
      await assert.rejects(
        () => client.getTaskCheckpoint(1),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 500"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });

  test("getTaskCheckpoint handles empty checkpoint", async () => {
    const mockResponse = { checkpoint: "" };
    const { client, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getTaskCheckpoint(7);
      assert.equal(result.found, false);
      assert.equal(result.checkpoint, "");
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Reward leaderboard
// ---------------------------------------------------------------------------

describe("ClawChainClient reward leaderboard", () => {
  test("getRewardLeaderboard aggregates and sorts agents by rewards", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    const originalFetch = globalThis.fetch;
    let callCount = 0;

    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      callCount++;
      if (url.includes("/agent/v1/rewards/cosmos1a")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ address: "cosmos1a", cumulative_rewards: "500000", denom: "uclaw" }),
          text: async () => "",
        } as Response;
      }
      if (url.includes("/agent/v1/rewards/cosmos1b")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ address: "cosmos1b", cumulative_rewards: "2000000", denom: "uclaw" }),
          text: async () => "",
        } as Response;
      }
      if (url.includes("/agent/v1/rewards/cosmos1c")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ address: "cosmos1c", cumulative_rewards: "1000000", denom: "uclaw" }),
          text: async () => "",
        } as Response;
      }
      // Live agents endpoint (must be after rewards to avoid false match)
      if (url.endsWith("/agent/v1/live") || url.includes("/agent/v1/live?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            agents: [
              { address: "cosmos1a", name: "AgentAlpha" },
              { address: "cosmos1b", name: "AgentBeta" },
              { address: "cosmos1c", name: "AgentGamma" },
            ],
          }),
          text: async () => "",
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      } as Response;
    }) as typeof globalThis.fetch;

    try {
      const result = await client.getRewardLeaderboard();
      assert.equal(result.entries.length, 3);
      // Sorted descending by rewards
      assert.equal(result.entries[0].address, "cosmos1b");
      assert.equal(result.entries[0].cumulativeRewards, "2000000");
      assert.equal(result.entries[1].address, "cosmos1c");
      assert.equal(result.entries[1].cumulativeRewards, "1000000");
      assert.equal(result.entries[2].address, "cosmos1a");
      assert.equal(result.entries[2].cumulativeRewards, "500000");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("getRewardLeaderboard respects limit parameter", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.endsWith("/agent/v1/live") || url.includes("/agent/v1/live?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            agents: [
              { address: "cosmos1a", name: "A1" },
              { address: "cosmos1b", name: "A2" },
              { address: "cosmos1c", name: "A3" },
            ],
          }),
          text: async () => "",
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ cumulative_rewards: "100", denom: "uclaw" }),
        text: async () => "",
      } as Response;
    }) as typeof globalThis.fetch;

    try {
      const result = await client.getRewardLeaderboard(2);
      assert.equal(result.entries.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("getRewardLeaderboard handles failed reward queries gracefully", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.includes("cosmos1bad")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({}),
          text: async () => "server error",
        } as Response;
      }
      // Live agents endpoint
      if (url.endsWith("/agent/v1/live") || url.includes("/agent/v1/live?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            agents: [
              { address: "cosmos1good", name: "Good" },
              { address: "cosmos1bad", name: "Bad" },
            ],
          }),
          text: async () => "",
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ cumulative_rewards: "5000", denom: "uclaw" }),
        text: async () => "",
      } as Response;
    }) as typeof globalThis.fetch;

    try {
      const result = await client.getRewardLeaderboard();
      // Only the successful agent should appear
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].address, "cosmos1good");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("getRewardLeaderboard handles empty agent list", async () => {
    const mockResponse = { agents: [] };
    const { client, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getRewardLeaderboard();
      assert.equal(result.entries.length, 0);
    } finally {
      restore();
    }
  });
});
