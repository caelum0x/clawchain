/**
 * `clawd faucet` — request tokens from a faucet or serve a faucet endpoint.
 */

import { loadClawdConfig } from "../lib/config.js";
import { FaucetServer } from "../lib/faucet-server.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";

const DEFAULT_FAUCET_URL = "http://localhost:8888";

/**
 * Request tokens from a faucet endpoint.
 */
export async function runFaucetRequest(options: { from?: string }): Promise<void> {
  const config = loadClawdConfig();
  const faucetUrl = options.from ?? config.faucetUrl ?? DEFAULT_FAUCET_URL;
  const address = config.agentAddress;

  if (!address) {
    console.error('No agent address found. Run "clawd init" first.');
    process.exit(1);
  }

  console.log(`Requesting tokens from faucet at ${faucetUrl}...`);
  console.log(`  Address: ${address}`);

  try {
    const data = await requestFaucetWithFallback(faucetUrl, address);

    console.log(`\nTokens received!`);
    console.log(`  Amount: ${data.amount} ${data.denom}`);
    console.log(`  Tx:     ${data.txHash}`);
  } catch (err) {
    console.error(`Faucet request failed: ${String(err)}`);
    process.exit(1);
  }
}

/**
 * Start a faucet HTTP server that drips tokens to requesting addresses.
 */
export async function runFaucetServe(options: {
  port?: number;
  dripAmount?: string;
}): Promise<void> {
  if (!mnemonicFileExists()) {
    console.error('No mnemonic found. Run "clawd init" first.');
    process.exit(1);
  }

  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    console.error("Failed to load mnemonic.");
    process.exit(1);
  }

  const config = loadClawdConfig();
  const rpcUrl = config.rpcUrl ?? "http://localhost:26657";

  // Lazy-import cosmjs to avoid top-level dependency issues
  const { DirectSecp256k1HdWallet } = await import("@cosmjs/proto-signing");
  const { SigningStargateClient, GasPrice } = await import("@cosmjs/stargate");

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: config.chainId?.startsWith("clawchain") ? "cosmos" : "cosmos",
  });
  const [account] = await wallet.getAccounts();
  if (!account) {
    console.error("Failed to derive account from mnemonic.");
    process.exit(1);
  }

  const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString("0.025uclaw"),
  });

  const faucet = new FaucetServer({
    port: options.port,
    dripAmount: options.dripAmount,
    faucetAddress: account.address,
    async sendTokens(recipient: string, amount: string, denom: string): Promise<string> {
      const res = await signingClient.sendTokens(
        account.address,
        recipient,
        [{ denom, amount }],
        "auto",
      );
      if (res.code !== 0) {
        throw new Error(`Tx failed with code ${res.code}: ${res.rawLog}`);
      }
      return res.transactionHash;
    },
    async getBalance(): Promise<string> {
      const coin = await signingClient.getBalance(account.address, "uclaw");
      return coin.amount;
    },
  });

  await faucet.start();

  // Keep alive until signal
  const shutdown = async () => {
    console.log("\nShutting down faucet...");
    await faucet.stop();
    signingClient.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

async function requestFaucetWithFallback(
  faucetUrl: string,
  address: string,
): Promise<Record<string, unknown>> {
  const base = faucetUrl.replace(/\/?$/, "");
  const endpoints = ["/faucet/request", "/send"];
  let lastError = "Unknown faucet error";

  for (const path of endpoints) {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (res.ok) return data;

    lastError = String(data.error ?? `HTTP ${res.status}`);
    if (res.status !== 404) {
      break;
    }
  }

  throw new Error(lastError);
}
