import {
  getBlockchainAgent,
  getBlockchainAddress,
  getBlockchainContracts,
  getBlockchainRuntimeStatus,
  getBlockchainShieldedBalance,
} from "../../../extensions/clawchain/index.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestHandlers } from "./types.js";

export const chainStatusHandlers: GatewayRequestHandlers = {
  "chain.status": async ({ respond }) => {
    try {
      const agent = getBlockchainAgent();
      const address = getBlockchainAddress();
      const shieldedBalance = getBlockchainShieldedBalance();
      const contracts = getBlockchainContracts();

      if (!agent) {
        respond(true, {
          connected: false,
          address: null,
          balance: null,
          shieldedBalance: null,
          blockHeight: null,
          contracts,
        });
        return;
      }

      // Query transparent balance via the agent's client
      let balance: string | null = null;
      let blockHeight: number | null = null;

      try {
        const client = (agent as unknown as { client: { getBalance: (addr: string) => Promise<{ amount: string }>, getLatestBlockHeight: () => Promise<number> } }).client;
        if (client && address) {
          const balResult = await client.getBalance(address);
          balance = balResult?.amount ?? null;
        }
        if (client) {
          blockHeight = await client.getLatestBlockHeight();
        }
      } catch {
        // Non-fatal: return partial data
      }

      respond(true, {
        connected: true,
        address,
        balance,
        shieldedBalance,
        blockHeight,
        contracts,
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
  "runtime.status": async ({ respond }) => {
    try {
      const runtime = await getBlockchainRuntimeStatus();
      respond(true, runtime);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
