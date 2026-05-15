/**
 * `clawd init` — generate mnemonic, init chain, configure peers, set up
 * genesis accounts/validator, run trusted setup, write config.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { generateMnemonic, saveMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { writeClawdConfig, type ClawdConfig } from "../lib/config.js";
import { CLAWD_HOME, CLAWCHAIN_HOME, CLAWD_CONFIG_PATH, CLAWD_MNEMONIC_PATH } from "../lib/paths.js";
import { configurePeers, getNodeId } from "../lib/peers.js";
import { addGenesisAccount, createGenesisTx, collectGenesisTxs } from "../lib/genesis.js";
import { runJoin } from "./join.js";

export type InitOptions = {
  /** Node moniker. */
  moniker?: string;
  /** Chain ID. */
  chainId?: string;
  /** Path to clawchaind binary. */
  nodeBinary?: string;
  /** Path to clawproof binary. */
  proofBinary?: string;
  /** Skip ZK trusted setup. */
  skipSetup?: boolean;
  /** Force re-initialization even if files exist. */
  force?: boolean;
  /** Comma-separated seed node addresses. */
  seeds?: string;
  /** Comma-separated persistent peer addresses. */
  persistentPeers?: string;
  /** Initial token allocation (default: "100000000uclaw"). */
  initialTokens?: string;
  /** Validator stake amount (default: "70000000uclaw"). */
  validatorStake?: string;
  /** Optional manifest source for network bootstrap. */
  fromManifest?: string;
  /** Optional nodecard source for network bootstrap. */
  fromNodecard?: string;
  /** Optional RPC URL for network bootstrap. */
  rpcUrl?: string;
  /** Optional REST URL for network bootstrap. */
  restUrl?: string;
  /** Optional faucet URL for network bootstrap. */
  faucetUrl?: string;
  /** Optional messaging endpoint for network bootstrap. */
  messagingEndpoint?: string;
  /** Public host for peer/messaging derivation. */
  host?: string;
  /** Skip genesis sync while bootstrapping from manifest. */
  noSyncGenesis?: boolean;
  /** Request faucet tokens during bootstrap. */
  requestFaucet?: boolean;
};

export async function runInit(options: InitOptions): Promise<void> {
  const moniker = options.moniker ?? "clawd-node";
  const hintedChainId = await resolveChainIdHint(options.fromManifest, options.fromNodecard);
  const chainId = options.chainId ?? hintedChainId ?? "clawchain-1";
  const nodeBin = options.nodeBinary ?? process.env.CLAWCHAIND_PATH ?? "clawchaind";
  const proofBin = options.proofBinary ?? process.env.CLAWPROOF_PATH ?? "clawproof";
  const initialTokens = options.initialTokens ?? "100000000uclaw";
  const validatorStake = options.validatorStake ?? "70000000uclaw";

  // Check for existing initialization
  if (!options.force && mnemonicFileExists()) {
    console.error(
      `Mnemonic already exists at ${CLAWD_MNEMONIC_PATH}.\n` +
        "Use --force to re-initialize (this will overwrite existing keys).",
    );
    process.exit(1);
  }

  console.log("=== ClawChain Initialization ===\n");

  // Step 1: Generate mnemonic
  console.log("Step 1/6: Generating 24-word BIP-39 mnemonic...\n");
  const mnemonic = await generateMnemonic();

  console.log("  ┌──────────────────────────────────────────────┐");
  console.log("  │  IMPORTANT: Back up this mnemonic securely!  │");
  console.log("  │  It cannot be recovered if lost.             │");
  console.log("  └──────────────────────────────────────────────┘\n");
  console.log(`  ${mnemonic}\n`);

  // Step 2: Encrypt and save mnemonic
  console.log("Step 2/6: Saving encrypted mnemonic...");
  saveMnemonic(mnemonic);
  console.log(`  Saved to: ${CLAWD_MNEMONIC_PATH}\n`);

  // Step 3 & 4: Initialize chain node and configure peers.
  // If clawchaind is not available (Docker agent-only container), skip gracefully.
  let agentAddress = "";
  try {
    console.log("Step 3/6: Initializing chain node...");
    // Initialize the chain home directory
    if (!existsSync(CLAWCHAIN_HOME) || options.force) {
      execFileSync(nodeBin, ["init", moniker, "--chain-id", chainId, "--home", CLAWCHAIN_HOME], {
        stdio: "pipe",
      });
      console.log(`  Chain initialized at: ${CLAWCHAIN_HOME}`);
    } else {
      console.log(`  Chain home already exists at: ${CLAWCHAIN_HOME} (skipping init)`);
    }

    // Import the mnemonic as the "agent" key
    execFileSync(
      nodeBin,
      ["keys", "add", "agent", "--recover", "--home", CLAWCHAIN_HOME, "--keyring-backend", "test"],
      {
        input: mnemonic + "\n",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    // Get the address
    try {
      const addrOutput = execFileSync(
        nodeBin,
        ["keys", "show", "agent", "-a", "--home", CLAWCHAIN_HOME, "--keyring-backend", "test"],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      agentAddress = addrOutput.toString().trim();
      console.log(`  Agent key imported: ${agentAddress}`);
    } catch {
      console.log("  Agent key imported (could not read address).");
    }

    // Step 4: Configure peers
    console.log("\nStep 4/6: Configuring peers...");
    if (options.seeds || options.persistentPeers) {
      configurePeers({
        seeds: options.seeds,
        persistentPeers: options.persistentPeers,
        nodeHome: CLAWCHAIN_HOME,
      });
      if (options.seeds) console.log(`  Seeds: ${options.seeds}`);
      if (options.persistentPeers) console.log(`  Persistent peers: ${options.persistentPeers}`);
    } else {
      // Still set addr_book_strict = false for testnet
      configurePeers({ nodeHome: CLAWCHAIN_HOME });
      console.log("  No seeds or persistent peers configured (standalone mode).");
    }

    // Print node ID for sharing
    try {
      const nodeId = getNodeId(nodeBin, CLAWCHAIN_HOME);
      console.log(`  Node ID: ${nodeId}`);
    } catch {
      // Non-fatal: node ID can be retrieved later
    }
  } catch (chainErr: unknown) {
    // If clawchaind is not available (e.g. Docker agent-only container),
    // skip local chain setup and continue with mnemonic-only init.
    const isEnoent =
      chainErr instanceof Error &&
      ((chainErr as NodeJS.ErrnoException).code === "ENOENT" ||
        chainErr.message.includes("ENOENT"));
    if (isEnoent) {
      console.warn(
        `  Warning: ${nodeBin} not found — skipping local chain node setup.\n` +
          `  Mnemonic saved. Connect to a remote node via BLOCKCHAIN_RPC_URL.\n`,
      );
    } else {
      throw chainErr;
    }
  }

  try {
    // Step 5: Genesis setup (fund agent + create validator)
    console.log("\nStep 5/6: Setting up genesis...");
    if (agentAddress) {
      addGenesisAccount({
        nodeBin,
        nodeHome: CLAWCHAIN_HOME,
        address: agentAddress,
        coins: initialTokens,
      });
      console.log(`  Genesis account: ${agentAddress} with ${initialTokens}`);

      createGenesisTx({
        nodeBin,
        nodeHome: CLAWCHAIN_HOME,
        keyName: "agent",
        stakeAmount: validatorStake,
        chainId,
      });
      console.log(`  Validator gentx created with stake: ${validatorStake}`);

      collectGenesisTxs({
        nodeBin,
        nodeHome: CLAWCHAIN_HOME,
      });
      console.log("  Genesis transactions collected.");
    } else {
      console.log("  Skipping genesis setup (no agent address available).");
    }

    // Step 6: ZK trusted setup
    if (!options.skipSetup) {
      console.log("\nStep 6/6: Running ZK trusted setup...");
      try {
        execFileSync(proofBin, ["setup"], { stdio: "pipe" });
        console.log("  Proving and verifying keys generated.");
      } catch (err) {
        console.warn(`  Warning: ZK setup failed (${String(err)}). You can run 'clawproof setup' manually.`);
      }
    } else {
      console.log("\nStep 6/6: Skipping ZK trusted setup (--skip-setup).");
    }

    // Write config
    const config: ClawdConfig = {
      moniker,
      chainId,
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      nodeAutoStart: true,
      nodeHome: CLAWCHAIN_HOME,
      agentAddress: agentAddress || undefined,
      seeds: options.seeds,
      persistentPeers: options.persistentPeers,
      denom: "uclaw",
      prefix: "claw",
      gasPrice: "0.025uclaw",
    };
    writeClawdConfig(config);

    const shouldBootstrapJoin = Boolean(
      options.fromManifest ||
        options.fromNodecard ||
        options.rpcUrl ||
        options.restUrl ||
        options.faucetUrl ||
        options.messagingEndpoint ||
        options.host,
    );
    if (shouldBootstrapJoin) {
      console.log("\nStep 7/7: Applying network bootstrap configuration...");
      await runJoin({
        fromManifest: options.fromManifest,
        fromNodecard: options.fromNodecard,
        chainId: options.chainId,
        rpcUrl: options.rpcUrl,
        restUrl: options.restUrl,
        seeds: options.seeds,
        persistentPeers: options.persistentPeers,
        faucetUrl: options.faucetUrl,
        messagingEndpoint: options.messagingEndpoint,
        host: options.host,
        syncGenesis: options.noSyncGenesis ? false : true,
        requestFaucet: options.requestFaucet,
      });
    }

    // Summary
    console.log("\n=== Initialization Complete ===\n");
    console.log(`  Config:     ${CLAWD_CONFIG_PATH}`);
    console.log(`  Mnemonic:   ${CLAWD_MNEMONIC_PATH}`);
    console.log(`  Chain home: ${CLAWCHAIN_HOME}`);
    if (agentAddress) {
      console.log(`  Address:    ${agentAddress}`);
      console.log(`  Tokens:     ${initialTokens}`);
      console.log(`  Validator:  ${validatorStake} staked`);
    }
    console.log('\n  Next step: run "clawd start" to launch the unified runtime.\n');
  } catch (err) {
    console.error(`\nInitialization failed: ${String(err)}`);
    process.exit(1);
  }
}

async function resolveChainIdHint(
  fromManifest?: string,
  fromNodecard?: string,
): Promise<string | undefined> {
  const fromManifestChainId = await loadChainIdFromSource(fromManifest, "manifest");
  if (fromManifestChainId) return fromManifestChainId;
  const fromNodecardChainId = await loadChainIdFromSource(fromNodecard, "nodecard");
  if (fromNodecardChainId) return fromNodecardChainId;
  return undefined;
}

async function loadChainIdFromSource(
  source: string | undefined,
  kind: "manifest" | "nodecard",
): Promise<string | undefined> {
  if (!source) return undefined;
  try {
    let raw = "";
    if (/^https?:\/\//i.test(source)) {
      const res = await fetch(source, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return undefined;
      raw = await res.text();
    } else {
      raw = await readFile(source, "utf8");
    }
    const parsed = JSON.parse(raw) as { chainId?: unknown };
    const chainId = typeof parsed.chainId === "string" ? parsed.chainId.trim() : "";
    if (chainId) return chainId;
  } catch {
    // Non-fatal hint lookup.
  }
  if (kind === "manifest") {
    console.warn(`Warning: unable to resolve chainId hint from manifest ${source}; using defaults.`);
  }
  return undefined;
}
