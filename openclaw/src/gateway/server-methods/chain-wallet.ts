import {
  getBlockchainAgent,
  getBlockchainAddress,
} from "../../../extensions/clawchain/index.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestHandlers } from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Default LCD endpoint when the agent client doesn't expose one. */
const DEFAULT_LCD = "http://localhost:1317";

/** Default denomination for the chain. */
const DEFAULT_DENOM = "uclaw";

type AgentClient = {
  getBalance: (address: string, denom?: string) => Promise<{ amount: string; denom: string }>;
  getLatestBlockHeight: () => Promise<number>;
  transfer: (opts: {
    recipient: string;
    amount: string;
    denom: string;
    memo?: string;
  }) => Promise<{ transactionHash: string; height: number; code: number }>;
  lcdEndpoint?: string;
};

function getClient(): AgentClient | null {
  const agent = getBlockchainAgent();
  if (!agent) {return null;}
  return (agent as unknown as { client: AgentClient }).client ?? null;
}

function getLcdEndpoint(): string {
  const client = getClient();
  return client?.lcdEndpoint ?? DEFAULT_LCD;
}

async function fetchLcd<T>(path: string): Promise<T> {
  const url = `${getLcdEndpoint()}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`LCD request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const chainWalletHandlers: GatewayRequestHandlers = {
  /**
   * chain.wallet.balance — Query balance for an address.
   * Defaults to the agent's own address if none is provided.
   */
  "chain.wallet.balance": async ({ params, respond }) => {
    try {
      const client = getClient();
      const agentAddress = getBlockchainAddress();
      const address = (params.address as string | undefined) ?? agentAddress;
      const denom = (params.denom as string | undefined) ?? DEFAULT_DENOM;

      if (!address) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "No address available — agent not initialized"),
        );
        return;
      }

      // Attempt via agent client first; fall back to LCD REST query.
      let balances: Array<{ denom: string; amount: string }> = [];
      let blockHeight: number | null = null;

      if (client) {
        try {
          const result = await client.getBalance(address, denom);
          balances = [{ denom: result.denom ?? denom, amount: result.amount ?? "0" }];
        } catch {
          // Fall through to LCD
        }
        try {
          blockHeight = await client.getLatestBlockHeight();
        } catch {
          // Non-fatal
        }
      }

      // LCD fallback for balances if the client didn't return them.
      if (balances.length === 0) {
        try {
          const lcdResult = await fetchLcd<{
            balances: Array<{ denom: string; amount: string }>;
          }>(`/cosmos/bank/v1beta1/balances/${address}`);
          balances = lcdResult.balances ?? [];
          if (denom) {
            const match = balances.filter((b) => b.denom === denom);
            if (match.length > 0) {balances = match;}
          }
        } catch {
          // Return empty if nothing available
        }
      }

      // LCD fallback for block height.
      if (blockHeight === null) {
        try {
          const block = await fetchLcd<{
            block: { header: { height: string } };
          }>("/cosmos/base/tendermint/v1beta1/blocks/latest");
          blockHeight = Number(block.block.header.height);
        } catch {
          // Non-fatal
        }
      }

      respond(true, { address, balances, blockHeight });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  /**
   * chain.wallet.transfer — Send tokens to a recipient.
   * Requires the agent to be initialized.
   */
  "chain.wallet.transfer": async ({ params, respond }) => {
    try {
      const agent = getBlockchainAgent();
      const client = getClient();
      const agentAddress = getBlockchainAddress();

      if (!agent || !client || !agentAddress) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "Agent not initialized — cannot send transfer"),
        );
        return;
      }

      const recipient = params.recipient as string | undefined;
      const amount = params.amount as string | undefined;
      const denom = (params.denom as string | undefined) ?? DEFAULT_DENOM;
      const memo = (params.memo as string | undefined) ?? "";

      if (!recipient || !amount) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "recipient and amount are required"),
        );
        return;
      }

      const result = await client.transfer({ recipient, amount, denom, memo });

      respond(true, {
        transactionHash: result.transactionHash,
        height: result.height,
        code: result.code,
        success: result.code === 0,
        recipient,
        amount,
        denom,
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  /**
   * chain.wallet.staking.delegations — Query staking delegations for an address.
   */
  "chain.wallet.staking.delegations": async ({ params, respond }) => {
    try {
      const agentAddress = getBlockchainAddress();
      const address = (params.address as string | undefined) ?? agentAddress;

      if (!address) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "No address available — agent not initialized"),
        );
        return;
      }

      let delegations: Array<{
        validatorAddress: string;
        shares: string;
        balance: { denom: string; amount: string };
      }> = [];

      try {
        const lcdResult = await fetchLcd<{
          delegation_responses: Array<{
            delegation: { validator_address: string; shares: string };
            balance: { denom: string; amount: string };
          }>;
        }>(`/cosmos/staking/v1beta1/delegations/${address}`);

        delegations = (lcdResult.delegation_responses ?? []).map((entry) => ({
          validatorAddress: entry.delegation.validator_address,
          shares: entry.delegation.shares,
          balance: entry.balance,
        }));
      } catch {
        // Return empty on failure
      }

      respond(true, { address, delegations });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  /**
   * chain.wallet.staking.rewards — Query pending staking rewards.
   */
  "chain.wallet.staking.rewards": async ({ params, respond }) => {
    try {
      const agentAddress = getBlockchainAddress();
      const address = (params.address as string | undefined) ?? agentAddress;

      if (!address) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "No address available — agent not initialized"),
        );
        return;
      }

      let rewards: Array<{
        validatorAddress: string;
        rewards: Array<{ denom: string; amount: string }>;
      }> = [];
      let total: Array<{ denom: string; amount: string }> = [];

      try {
        const lcdResult = await fetchLcd<{
          rewards: Array<{
            validator_address: string;
            reward: Array<{ denom: string; amount: string }>;
          }>;
          total: Array<{ denom: string; amount: string }>;
        }>(`/cosmos/distribution/v1beta1/delegators/${address}/rewards`);

        rewards = (lcdResult.rewards ?? []).map((entry) => ({
          validatorAddress: entry.validator_address,
          rewards: entry.reward ?? [],
        }));
        total = lcdResult.total ?? [];
      } catch {
        // Return empty on failure
      }

      respond(true, { address, rewards, total });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  /**
   * chain.wallet.history — Query recent transactions for an address.
   */
  "chain.wallet.history": async ({ params, respond }) => {
    try {
      const agentAddress = getBlockchainAddress();
      const address = (params.address as string | undefined) ?? agentAddress;
      const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);

      if (!address) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "No address available — agent not initialized"),
        );
        return;
      }

      let transactions: Array<{
        hash: string;
        height: string;
        type: string;
        timestamp: string;
        success: boolean;
      }> = [];

      try {
        // Query sent transactions (message.sender)
        const query = encodeURIComponent(`message.sender='${address}'`);
        const lcdResult = await fetchLcd<{
          tx_responses: Array<{
            txhash: string;
            height: string;
            timestamp: string;
            code: number;
            tx: {
              body?: {
                messages?: Array<{ "@type"?: string }>;
              };
            };
          }>;
        }>(
          `/cosmos/tx/v1beta1/txs?events=${query}&order_by=ORDER_BY_DESC&pagination.limit=${limit}`,
        );

        transactions = (lcdResult.tx_responses ?? []).map((tx) => {
          const firstMsg = tx.tx?.body?.messages?.[0];
          const msgType = firstMsg?.["@type"] ?? "unknown";
          return {
            hash: tx.txhash,
            height: tx.height,
            type: msgType,
            timestamp: tx.timestamp,
            success: tx.code === 0,
          };
        });
      } catch {
        // Return empty on failure
      }

      respond(true, {
        address,
        transactions: transactions.slice(0, limit),
        count: transactions.length,
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
