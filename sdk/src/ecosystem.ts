/**
 * @clawchain/sdk/ecosystem — Re-exports for the ClawChain ecosystem packages.
 *
 * This module provides a single import point for companion packages:
 *   - @clawchain/claw-viem  — Low-level primitives (address, encoding, hashing, transport, tx)
 *   - @clawchain/claw-wagmi — React hooks (balance, account, staking, agents, contracts)
 *
 * Usage:
 *   import { ECOSYSTEM_PACKAGES, getPackageInfo } from "@clawchain/sdk/ecosystem";
 */

// ---------------------------------------------------------------------------
// Package registry
// ---------------------------------------------------------------------------

export type EcosystemPackage = {
  name: string;
  npmName: string;
  description: string;
  category: "primitives" | "react" | "cli-tool" | "contract";
  exports: string[];
};

export const ECOSYSTEM_PACKAGES: EcosystemPackage[] = [
  {
    name: "claw-viem",
    npmName: "@clawchain/claw-viem",
    description:
      "Low-level TypeScript primitives for ClawChain — address utils, encoding, hashing, CometBFT/REST transports, tx builders. Zero runtime dependencies.",
    category: "primitives",
    exports: [
      "isValidAddress",
      "shortenAddress",
      "addressToHex",
      "hexToAddress",
      "areAddressesEqual",
      "deriveAddress",
      "toBase64",
      "fromBase64",
      "toHex",
      "fromHex",
      "toUtf8",
      "fromUtf8",
      "encodeCosmWasmQuery",
      "decodeCosmWasmResponse",
      "encodeCoin",
      "decodeCoin",
      "formatClaw",
      "parseClaw",
      "sha256",
      "sha256Hex",
      "ripemd160",
      "ripemd160Hex",
      "txHash",
      "addressHash",
      "createRpcTransport",
      "createRestTransport",
      "getLatestBlock",
      "getBlockByHeight",
      "getStatus",
      "broadcastTxSync",
      "abciQuery",
      "buildSendMsg",
      "buildExecuteMsg",
      "buildDelegateMsg",
      "estimateGas",
      "buildFee",
    ],
  },
  {
    name: "claw-wagmi",
    npmName: "@clawchain/claw-wagmi",
    description:
      "React hooks for ClawChain — Provider, useBalance, useAccount, useSendTokens, useStaking, useAgents, useContract, useBlockHeight. Requires React 18+.",
    category: "react",
    exports: [
      "ClawChainProvider",
      "useClawChain",
      "useBalance",
      "useAccount",
      "useSendTokens",
      "useStaking",
      "useAgents",
      "useAgent",
      "useContractQuery",
      "useContractExecute",
      "useBlockHeight",
    ],
  },
  {
    name: "claw-artemis",
    npmName: "clawd",
    description:
      "DEX arbitrage bot — scans ClawDEX pools for cross-pool price discrepancies and executes swaps. Access via `clawd artemis`.",
    category: "cli-tool",
    exports: ["runArtemisRun", "runArtemisScan", "runArtemisPools"],
  },
  {
    name: "claw-cryo",
    npmName: "clawd",
    description:
      "Blockchain data extractor — exports blocks, txs, events to CSV/JSON. Access via `clawd cryo`.",
    category: "cli-tool",
    exports: ["runCryoExtract", "runCryoDatasets", "runCryoStats"],
  },
  {
    name: "claw-flood",
    npmName: "clawd",
    description:
      "RPC load tester — benchmarks CometBFT RPC, REST API with concurrent workers. Access via `clawd flood`.",
    category: "cli-tool",
    exports: ["runFloodRun", "runFloodScenarios", "runFloodCheck"],
  },
  {
    name: "claw-flux",
    npmName: "clawd",
    description:
      "Parallel LLM explorer — N parallel completions, scoring, tree exploration. Access via `clawd flux`.",
    category: "cli-tool",
    exports: ["runFluxExplore", "runFluxCompare", "runFluxScorers"],
  },
  {
    name: "claw-data-portal",
    npmName: "clawd",
    description:
      "Dataset catalog and downloader — 12 datasets, sample generation, live chain fetching. Access via `clawd data-portal`.",
    category: "cli-tool",
    exports: [
      "runDataPortalList",
      "runDataPortalCategories",
      "runDataPortalInfo",
      "runDataPortalDownload",
    ],
  },
  {
    name: "claw-rivet",
    npmName: "clawd",
    description:
      "Chain inspector — inspect blocks/txs, live watch, decode messages, query modules, simulate txs. Access via `clawd rivet`.",
    category: "cli-tool",
    exports: [
      "runRivetInspect",
      "runRivetWatch",
      "runRivetDecode",
      "runRivetQuery",
      "runRivetSimulate",
    ],
  },
];

export function getPackageInfo(name: string): EcosystemPackage | undefined {
  return ECOSYSTEM_PACKAGES.find((p) => p.name === name || p.npmName === name);
}

export function listByCategory(
  category: EcosystemPackage["category"],
): EcosystemPackage[] {
  return ECOSYSTEM_PACKAGES.filter((p) => p.category === category);
}
