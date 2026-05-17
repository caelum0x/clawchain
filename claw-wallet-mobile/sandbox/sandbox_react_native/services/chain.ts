import { CHAIN_CONFIG, TESTNET_CONFIG, LOCAL_CONFIG, type ChainConfig } from "@/constants/chain";

export interface Balance {
  denom: string;
  amount: string;
}

export interface Transaction {
  hash: string;
  height: string;
  timestamp: string;
  type: "send" | "receive" | "shield" | "unshield" | "delegate" | "unknown";
  amount: string;
  denom: string;
  from: string;
  to: string;
  memo: string;
  status: "success" | "failed";
}

class ChainApiClient {
  private config: ChainConfig = CHAIN_CONFIG;

  setNetwork(network: "mainnet" | "testnet" | "local"): void {
    if (network === "mainnet") this.config = CHAIN_CONFIG;
    else if (network === "local") this.config = LOCAL_CONFIG;
    else this.config = TESTNET_CONFIG;
  }

  async getBalance(address: string): Promise<Balance[]> {
    try {
      const res = await fetch(
        `${this.config.rest}/cosmos/bank/v1beta1/balances/${address}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.balances ?? [];
    } catch {
      return [];
    }
  }

  async getShieldedBalance(address: string): Promise<string> {
    try {
      const res = await fetch(
        `${this.config.rest}/clawchain/privacy/v1/shielded_balance/${address}`
      );
      if (!res.ok) return "0";
      const data = await res.json();
      return data.balance ?? "0";
    } catch {
      return "0";
    }
  }

  async getTransactions(address: string, limit = 20): Promise<Transaction[]> {
    try {
      // Query sent transactions
      const sentRes = await fetch(
        `${this.config.rest}/cosmos/tx/v1beta1/txs?events=message.sender='${address}'&pagination.limit=${limit}&order_by=ORDER_BY_DESC`
      );
      // Query received transactions
      const recvRes = await fetch(
        `${this.config.rest}/cosmos/tx/v1beta1/txs?events=transfer.recipient='${address}'&pagination.limit=${limit}&order_by=ORDER_BY_DESC`
      );

      if (!sentRes.ok && !recvRes.ok) throw new Error("Failed to fetch");

      const sentData = sentRes.ok ? await sentRes.json() : { tx_responses: [] };
      const recvData = recvRes.ok ? await recvRes.json() : { tx_responses: [] };

      const txs = [
        ...parseTxResponses(sentData.tx_responses ?? [], address, "send"),
        ...parseTxResponses(recvData.tx_responses ?? [], address, "receive"),
      ];

      // Deduplicate and sort by height descending
      const seen = new Set<string>();
      return txs
        .filter((tx) => {
          if (seen.has(tx.hash)) return false;
          seen.add(tx.hash);
          return true;
        })
        .sort((a, b) => parseInt(b.height) - parseInt(a.height))
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  async sendTokens(
    from: string,
    to: string,
    amount: string,
    denom: string,
    memo: string
  ): Promise<{ txHash: string; simulated: boolean }> {
    // Sandbox mode: no private keys are available in the demo wallet.
    // Real transaction signing requires MPC/TSS backend integration via
    // oko_sdk_cosmos. See AGENTS.md for the full key management architecture.
    return { txHash: "SIMULATED-sandbox-mode", simulated: true };
  }

  async shield(
    address: string,
    amount: string
  ): Promise<{ txHash: string; simulated: boolean }> {
    // Sandbox mode: no private keys are available in the demo wallet.
    // Real MsgShield signing requires MPC/TSS backend integration via
    // oko_sdk_cosmos. See AGENTS.md for the full key management architecture.
    return { txHash: "SIMULATED-sandbox-mode", simulated: true };
  }

  async unshield(
    address: string,
    amount: string
  ): Promise<{ txHash: string; simulated: boolean }> {
    // Sandbox mode: no private keys are available in the demo wallet.
    // Real MsgUnshield requires a ZK proof + MPC/TSS signing via
    // oko_sdk_cosmos. See AGENTS.md for the full key management architecture.
    return { txHash: "SIMULATED-sandbox-mode", simulated: true };
  }
}

function parseTxResponses(
  responses: any[],
  address: string,
  defaultType: "send" | "receive"
): Transaction[] {
  return responses.map((resp) => {
    const msgs = resp.tx?.body?.messages ?? [];
    const msg = msgs[0] ?? {};
    const msgType = msg["@type"] ?? "";

    let type: Transaction["type"] = defaultType;
    if (msgType.includes("MsgShield")) type = "shield";
    else if (msgType.includes("MsgUnshield")) type = "unshield";

    return {
      hash: resp.txhash ?? "",
      height: resp.height ?? "0",
      timestamp: resp.timestamp ?? new Date().toISOString(),
      type,
      amount: msg.amount?.[0]?.amount ?? msg.amount ?? "0",
      denom: msg.amount?.[0]?.denom ?? CHAIN_CONFIG.denom,
      from: msg.from_address ?? msg.sender ?? address,
      to: msg.to_address ?? msg.recipient ?? "",
      memo: resp.tx?.body?.memo ?? "",
      status: resp.code === 0 || !resp.code ? "success" : "failed",
    };
  });
}

export const chainApi = new ChainApiClient();
