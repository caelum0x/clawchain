/**
 * clawd — unified CLI for ClawChain.
 *
 * Subcommands:
 *   up      — init if needed, optional join, then start unified runtime
 *   start   — launch chain node + OpenClaw gateway + messaging server
 *   init    — generate mnemonic, init chain, configure genesis + peers
 *   status  — check chain and gateway health
 *   readiness — strict integrated runtime+chain readiness gates
 *   release-summary — summarize release gate states from evidence artifact
 *   keys    — manage chain keys (forwards to clawchaind)
 *   wallet  — simple balance/send/history wallet UX
 *   peers   — show/set peer discovery settings
 *   faucet  — request tokens or serve a faucet endpoint
 *   send    — send an encrypted message to another agent
 */

import { Command } from "commander";
import { dirname } from "node:path";
import { runStart } from "./commands/start.js";
import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import { runDashboard } from "./commands/dashboard.js";
import { runKeys } from "./commands/keys.js";
import {
  runPeersShow,
  runPeersSet,
  runPeersImportNodecards,
  runPeersSyncManifest,
  runPeersVerify,
  runPeersPruneUnreachable,
  runPeersAutoMaintain,
  runPeersSummary,
} from "./commands/peers.js";
import { runFaucetRequest, runFaucetServe } from "./commands/faucet.js";
import { runJoin } from "./commands/join.js";
import { runDoctor } from "./commands/doctor.js";
import { runReadiness } from "./commands/readiness.js";
import { runInstallNode } from "./commands/install-node.js";
import { runBootstrap } from "./commands/bootstrap.js";
import { runNodecard } from "./commands/nodecard.js";
import { runUp } from "./commands/up.js";
import { runIncidentEnter, runIncidentExit, runIncidentStatus } from "./commands/incident.js";
import { runProviderStatus } from "./commands/provider.js";
import { runReleaseSummary } from "./commands/release-summary.js";
import { runAgentFlow } from "./commands/agent-flow.js";
import { runProductFlow } from "./commands/product-flow.js";
import { runAgentRegister, runAgentInfo, runAgentTasks, runAgentRewards, runAgentHeartbeat } from "./commands/agent.js";
import {
  runAgentAdd,
  runAgentList,
  runAgentRemove,
  runAgentStart,
  runAgentStop,
} from "./commands/agent-multi.js";
import { runGpuList, runGpuLease, runGpuSubmitJob, runGpuJobs, runGpuStatus, runGpuLeases, runGpuProviders, runGpuJobStatus } from "./commands/gpu.js";
import { runModelList, runModelQuery, runModelRegister, runModelProviders, runModelInference } from "./commands/model.js";
import {
  runModelTokenCatalog,
  runModelTokenInferenceSetup,
  runModelTokenIssue,
  runModelTokenLaunch,
  runModelTokenCompleteJob,
  runModelTokenRedeem,
  runModelTokenServeLoop,
  runModelTokenServeOnce,
  runModelTokenStartJob,
} from "./commands/model-token.js";
import {
  runModelVaultBuy,
  runModelVaultClaim,
  runModelVaultConfig,
  runModelVaultDistribute,
  runModelVaultFund,
  runModelVaultPool,
  runModelVaultPoolInfo,
  runModelVaultQuote,
  runModelVaultSell,
  runModelVaultStake,
  runModelVaultStakeInfo,
  runModelVaultUnstake,
  runModelVaultWatch,
  runModelVaultHistory,
  runModelVaultAlert,
  runModelVaultArb,
  runModelVaultPortfolio,
  runModelVaultCompare,
  runModelVaultPlan,
  runModelVaultDeploy,
} from "./commands/model-vault.js";
import {
  runModelIndexCompute,
  runModelIndexPublish,
  runModelIndexLeaderboard,
} from "./commands/model-index.js";
import { runReputationQuery, runReputationLeaderboard, runReputationRate, runReputationEndorse } from "./commands/reputation.js";
import {
  runGovernanceProposals,
  runGovernanceProposal,
  runGovernanceSubmitProposal,
  runGovernanceVote,
  runGovernanceParams,
} from "./commands/governance.js";
import {
  runOraclePrice,
  runOraclePrices,
  runOracleActives,
  runOracleVoteTargets,
  runOracleParams,
  runOracleFeeder,
  runOracleMiss,
  runOraclePrevote,
  runOraclePrevotes,
  runOracleVote,
  runOracleVotes,
  runOracleTobinTax,
  runOracleTobinTaxes,
  runOracleSetup,
  runOracleDelegateFeed,
} from "./commands/oracle.js";
import { runSkillList, runSkillCreate, runSkillPurchase } from "./commands/skill.js";
import {
  runClawHubValidate,
  runClawHubSearch,
  runClawHubInstall,
  runClawHubPublish,
  runClawHubList,
} from "./commands/clawhub.js";
import {
  runEscrowList,
  runEscrowCreate,
  runEscrowStatus,
  runEscrowComplete,
  runEscrowDispute,
} from "./commands/escrow.js";
import { runTaskDelegate, runTaskStatus, runTaskAccept, runTaskComplete } from "./commands/task.js";
import {
  runIntentSubmit,
  runIntentRespond,
  runIntentFinalize,
  runIntentList,
  runIntentQuery,
} from "./commands/intent.js";
import {
  runNegotiatePropose,
  runNegotiateCounter,
  runNegotiateAccept,
  runNegotiateList,
  runNegotiateReject,
} from "./commands/negotiate.js";
import {
  runMessagingSend,
  runMessagingInbox,
  runMessagingSent,
  runMessagingRead,
  runMessagingAck,
} from "./commands/messaging.js";
import {
  runPrivacyShield,
  runPrivacyUnshield,
  runPrivacyTreeStats,
  runPrivacyNullifierCheck,
  runPrivacyMerkleRoot,
  runPrivacyRootHistory,
} from "./commands/privacy.js";
import {
  runStakingValidators,
  runStakingDelegations,
  runStakingDelegate,
  runStakingUndelegate,
  runStakingRewards,
  runStakingClaimRewards,
} from "./commands/staking.js";
import {
  runIBCChannels,
  runIBCConnections,
  runIBCClients,
  runIBCRemoteAgents,
  runIBCDenoms,
  runIBCTransfer,
  runIBCDelegateTask,
  runIBCShield,
  runIBCUnshield,
} from "./commands/ibc.js";
import {
  runQueryBlock,
  runQueryTx,
  runQueryAccount,
  runQuerySupply,
  runQueryValidators,
} from "./commands/query.js";
import {
  runWasmListCode,
  runWasmCodeInfo,
  runWasmListContracts,
  runWasmContract,
  runWasmQuery,
  runWasmHistory,
} from "./commands/wasm.js";
import {
  runDexPools,
  runDexPool,
  runDexPrice,
  runDexSwap,
  runDexAddLiquidity,
  runDexRemoveLiquidity,
  runDexSimulate,
  runDexConfig,
} from "./commands/dex.js";
import { runCompletion } from "./commands/completion.js";
import {
  runConfigShow,
  runConfigSet,
  runConfigGet,
  runConfigReset,
  runConfigValidate,
  runConfigExport,
  runConfigPath,
} from "./commands/config.js";
import {
  runNetworkList,
  runNetworkSwitch,
  runNetworkAdd,
  runNetworkRemove,
  runNetworkStatus,
} from "./commands/network.js";
import {
  runWalletBalance,
  runWalletContacts,
  runWalletEarnings,
  runWalletHistory,
  runWalletSend,
} from "./commands/wallet.js";
import {
  runMonitor,
  runMonitorValidators,
  runMonitorBlocks,
  runMonitorAgents,
  runMonitorDex,
} from "./commands/monitor.js";
import {
  runAlertsList,
  runAlertsAdd,
  runAlertsRemove,
  runAlertsHistory,
  runAlertsTest,
} from "./commands/alerts.js";
import {
  runFluxExplore,
  runFluxCompare,
  runFluxScorers,
} from "./commands/flux.js";
import {
  runUpgradeCheck,
  runUpgradeInfo,
  runUpgradePrepare,
} from "./commands/upgrade.js";
import { runDeployProfile } from "./commands/deploy-profile.js";
import { runLaunchGate } from "./commands/launch-gate.js";
import { runProvenance, runGenesisValidate } from "./commands/provenance.js";
import {
  runMigrateExport,
  runMigrateValidate,
  runMigrateDiff,
  runMigrateCheck,
  runMigrateHistory,
} from "./commands/migrate.js";
import {
  runGpuRegister,
  runGpuProviderStatus,
  runGpuEarnings,
  runGpuProviderSetup,
  runDetectHardware,
} from "./commands/gpu-provider.js";
import {
  runSkillsList,
  runSkillsPublish,
  runSkillsPrice,
  runSkillsDelist,
  runSkillsSales,
} from "./commands/skills.js";
import { runInventory } from "./commands/inventory.js";
import { runEarnings } from "./commands/earnings.js";
import {
  runArtemisRun,
  runArtemisScan,
  runArtemisPools,
} from "./commands/artemis.js";
import {
  runCryoExtract,
  runCryoDatasets,
  runCryoStats,
} from "./commands/cryo.js";
import {
  runFloodRun,
  runFloodScenarios,
  runFloodCheck,
} from "./commands/flood.js";
import {
  runBenchmarkRun,
  runBenchmarkCompare,
  runBenchmarkProfiles,
  runBenchmarkHistory,
} from "./commands/benchmark.js";
import {
  runDataPortalList,
  runDataPortalCategories,
  runDataPortalInfo,
  runDataPortalDownload,
} from "./commands/data-portal.js";
import {
  runRivetInspect,
  runRivetWatch,
  runRivetDecode,
  runRivetQuery,
  runRivetSimulate,
} from "./commands/rivet.js";
import {
  runEcosystemList,
  runEcosystemInfo,
  runEcosystemCategories,
} from "./commands/ecosystem.js";
import {
  runTestnetCreate,
  runTestnetStart,
  runTestnetStop,
  runTestnetStatus,
  runTestnetReset,
  runTestnetList,
} from "./commands/testnet.js";
import {
  runGenesisInspect,
  runGenesisAccounts,
  runGenesisValidators,
  runGenesisModuleParams,
  runGenesisHash,
  runGenesisDiff,
} from "./commands/genesis.js";
import {
  runChecksumsGenerate,
  runChecksumsVerify,
  runChecksumsShow,
} from "./commands/checksums.js";
import {
  runLaunchChecklistStatus,
  runLaunchChecklistSign,
  runLaunchChecklistReset,
  runLaunchChecklistExport,
} from "./commands/launch-checklist.js";
import {
  runHealthCheck,
  runHealthWatch,
  runHealthEndpoints,
} from "./commands/health.js";
import {
  runValidateConfig,
  runValidateBinaries,
  runValidateChain,
  runValidateGenesis,
  runValidateAll,
} from "./commands/validate.js";
import {
  runMonitoringStatus,
  runMonitoringCheck,
  runMonitoringMetrics,
  runMonitoringAlerts,
  runMonitoringDashboards,
  runMonitoringExport,
} from "./commands/monitoring.js";
import { loadClawdConfig, writeClawdConfig } from "./lib/config.js";
import { discoverSkillExecutors } from "./lib/skill-discovery.js";
import { explainAutonomousCandidates } from "./lib/autonomous-loop.js";

const program = new Command();

program
  .name("clawd")
  .description("Unified CLI for ClawChain node + OpenClaw gateway")
  .version("0.1.0");

// clawd start
program
  .command("start")
  .description("Start the chain node, OpenClaw gateway, and messaging server")
  .option("--openclaw-bin <path>", "path to the openclaw binary")
  .option("--node-binary <path>", "path to the clawchaind binary")
  .option("--rpc-url <url>", "blockchain RPC URL")
  .option("--rest-url <url>", "blockchain REST/LCD URL")
  .option("--seeds <peers>", "comma-separated seed peers")
  .option("--persistent-peers <peers>", "comma-separated persistent peers")
  .option("--messaging-endpoint <url>", "public agent messaging endpoint")
  .option("--no-auto-start", "do not auto-start the chain node")
  .option("--messaging-port <port>", "port for the agent messaging server", parseInt)
  .action(async (opts) => {
    await runStart({
      openclawBin: opts.openclawBin,
      nodeBinary: opts.nodeBinary,
      rpcUrl: opts.rpcUrl,
      restUrl: opts.restUrl,
      seeds: opts.seeds,
      persistentPeers: opts.persistentPeers,
      messagingEndpoint: opts.messagingEndpoint,
      noAutoStart: opts.noAutoStart,
      messagingPort: opts.messagingPort,
    });
  });

// clawd up
program
  .command("up")
  .description("Initialize (if needed), optionally join a network, then start bot + node runtime")
  .option("--openclaw-bin <path>", "path to the openclaw binary")
  .option("--node-binary <path>", "path to the clawchaind binary")
  .option("--messaging-port <port>", "port for the agent messaging server", parseInt)
  .option("--no-auto-start", "do not auto-start the chain node")
  .option("--skip-init", "do not run init if mnemonic is missing")
  .option("--skip-join", "do not apply join/network configuration")
  .option("--init-moniker <name>", "moniker to use when auto-running init", "clawd-node")
  .option("--chain-id <id>", "chain ID")
  .option("--skip-setup", "skip ZK trusted setup when auto-running init")
  .option("--from-manifest <urlOrPath>", "load chain endpoints/seeds from manifest.json")
  .option("--from-nodecard <urlOrPath>", "load peer/endpoints from a nodecard JSON")
  .option("--rpc-url <url>", "blockchain RPC URL")
  .option("--rest-url <url>", "blockchain REST/LCD URL")
  .option("--seeds <peers>", "comma-separated seed peers")
  .option("--persistent-peers <peers>", "comma-separated persistent peers")
  .option("--faucet-url <url>", "faucet URL")
  .option("--messaging-endpoint <url>", "public messaging endpoint URL")
  .option("--host <host>", "public host/DNS (also used to derive messaging endpoint when omitted)")
  .option("--no-sync-genesis", "do not download/verify/write genesis from manifest")
  .option("--require-signed-manifest", "require a trusted signature on manifest.json")
  .option("--manifest-trusted-pubkeys <csv>", "comma-separated trusted secp256k1 pubkeys (hex, 33-byte compressed)")
  .option("--request-faucet", "request starter tokens after join configuration")
  .option("--require-ready", "fail startup unless integrated runtime+chain readiness passes")
  .option("--skip-ready-gate", "disable default readiness gating (for local dev/debug)")
  .option("--ready-timeout-seconds <seconds>", "readiness wait timeout in seconds (default: 120)", parseInt)
  .option("--json", "output machine-readable startup report")
  .action(async (opts) => {
    const report = await runUp({
      openclawBin: opts.openclawBin,
      nodeBinary: opts.nodeBinary,
      messagingPort: opts.messagingPort,
      noAutoStart: opts.noAutoStart,
      skipInit: opts.skipInit,
      skipJoin: opts.skipJoin,
      initMoniker: opts.initMoniker,
      chainId: opts.chainId,
      skipSetup: opts.skipSetup,
      fromManifest: opts.fromManifest,
      fromNodecard: opts.fromNodecard,
      rpcUrl: opts.rpcUrl,
      restUrl: opts.restUrl,
      seeds: opts.seeds,
      persistentPeers: opts.persistentPeers,
      faucetUrl: opts.faucetUrl,
      messagingEndpoint: opts.messagingEndpoint,
      host: opts.host,
      noSyncGenesis: opts.syncGenesis === false,
      requireSignedManifest: opts.requireSignedManifest,
      manifestTrustedPubkeys: opts.manifestTrustedPubkeys,
      requestFaucet: opts.requestFaucet,
      requireReady: opts.requireReady,
      skipReadyGate: opts.skipReadyGate,
      readyTimeoutSeconds: opts.readyTimeoutSeconds,
    });
    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    }
    if (!report.ok) {
      process.exit(1);
    }
  });

// clawd init
program
  .command("init")
  .description("Initialize a new ClawChain node/identity (optionally bootstrap network from manifest/nodecard)")
  .option("--moniker <name>", "node moniker", "clawd-node")
  .option("--chain-id <id>", "chain ID", "clawchain-1")
  .option("--node-binary <path>", "path to the clawchaind binary")
  .option("--proof-binary <path>", "path to the clawproof binary")
  .option("--skip-setup", "skip ZK trusted setup")
  .option("--force", "force re-initialization")
  .option("--seeds <seeds>", "comma-separated seed node addresses (nodeID@host:port)")
  .option("--persistent-peers <peers>", "comma-separated persistent peer addresses")
  .option("--initial-tokens <amount>", "initial token allocation (default: 100000000uclaw)")
  .option("--validator-stake <amount>", "validator stake amount (default: 70000000uclaw)")
  .option("--from-manifest <urlOrPath>", "apply join/bootstrap config from manifest after init")
  .option("--from-nodecard <urlOrPath>", "apply join/bootstrap config from nodecard after init")
  .option("--rpc-url <url>", "override blockchain RPC URL during bootstrap")
  .option("--rest-url <url>", "override blockchain REST/LCD URL during bootstrap")
  .option("--faucet-url <url>", "faucet URL for bootstrap")
  .option("--messaging-endpoint <url>", "public messaging endpoint URL for bootstrap")
  .option("--host <host>", "public host/DNS for peer print + messaging derivation")
  .option("--no-sync-genesis", "skip manifest genesis sync during bootstrap")
  .option("--request-faucet", "request starter tokens after bootstrap")
  .action(async (opts) => {
    await runInit({
      moniker: opts.moniker,
      chainId: opts.chainId,
      nodeBinary: opts.nodeBinary,
      proofBinary: opts.proofBinary,
      skipSetup: opts.skipSetup,
      force: opts.force,
      seeds: opts.seeds,
      persistentPeers: opts.persistentPeers,
      initialTokens: opts.initialTokens,
      validatorStake: opts.validatorStake,
      fromManifest: opts.fromManifest,
      fromNodecard: opts.fromNodecard,
      rpcUrl: opts.rpcUrl,
      restUrl: opts.restUrl,
      faucetUrl: opts.faucetUrl,
      messagingEndpoint: opts.messagingEndpoint,
      host: opts.host,
      noSyncGenesis: opts.syncGenesis === false,
      requestFaucet: opts.requestFaucet,
    });
  });

// clawd status
program
  .command("status")
  .description("Check chain node, peers, and gateway health")
  .action(async () => {
    await runStatus();
  });

// clawd provider
program
  .command("provider")
  .description("Provider-mode lifecycle and operator state")
  .command("status")
  .description("Show provider registration, heartbeat, recovery, and rewards state")
  .option("--out <format>", "output format: pretty|json", "pretty")
  .action(async (opts) => {
    await runProviderStatus({ out: opts.out });
  });

// clawd dashboard
program
  .command("dashboard")
  .description("Show a comprehensive terminal dashboard of chain status at a glance")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runDashboard({ json: opts.json });
  });

// clawd join
program
  .command("join")
  .description("Join an existing clawd network (configure RPC/peers/faucet)")
  .option("--from-manifest <urlOrPath>", "load chain endpoints/seeds from manifest.json")
  .option("--from-nodecard <urlOrPath>", "load peer/endpoints from a nodecard JSON")
  .option("--chain-id <id>", "chain ID")
  .option("--rpc-url <url>", "blockchain RPC URL")
  .option("--rest-url <url>", "blockchain REST/LCD URL")
  .option("--seeds <peers>", "comma-separated seed peers")
  .option("--persistent-peers <peers>", "comma-separated persistent peers")
  .option("--faucet-url <url>", "faucet URL")
  .option("--messaging-endpoint <url>", "public messaging endpoint URL")
  .option("--host <host>", "public host/DNS (also used to derive messaging endpoint when omitted)")
  .option("--no-sync-genesis", "do not download/verify/write genesis from manifest")
  .option("--require-signed-manifest", "require a trusted signature on manifest.json")
  .option("--manifest-trusted-pubkeys <csv>", "comma-separated trusted secp256k1 pubkeys (hex, 33-byte compressed)")
  .option("--request-faucet", "request starter tokens after join configuration")
  .action(async (opts) => {
    await runJoin({
      fromManifest: opts.fromManifest,
      fromNodecard: opts.fromNodecard,
      chainId: opts.chainId,
      rpcUrl: opts.rpcUrl,
      restUrl: opts.restUrl,
      seeds: opts.seeds,
      persistentPeers: opts.persistentPeers,
      faucetUrl: opts.faucetUrl,
      messagingEndpoint: opts.messagingEndpoint,
      host: opts.host,
      requestFaucet: opts.requestFaucet,
      syncGenesis: opts.syncGenesis,
      requireSignedManifest: opts.requireSignedManifest,
      manifestTrustedPubkeys: opts.manifestTrustedPubkeys,
    });
  });

// clawd doctor
program
  .command("doctor")
  .description("Run operator health diagnostics for chain + agent runtime")
  .option("--json", "output machine-readable diagnostics with lifecycle stages")
  .action(async (opts) => {
    await runDoctor({
      json: opts.json,
    });
  });

// clawd readiness
program
  .command("readiness")
  .description("Run strict integrated runtime+chain readiness checks")
  .option("--json", "output machine-readable readiness result")
  .action(async (opts) => {
    await runReadiness({
      json: opts.json,
    });
  });

// clawd release-summary
program
  .command("release-summary")
  .description("Show release gate states from artifacts/release-evidence.json")
  .option("--json", "output machine-readable summary")
  .option("--failed-only", "show only non-passing gates")
  .action(async (opts) => {
    await runReleaseSummary({
      json: opts.json,
      failedOnly: opts.failedOnly,
    });
  });

// clawd install-node
program
  .command("install-node")
  .description("Install/manage local chain node auto-start service")
  .option("--binary-path <path>", "path to clawchaind binary")
  .option("--node-home <path>", "clawchaind --home directory")
  .option("--service-name <name>", "service name (default: clawd-node)")
  .option("--build-local", "build clawchaind from local repo before install")
  .option("--no-service", "skip service install and only update config")
  .option("--no-start-now", "install service but do not start immediately")
  .action(async (opts) => {
    await runInstallNode({
      binaryPath: opts.binaryPath,
      nodeHome: opts.nodeHome,
      serviceName: opts.serviceName,
      buildLocal: opts.buildLocal,
      noService: opts.noService,
      startNow: opts.startNow,
    });
  });

// clawd bootstrap
program
  .command("bootstrap")
  .description("One-command operator onboarding (install-node + join + doctor)")
  .option("--from-manifest <urlOrPath>", "load chain endpoints/seeds from manifest.json")
  .option("--from-nodecard <urlOrPath>", "load peer/endpoints from a nodecard JSON")
  .option("--chain-id <id>", "chain ID")
  .option("--rpc-url <url>", "blockchain RPC URL")
  .option("--rest-url <url>", "blockchain REST/LCD URL")
  .option("--seeds <peers>", "comma-separated seed peers")
  .option("--persistent-peers <peers>", "comma-separated persistent peers")
  .option("--faucet-url <url>", "faucet URL")
  .option("--messaging-endpoint <url>", "public messaging endpoint URL")
  .option("--host <host>", "public host/DNS (also used to derive messaging endpoint when omitted)")
  .option("--no-sync-genesis", "do not download/verify/write genesis from manifest")
  .option("--require-signed-manifest", "require a trusted signature on manifest.json")
  .option("--manifest-trusted-pubkeys <csv>", "comma-separated trusted secp256k1 pubkeys (hex, 33-byte compressed)")
  .option("--request-faucet", "request starter tokens after join configuration")
  .option("--binary-path <path>", "path to clawchaind binary")
  .option("--node-home <path>", "clawchaind --home directory")
  .option("--service-name <name>", "service name (default: clawd-node)")
  .option("--build-local", "build clawchaind from local repo before install")
  .option("--no-service", "skip service install and only update config")
  .option("--no-start-now", "install service but do not start immediately")
  .option("--require-ready", "wait for strict integrated readiness after bootstrap steps")
  .option("--ready-timeout-seconds <seconds>", "readiness wait timeout in seconds (default: 120)", parseInt)
  .action(async (opts) => {
    await runBootstrap({
      fromManifest: opts.fromManifest,
      fromNodecard: opts.fromNodecard,
      chainId: opts.chainId,
      rpcUrl: opts.rpcUrl,
      restUrl: opts.restUrl,
      seeds: opts.seeds,
      persistentPeers: opts.persistentPeers,
      faucetUrl: opts.faucetUrl,
      messagingEndpoint: opts.messagingEndpoint,
      host: opts.host,
      requestFaucet: opts.requestFaucet,
      noSyncGenesis: opts.syncGenesis === false,
      requireSignedManifest: opts.requireSignedManifest,
      manifestTrustedPubkeys: opts.manifestTrustedPubkeys,
      binaryPath: opts.binaryPath,
      nodeHome: opts.nodeHome,
      serviceName: opts.serviceName,
      buildLocal: opts.buildLocal,
      noService: opts.noService,
      noStartNow: opts.noStartNow,
      requireReady: opts.requireReady,
      readyTimeoutSeconds: opts.readyTimeoutSeconds,
    });
  });

// clawd nodecard
program
  .command("nodecard")
  .description("Print a shareable node descriptor (peer + endpoints)")
  .option("--host <host>", "public host for peer endpoint")
  .option("--p2p-port <port>", "public p2p port", parseInt)
  .option("--rpc-url <url>", "override RPC URL")
  .option("--rest-url <url>", "override REST URL")
  .option("--faucet-url <url>", "override faucet URL")
  .option("--messaging-endpoint <url>", "override messaging endpoint URL")
  .option("--write <path>", "write nodecard JSON to file path")
  .option("--out <format>", "output format: json|pretty", "json")
  .action((opts) => {
    runNodecard({
      host: opts.host,
      p2pPort: opts.p2pPort,
      rpcUrl: opts.rpcUrl,
      restUrl: opts.restUrl,
      faucetUrl: opts.faucetUrl,
      messagingEndpoint: opts.messagingEndpoint,
      writePath: opts.write,
      out: opts.out,
    });
  });

// clawd keys
program
  .command("keys")
  .description("Manage chain keys (forwards to clawchaind)")
  .allowUnknownOption()
  .helpOption(false)
  .action((_opts, cmd) => {
    // Pass through all remaining arguments to clawchaind keys
    runKeys(cmd.args);
  });

// clawd wallet
const walletCmd = program
  .command("wallet")
  .description("Simple wallet UX (balance, send, history, contacts, earnings)");

walletCmd
  .command("balance")
  .description("Show wallet balances")
  .option("--address <bech32>", "wallet address (default: configured agent)")
  .option("--denom <denom>", "primary denom to show (default: uclaw)")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runWalletBalance({
      address: opts.address,
      denom: opts.denom,
      json: opts.json,
    });
  });

walletCmd
  .command("send")
  .description("Send CLAW tokens")
  .argument("<to>", "recipient bech32 address")
  .argument("<amount>", "amount in CLAW (e.g. 1 or 1.25)")
  .option("--denom <denom>", "token denom (default: uclaw)")
  .option("--memo <text>", "optional tx memo")
  .action(async (to: string, amount: string, opts) => {
    await runWalletSend({
      to,
      amount,
      denom: opts.denom,
      memo: opts.memo,
    });
  });

walletCmd
  .command("history")
  .description("Show recent wallet transaction history")
  .option("--address <bech32>", "wallet address (default: configured agent)")
  .option("--limit <n>", "number of entries (default: 20)", parseInt)
  .option("--cursor <cursor>", "history cursor token from previous response")
  .option("--from <url>", "tx-history backend base URL")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runWalletHistory({
      address: opts.address,
      limit: opts.limit,
      cursor: opts.cursor,
      from: opts.from,
      json: opts.json,
    });
  });

walletCmd
  .command("contacts")
  .description("List discovered recipient contacts (aliases + live on-chain agents)")
  .option("--limit <n>", "maximum number of contacts (default: 50)", parseInt)
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runWalletContacts({
      limit: opts.limit,
      json: opts.json,
    });
  });

walletCmd
  .command("find")
  .description("Find recipient contacts by name/address text")
  .argument("<query>", "name or address fragment")
  .option("--limit <n>", "maximum number of contacts (default: 50)", parseInt)
  .option("--json", "output machine-readable JSON")
  .action(async (query: string, opts) => {
    await runWalletContacts({
      query,
      limit: opts.limit,
      json: opts.json,
    });
  });

walletCmd
  .command("earnings")
  .description("Show wallet earnings summary from tx-history backend")
  .option("--address <bech32>", "wallet address (default: configured agent)")
  .option("--window <duration>", "window (e.g. 24h, 7d, 30d)", "7d")
  .option("--from <url>", "tx-history backend base URL")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runWalletEarnings({
      address: opts.address,
      window: opts.window,
      from: opts.from,
      json: opts.json,
    });
  });

const walletAliasCmd = walletCmd
  .command("alias")
  .description("Manage recipient aliases (name -> bech32 address)");

walletAliasCmd
  .command("set")
  .description("Set alias mapping")
  .argument("<name>", "alias name (e.g. alice)")
  .argument("<address>", "recipient bech32 address")
  .action((name: string, address: string) => {
    const cfg = loadClawdConfig();
    const aliases = { ...(cfg.recipientAliases ?? {}) };
    aliases[name.trim().toLowerCase()] = address.trim();
    writeClawdConfig({
      ...cfg,
      recipientAliases: aliases,
    });
    console.log(`Alias set: ${name} -> ${address}`);
  });

walletAliasCmd
  .command("rm")
  .description("Remove alias mapping")
  .argument("<name>", "alias name")
  .action((name: string) => {
    const cfg = loadClawdConfig();
    const key = name.trim().toLowerCase();
    const aliases = { ...(cfg.recipientAliases ?? {}) };
    if (!aliases[key]) {
      console.error(`Alias not found: ${name}`);
      process.exit(1);
    }
    delete aliases[key];
    writeClawdConfig({
      ...cfg,
      recipientAliases: aliases,
    });
    console.log(`Alias removed: ${name}`);
  });

walletAliasCmd
  .command("list")
  .description("List aliases")
  .action(() => {
    const cfg = loadClawdConfig();
    const aliases = cfg.recipientAliases ?? {};
    const names = Object.keys(aliases).sort();
    if (names.length === 0) {
      console.log("No aliases configured.");
      return;
    }
    for (const name of names) {
      console.log(`${name} -> ${aliases[name]}`);
    }
  });

// clawd autonomous
const autoCmd = program
  .command("autonomous")
  .description("Manage autonomous loop + skill executor settings");

autoCmd
  .command("show")
  .description("Show autonomous loop configuration")
  .action(() => {
    const cfg = loadClawdConfig();
    const map = cfg.autonomousSkillExecutorMap ?? {};
    const mapKeys = Object.keys(map).sort();
    console.log(`enabled: ${Boolean(cfg.autonomousLoopEnabled)}`);
    console.log(`intervalSeconds: ${cfg.autonomousLoopIntervalSeconds ?? 20}`);
    console.log(`autoComplete: ${Boolean(cfg.autonomousLoopAutoComplete)}`);
    console.log(`executorCommand: ${cfg.autonomousSkillExecutorCommand ?? ""}`);
    console.log(`executorTimeoutSeconds: ${cfg.autonomousSkillExecutorTimeoutSeconds ?? 90}`);
    console.log(`minTaskBudgetUclaw: ${cfg.autonomousMinTaskBudgetUclaw ?? "0"}`);
    console.log(`minTaskProfitUclaw: ${cfg.autonomousMinTaskProfitUclaw ?? "0"}`);
    console.log(`maxAcceptPerTick: ${cfg.autonomousMaxAcceptPerTick ?? 3}`);
    console.log(`maxPendingAcceptedTasks: ${cfg.autonomousMaxPendingAcceptedTasks ?? 20}`);
    console.log(`allowedSkillIds: ${(cfg.autonomousAllowedSkillIds ?? []).join(",") || "all"}`);
    console.log(`defaultExecutionCostUclaw: ${cfg.autonomousDefaultExecutionCostUclaw ?? "0"}`);
    console.log(`maxExecutionCostPerTaskUclaw: ${cfg.autonomousMaxExecutionCostPerTaskUclaw ?? "1000000000000"}`);
    console.log(`maxExecutionCostPerTickUclaw: ${cfg.autonomousMaxExecutionCostPerTickUclaw ?? "1000000000000"}`);
    console.log(`reputationWeightBps: ${cfg.autonomousReputationWeightBps ?? 5000}`);
    console.log(`skillSuccessWeightBps: ${cfg.autonomousSkillSuccessWeightBps ?? 3000}`);
    console.log(`skillRatingWeightBps: ${cfg.autonomousSkillRatingWeightBps ?? 2000}`);
    console.log(`qualityDataTtlSeconds: ${cfg.autonomousQualityDataTtlSeconds ?? 60}`);
    console.log(`minQualityScoreBps: ${cfg.autonomousMinQualityScoreBps ?? 0}`);
    console.log(`executorMapCount: ${mapKeys.length}`);
    for (const key of mapKeys) {
      console.log(`  ${key} -> ${map[key]}`);
    }
  });

autoCmd
  .command("enable")
  .description("Enable autonomous loop")
  .action(() => {
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousLoopEnabled: true,
    });
    console.log("Autonomous loop enabled.");
  });

autoCmd
  .command("disable")
  .description("Disable autonomous loop")
  .action(() => {
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousLoopEnabled: false,
    });
    console.log("Autonomous loop disabled.");
  });

autoCmd
  .command("set-interval")
  .description("Set autonomous loop poll interval in seconds")
  .argument("<seconds>", "poll interval seconds", parseInt)
  .action((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      console.error("seconds must be a positive integer.");
      process.exit(1);
    }
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousLoopIntervalSeconds: seconds,
    });
    console.log(`Autonomous loop interval set to ${seconds}s.`);
  });

autoCmd
  .command("set-auto-complete")
  .description("Enable or disable autonomous auto-complete")
  .argument("<mode>", "on|off")
  .action((mode: string) => {
    const v = mode.trim().toLowerCase();
    if (v !== "on" && v !== "off") {
      console.error("mode must be 'on' or 'off'.");
      process.exit(1);
    }
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousLoopAutoComplete: v === "on",
    });
    console.log(`Autonomous auto-complete ${v === "on" ? "enabled" : "disabled"}.`);
  });

const autoExecCmd = autoCmd
  .command("executor")
  .description("Manage autonomous global skill executor command");

autoExecCmd
  .command("set")
  .description("Set global executor shell command")
  .argument("<command>", "shell command used for task execution")
  .action((command: string) => {
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousSkillExecutorCommand: command.trim(),
    });
    console.log("Autonomous executor command updated.");
  });

autoExecCmd
  .command("clear")
  .description("Clear global executor shell command")
  .action(() => {
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousSkillExecutorCommand: "",
    });
    console.log("Autonomous executor command cleared.");
  });

autoExecCmd
  .command("set-timeout")
  .description("Set executor timeout in seconds")
  .argument("<seconds>", "timeout seconds", parseInt)
  .action((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      console.error("seconds must be a positive integer.");
      process.exit(1);
    }
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousSkillExecutorTimeoutSeconds: seconds,
    });
    console.log(`Autonomous executor timeout set to ${seconds}s.`);
  });

const autoMapCmd = autoCmd
  .command("map")
  .description("Manage per-skill-id executor command mapping");

autoMapCmd
  .command("set")
  .description("Set per-skill executor command")
  .argument("<skillId>", "skill id")
  .argument("<command>", "shell command")
  .action((skillId: string, command: string) => {
    const key = String(skillId).trim();
    if (!key) {
      console.error("skillId is required.");
      process.exit(1);
    }
    const cfg = loadClawdConfig();
    const map = { ...(cfg.autonomousSkillExecutorMap ?? {}) };
    map[key] = command.trim();
    writeClawdConfig({
      ...cfg,
      autonomousSkillExecutorMap: map,
    });
    console.log(`Autonomous skill map set: ${key}`);
  });

autoMapCmd
  .command("rm")
  .description("Remove per-skill executor command")
  .argument("<skillId>", "skill id")
  .action((skillId: string) => {
    const key = String(skillId).trim();
    const cfg = loadClawdConfig();
    const map = { ...(cfg.autonomousSkillExecutorMap ?? {}) };
    if (!map[key]) {
      console.error(`Skill map entry not found: ${key}`);
      process.exit(1);
    }
    delete map[key];
    writeClawdConfig({
      ...cfg,
      autonomousSkillExecutorMap: map,
    });
    console.log(`Autonomous skill map removed: ${key}`);
  });

autoMapCmd
  .command("list")
  .description("List per-skill executor mapping")
  .action(() => {
    const cfg = loadClawdConfig();
    const map = cfg.autonomousSkillExecutorMap ?? {};
    const keys = Object.keys(map).sort();
    if (keys.length === 0) {
      console.log("No per-skill executor mappings configured.");
      return;
    }
    for (const key of keys) {
      console.log(`${key} -> ${map[key]}`);
    }
  });

autoMapCmd
  .command("sync")
  .description("Auto-discover skill executor mappings from SKILL.md files")
  .option("--skills-roots <csv>", "comma-separated roots to scan", "skills,openclaw/skills")
  .option("--command-template <template>", "fallback command template using {skill_name},{skill_dir},{skill_file}")
  .option("--id-map-json <json>", "optional JSON object mapping skill_name -> skill_id")
  .option("--require-all", "fail if any discovered skill is missing skill_id or executor_command")
  .option("--clear", "replace existing map instead of merging")
  .option("--dry-run", "print discovered mappings without writing config")
  .action((opts) => {
    const roots = String(opts.skillsRoots ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const idMap = parseStringMap(opts.idMapJson);

    const discovered = discoverSkillExecutors(roots);
    if (discovered.length === 0) {
      console.log("No SKILL.md files discovered.");
      return;
    }

    const cfg = loadClawdConfig();
    const next = opts.clear ? {} : { ...(cfg.autonomousSkillExecutorMap ?? {}) };
    const skipped: Array<{ skill: string; file: string; reason: string }> = [];
    let upserts = 0;

    for (const item of discovered) {
      const resolvedId = item.skillId ?? idMap[item.skillName];
      let resolvedCmd = item.executorCommand;
      if (!resolvedCmd && opts.commandTemplate) {
        resolvedCmd = renderCommandTemplate(String(opts.commandTemplate), item.skillName, item.filePath);
      }
      if (!resolvedId) {
        skipped.push({ skill: item.skillName, file: item.filePath, reason: "missing skill_id" });
        continue;
      }
      if (!resolvedCmd) {
        skipped.push({ skill: item.skillName, file: item.filePath, reason: "missing executor_command" });
        continue;
      }
      const key = String(resolvedId).trim();
      const val = String(resolvedCmd).trim();
      if (!key || !val) {
        skipped.push({ skill: item.skillName, file: item.filePath, reason: "empty skill_id or command" });
        continue;
      }
      if (next[key] !== val) {
        upserts += 1;
      }
      next[key] = val;
    }

    const keys = Object.keys(next).sort();
    console.log(`Discovered skill files: ${discovered.length}`);
    console.log(`Map entries after sync: ${keys.length}`);
    console.log(`Upserts: ${upserts}`);
    if (skipped.length > 0) {
      console.log(`Skipped: ${skipped.length}`);
      for (const s of skipped.slice(0, 20)) {
        console.log(`  - ${s.skill} (${s.reason}) [${s.file}]`);
      }
      if (skipped.length > 20) {
        console.log(`  ... and ${skipped.length - 20} more`);
      }
    }
    for (const k of keys) {
      console.log(`${k} -> ${next[k]}`);
    }

    if (opts.requireAll && skipped.length > 0) {
      console.error(
        `require-all failed: ${skipped.length} discovered skill(s) missing skill_id or executor_command.`,
      );
      process.exit(1);
    }

    if (opts.dryRun) {
      console.log("Dry-run mode: config not written.");
      return;
    }

    writeClawdConfig({
      ...cfg,
      autonomousSkillExecutorMap: next,
    });
    console.log("Autonomous skill map synchronized.");
  });

const autoPolicyCmd = autoCmd
  .command("policy")
  .description("Manage autonomous acceptance and execution-budget policy");

autoPolicyCmd
  .command("set-min-budget")
  .description("Set minimum task budget required for auto-accept (uclaw)")
  .argument("<uclaw>", "non-negative integer uclaw")
  .action((uclaw: string) => {
    const normalized = normalizeUclawString(uclaw, "uclaw");
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousMinTaskBudgetUclaw: normalized,
    });
    console.log(`Autonomous min task budget set to ${normalized} uclaw.`);
  });

autoPolicyCmd
  .command("set-min-profit")
  .description("Set minimum expected profit (budget - execution cost) for auto-accept (uclaw)")
  .argument("<uclaw>", "non-negative integer uclaw")
  .action((uclaw: string) => {
    const normalized = normalizeUclawString(uclaw, "uclaw");
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousMinTaskProfitUclaw: normalized,
    });
    console.log(`Autonomous min task profit set to ${normalized} uclaw.`);
  });

autoPolicyCmd
  .command("set-max-accept-per-tick")
  .description("Set max number of pending tasks accepted in one loop tick")
  .argument("<count>", "positive integer", parseInt)
  .action((count: number) => {
    if (!Number.isFinite(count) || count <= 0) {
      console.error("count must be a positive integer.");
      process.exit(1);
    }
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousMaxAcceptPerTick: Math.floor(count),
    });
    console.log(`Autonomous max accept per tick set to ${Math.floor(count)}.`);
  });

autoPolicyCmd
  .command("set-max-pending-accepted")
  .description("Set max concurrently accepted (not completed) tasks")
  .argument("<count>", "positive integer", parseInt)
  .action((count: number) => {
    if (!Number.isFinite(count) || count <= 0) {
      console.error("count must be a positive integer.");
      process.exit(1);
    }
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousMaxPendingAcceptedTasks: Math.floor(count),
    });
    console.log(`Autonomous max pending accepted tasks set to ${Math.floor(count)}.`);
  });

autoPolicyCmd
  .command("set-allowed-skills")
  .description("Set skill-id allowlist for auto-accept. Use 'all' to clear filter.")
  .argument("<csv>", "comma-separated skill IDs or 'all'")
  .action((csv: string) => {
    const raw = String(csv ?? "").trim();
    const cfg = loadClawdConfig();
    if (!raw || raw.toLowerCase() === "all" || raw === "*") {
      writeClawdConfig({
        ...cfg,
        autonomousAllowedSkillIds: [],
      });
      console.log("Autonomous allowed skills set to all.");
      return;
    }
    const ids = raw
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0);
    if (ids.length === 0) {
      console.error("No valid skill IDs found. Example: 1,2,42");
      process.exit(1);
    }
    const uniq = Array.from(new Set(ids));
    writeClawdConfig({
      ...cfg,
      autonomousAllowedSkillIds: uniq,
    });
    console.log(`Autonomous allowed skills set to: ${uniq.join(",")}`);
  });

autoPolicyCmd
  .command("set-default-exec-cost")
  .description("Set default execution cost estimate when task requirements omit it (uclaw)")
  .argument("<uclaw>", "non-negative integer uclaw")
  .action((uclaw: string) => {
    const normalized = normalizeUclawString(uclaw, "uclaw");
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousDefaultExecutionCostUclaw: normalized,
    });
    console.log(`Autonomous default execution cost set to ${normalized} uclaw.`);
  });

autoPolicyCmd
  .command("set-max-exec-cost-per-task")
  .description("Set hard execution-cost cap per task completion attempt (uclaw)")
  .argument("<uclaw>", "non-negative integer uclaw")
  .action((uclaw: string) => {
    const normalized = normalizeUclawString(uclaw, "uclaw");
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousMaxExecutionCostPerTaskUclaw: normalized,
    });
    console.log(`Autonomous max execution cost per task set to ${normalized} uclaw.`);
  });

autoPolicyCmd
  .command("set-max-exec-cost-per-tick")
  .description("Set hard execution-cost cap per loop tick across completions (uclaw)")
  .argument("<uclaw>", "non-negative integer uclaw")
  .action((uclaw: string) => {
    const normalized = normalizeUclawString(uclaw, "uclaw");
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousMaxExecutionCostPerTickUclaw: normalized,
    });
    console.log(`Autonomous max execution cost per tick set to ${normalized} uclaw.`);
  });

autoPolicyCmd
  .command("set-quality-weights")
  .description("Set quality scoring weights for reputation, skill success, and skill rating")
  .requiredOption("--reputation <bps>", "relative weight for reputation signal", parseInt)
  .requiredOption("--success <bps>", "relative weight for skill success-rate signal", parseInt)
  .requiredOption("--rating <bps>", "relative weight for skill rating signal", parseInt)
  .action((opts: { reputation: number; success: number; rating: number }) => {
    const reputation = normalizePositiveInt(opts.reputation, "reputation");
    const success = normalizePositiveInt(opts.success, "success");
    const rating = normalizePositiveInt(opts.rating, "rating");
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousReputationWeightBps: reputation,
      autonomousSkillSuccessWeightBps: success,
      autonomousSkillRatingWeightBps: rating,
    });
    console.log(
      `Autonomous quality weights set: reputation=${reputation} success=${success} rating=${rating}.`,
    );
  });

autoPolicyCmd
  .command("set-quality-cache-ttl")
  .description("Set quality data cache TTL in seconds")
  .argument("<seconds>", "positive integer seconds", parseInt)
  .action((seconds: number) => {
    const ttl = normalizePositiveInt(seconds, "seconds");
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousQualityDataTtlSeconds: ttl,
    });
    console.log(`Autonomous quality cache TTL set to ${ttl}s.`);
  });

autoPolicyCmd
  .command("set-min-quality-score")
  .description("Set minimum composite quality score required for auto-accept (0..10000 bps)")
  .argument("<bps>", "integer basis points 0..10000", parseInt)
  .action((bps: number) => {
    if (!Number.isFinite(bps)) {
      console.error("bps must be an integer between 0 and 10000.");
      process.exit(1);
    }
    const value = Math.floor(bps);
    if (value < 0 || value > 10_000) {
      console.error("bps must be between 0 and 10000.");
      process.exit(1);
    }
    const cfg = loadClawdConfig();
    writeClawdConfig({
      ...cfg,
      autonomousMinQualityScoreBps: value,
    });
    console.log(`Autonomous min quality score set to ${value} bps.`);
  });

// clawd peers
const peersCmd = program
  .command("peers")
  .description("Manage peer discovery settings");

peersCmd
  .command("show")
  .description("Print this node's peer address (nodeID@host:port)")
  .option("--host <host>", "host to display in the peer address", "localhost")
  .action((opts) => {
    runPeersShow(opts.host);
  });

peersCmd
  .command("set")
  .description("Update seed and persistent peer configuration")
  .option("--seeds <seeds>", "comma-separated seed node addresses")
  .option("--persistent-peers <peers>", "comma-separated persistent peer addresses")
  .action((opts) => {
    runPeersSet({
      seeds: opts.seeds,
      persistentPeers: opts.persistentPeers,
    });
  });

peersCmd
  .command("import-nodecards [sources...]")
  .description("Import seed peers from nodecard JSON files/URLs")
  .option("--replace", "replace existing seeds instead of merging")
  .action(async (sources: string[], opts) => {
    await runPeersImportNodecards({
      sources: sources ?? [],
      replace: opts.replace,
    });
  });

peersCmd
  .command("sync-manifest")
  .description("Sync seed peers from a manifest.json (URL or file path)")
  .requiredOption("--from-manifest <urlOrPath>", "manifest source")
  .option("--replace", "replace existing seeds instead of merging")
  .action(async (opts) => {
    await runPeersSyncManifest({
      fromManifest: opts.fromManifest,
      replace: opts.replace,
    });
  });

peersCmd
  .command("verify")
  .description("Verify configured seed peers are reachable over TCP")
  .option("--seeds <seeds>", "comma-separated seed peers to verify (defaults to config)")
  .option("--timeout-ms <ms>", "TCP dial timeout in milliseconds", parseInt)
  .action(async (opts) => {
    await runPeersVerify({
      seeds: opts.seeds,
      timeoutMs: opts.timeoutMs,
    });
  });

peersCmd
  .command("prune-unreachable")
  .description("Remove unreachable seed peers from config")
  .option("--timeout-ms <ms>", "TCP dial timeout in milliseconds", parseInt)
  .option("--dry-run", "show what would change without writing")
  .action(async (opts) => {
    await runPeersPruneUnreachable({
      timeoutMs: opts.timeoutMs,
      dryRun: opts.dryRun,
    });
  });

peersCmd
  .command("auto-maintain")
  .description("Run peer maintenance cycle (sync, verify, prune)")
  .option("--from-manifest <urlOrPath>", "optional manifest source for seed sync")
  .option("--replace-on-sync", "replace seeds during manifest sync")
  .option("--timeout-ms <ms>", "TCP dial timeout in milliseconds", parseInt)
  .option("--dry-run", "run prune in dry-run mode")
  .action(async (opts) => {
    await runPeersAutoMaintain({
      fromManifest: opts.fromManifest,
      replaceOnSync: opts.replaceOnSync,
      timeoutMs: opts.timeoutMs,
      dryRun: opts.dryRun,
    });
  });

peersCmd
  .command("summary")
  .description("Show configured seed peer summary")
  .option("--out <format>", "output format: pretty|json", "pretty")
  .action((opts) => {
    runPeersSummary({ out: opts.out });
  });

// clawd incident
const incidentCmd = program
  .command("incident")
  .description("Incident-mode controls (degraded mode, peer isolation, recovery)");

incidentCmd
  .command("enter")
  .description("Enter incident mode and isolate peers by default")
  .option("--reason <text>", "human-readable incident reason")
  .option("--no-peer-isolation", "do not isolate peers when entering incident mode")
  .option("--dry-run", "preview changes without writing config")
  .action((opts) => {
    runIncidentEnter({
      reason: opts.reason,
      noPeerIsolation: opts.peerIsolation === false,
      dryRun: opts.dryRun,
    });
  });

incidentCmd
  .command("status")
  .description("Show incident-mode status")
  .option("--out <format>", "output format: pretty|json", "pretty")
  .action((opts) => {
    runIncidentStatus({
      out: opts.out,
    });
  });

incidentCmd
  .command("exit")
  .description("Exit incident mode and restore previous peer config by default")
  .option("--no-restore-peers", "do not restore pre-incident peer settings")
  .option("--dry-run", "preview recovery changes without writing config")
  .action((opts) => {
    runIncidentExit({
      restorePeers: opts.restorePeers,
      dryRun: opts.dryRun,
    });
  });

// clawd faucet
const faucetCmd = program
  .command("faucet")
  .description("Token faucet for testnet onboarding");

faucetCmd
  .command("request")
  .description("Request tokens from a faucet endpoint")
  .option("--from <url>", "faucet URL to request from")
  .action(async (opts) => {
    await runFaucetRequest({ from: opts.from });
  });

faucetCmd
  .command("serve")
  .description("Start a faucet HTTP server")
  .option("--port <port>", "port for the faucet server", parseInt)
  .option("--drip-amount <amount>", "amount to drip per request (in uclaw)")
  .action(async (opts) => {
    await runFaucetServe({
      port: opts.port,
      dripAmount: opts.dripAmount,
    });
  });

// clawd send
program
  .command("send <address> <message>")
  .description("Send an encrypted message to another agent")
  .action(async (address: string, message: string) => {
    // Lazy import to avoid pulling in crypto at CLI parse time
    const { loadClawdConfig } = await import("./lib/config.js");
    const { loadMnemonic, mnemonicFileExists } = await import("./lib/mnemonic.js");
    const { sendAgentMessage } = await import("./lib/messaging.js");
    const { Slip10, Slip10Curve, stringToPath, Bip39, EnglishMnemonic } = await import("@cosmjs/crypto");

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
    const restUrl = (() => {
      try {
        const url = new URL(rpcUrl);
        return `${url.protocol}//${url.hostname}:1317`;
      } catch {
        return "http://localhost:1317";
      }
    })();

    // Derive private key
    const seed = await Bip39.mnemonicToSeed(new EnglishMnemonic(mnemonic));
    const hdPath = stringToPath("m/44'/118'/0'/0/0");
    const { privkey } = Slip10.derivePath(Slip10Curve.Secp256k1, seed, hdPath);
    const privateKeyHex = Buffer.from(privkey).toString("hex");

    // Look up recipient agent info
    const agentUrl = `${restUrl}/clawchain/agent/v1/agent/${encodeURIComponent(address)}`;
    const agentRes = await fetch(agentUrl, { signal: AbortSignal.timeout(10_000) });
    if (!agentRes.ok) {
      console.error(`Failed to look up agent ${address}: HTTP ${agentRes.status}`);
      process.exit(1);
    }
    const agentInfo = (await agentRes.json()) as {
      pubkey?: string;
      endpoint?: string;
      registered?: boolean;
    };

    if (!agentInfo.registered || !agentInfo.pubkey || !agentInfo.endpoint) {
      console.error(`Agent ${address} is not registered or missing pubkey/endpoint.`);
      process.exit(1);
    }

    console.log(`Sending encrypted message to ${address}...`);
    try {
      const result = await sendAgentMessage({
        to: address,
        body: message,
        senderPrivKey: privateKeyHex,
        senderAddress: config.agentAddress ?? "",
        recipientPubkey: agentInfo.pubkey,
        recipientEndpoint: agentInfo.endpoint,
      });

      if (result.received) {
        console.log(`Message delivered (id: ${result.id})`);
      } else {
        console.error("Message was not acknowledged by recipient.");
        process.exit(1);
      }
    } catch (err) {
      console.error(`Failed to send message: ${String(err)}`);
      process.exit(1);
    }
  });

// clawd agent-flow
program
  .command("agent-flow")
  .description("Run core agent lifecycle: register -> heartbeat -> delegate (+ optional accept/complete)")
  .requiredOption("--assignee <address>", "task assignee bech32 address")
  .requiredOption("--description <text>", "task description")
  .option("--requirements <text>", "task requirements")
  .option("--skill-id <id>", "task skill ID (default: 0)", parseInt)
  .option("--budget <amount>", "task budget (e.g. 1000uclaw)")
  .option("--deadline-blocks <n>", "task deadline block delta (default: 0)", parseInt)
  .option("--endpoint <url>", "heartbeat/registration endpoint override")
  .option("--metadata <text>", "heartbeat metadata override")
  .option("--name <name>", "registration name override")
  .option("--json", "output machine-readable lifecycle result")
  .option("--auto-accept", "auto-accept delegated task (requires signer == assignee)")
  .option("--auto-complete", "auto-complete delegated task (requires signer == assignee)")
  .option("--completion-result <text>", "result payload for --auto-complete")
  .action(async (opts) => {
    await runAgentFlow({
      assignee: opts.assignee,
      description: opts.description,
      requirements: opts.requirements,
      skillId: opts.skillId,
      budget: opts.budget,
      deadlineBlocks: opts.deadlineBlocks,
      endpoint: opts.endpoint,
      metadata: opts.metadata,
      name: opts.name,
      json: opts.json,
      autoAccept: opts.autoAccept,
      autoComplete: opts.autoComplete,
      completionResult: opts.completionResult,
    });
  });

// clawd product-flow
program
  .command("product-flow")
  .description("Run end-to-end product flow: register -> heartbeat -> task -> message -> purchase -> escrow -> rate -> endorse")
  .requiredOption("--assignee <address>", "task assignee bech32 address")
  .requiredOption("--task-description <text>", "task description")
  .requiredOption("--message-ciphertext <text>", "encrypted on-chain message payload")
  .requiredOption("--skill-id <id>", "marketplace skill ID", parseInt)
  .option("--message-recipient <address>", "message recipient (default: assignee)")
  .option("--message-nonce <text>", "on-chain message nonce")
  .option("--escrow-description <text>", "escrow description (default: task-description)")
  .option("--deadline-blocks <n>", "escrow deadline block delta (default: 100)", parseInt)
  .option("--milestones <n>", "escrow milestone count (default: 1)", parseInt)
  .option("--rating-score <n>", "rating score 1..5 (default: 5)", parseInt)
  .option("--rating-comment <text>", "rating comment override")
  .option("--endorsement-reason <text>", "endorsement reason override")
  .option("--endpoint <url>", "heartbeat/registration endpoint override")
  .option("--metadata <text>", "heartbeat metadata override")
  .option("--name <name>", "registration name override")
  .option("--json", "output machine-readable lifecycle result")
  .action(async (opts) => {
    await runProductFlow({
      assignee: opts.assignee,
      taskDescription: opts.taskDescription,
      messageCiphertext: opts.messageCiphertext,
      skillId: opts.skillId,
      messageRecipient: opts.messageRecipient,
      messageNonce: opts.messageNonce,
      escrowDescription: opts.escrowDescription,
      deadlineBlocks: opts.deadlineBlocks,
      milestones: opts.milestones,
      ratingScore: opts.ratingScore,
      ratingComment: opts.ratingComment,
      endorsementReason: opts.endorsementReason,
      endpoint: opts.endpoint,
      metadata: opts.metadata,
      name: opts.name,
      json: opts.json,
    });
  });

// ---------------------------------------------------------------------------
// clawd agent
// ---------------------------------------------------------------------------
const agentCmd = program.command("agent").description("Manage agent registration and status");

agentCmd
  .command("register")
  .description("Register this node as an agent on-chain")
  .option("--name <name>", "agent display name")
  .option("--endpoint <url>", "agent messaging endpoint")
  .option("--tools <list>", "comma-separated list of supported tools")
  .option("--pricing-hint <hint>", "pricing hint string")
  .option("--version <ver>", "agent version string")
  .action(async (opts) => {
    await runAgentRegister({
      name: opts.name,
      endpoint: opts.endpoint,
      tools: opts.tools,
      pricingHint: opts.pricingHint,
      version: opts.version,
    });
  });

agentCmd
  .command("info")
  .description("Query agent registration, stats, and liveness")
  .option("--address <addr>", "agent bech32 address (default: this node)")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runAgentInfo({ address: opts.address, json: opts.json });
  });

agentCmd
  .command("tasks")
  .description("Query tasks assigned to or delegated by an agent")
  .option("--address <addr>", "agent bech32 address (default: this node)")
  .option("--role <role>", "filter: assigned, delegated, or all", "all")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runAgentTasks({ address: opts.address, role: opts.role, json: opts.json });
  });

agentCmd
  .command("rewards")
  .description("Query cumulative agent rewards")
  .option("--address <addr>", "agent bech32 address (default: this node)")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runAgentRewards({ address: opts.address, json: opts.json });
  });

agentCmd
  .command("heartbeat")
  .description("Send agent heartbeat to the network")
  .option("--endpoint <url>", "endpoint override")
  .option("--metadata <text>", "heartbeat metadata")
  .action(async (opts) => {
    await runAgentHeartbeat({ endpoint: opts.endpoint, metadata: opts.metadata });
  });

agentCmd
  .command("add <name>")
  .description("Add a new agent with a derived HD key")
  .option("--index <n>", "BIP-44 HD index (default: next available)", parseInt)
  .option("--capabilities <list>", "comma-separated list of capabilities")
  .option("--json", "output JSON")
  .action(async (name: string, opts: { index?: number; capabilities?: string; json?: boolean }) => {
    await runAgentAdd({ name, index: opts.index, capabilities: opts.capabilities, json: opts.json });
  });

agentCmd
  .command("list")
  .description("List all configured agents with addresses and status")
  .option("--json", "output JSON")
  .action(async (opts: { json?: boolean }) => {
    await runAgentList({ json: opts.json });
  });

agentCmd
  .command("remove <name>")
  .description("Remove an agent")
  .action(async (name: string) => {
    await runAgentRemove({ name });
  });

agentCmd
  .command("start [name]")
  .description("Start one or all agents")
  .action(async (name?: string) => {
    await runAgentStart({ name });
  });

agentCmd
  .command("stop [name]")
  .description("Stop one or all agents")
  .action(async (name?: string) => {
    await runAgentStop({ name });
  });

// ---------------------------------------------------------------------------
// clawd gpu
// ---------------------------------------------------------------------------
const gpuCmd = program.command("gpu").description("GPU compute marketplace");

gpuCmd
  .command("list")
  .description("List available GPU compute resources")
  .option("--available", "show only available resources")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runGpuList({ available: opts.available, json: opts.json });
  });

gpuCmd
  .command("lease")
  .description("Lease a GPU compute resource")
  .requiredOption("--resource-id <id>", "resource ID to lease", parseInt)
  .requiredOption("--hours <n>", "number of hours to lease", parseInt)
  .action(async (opts) => {
    await runGpuLease({ resourceId: opts.resourceId, hours: opts.hours });
  });

gpuCmd
  .command("submit-job")
  .description("Submit a compute job to a leased GPU")
  .requiredOption("--resource-id <id>", "resource ID", parseInt)
  .requiredOption("--lease-id <id>", "lease ID", parseInt)
  .requiredOption("--name <name>", "job name")
  .option("--job-type <type>", "job type (training, inference, etc)")
  .option("--execution-type <type>", "execution type (docker, script, etc)")
  .option("--docker-image <image>", "Docker image to run")
  .option("--script-content <script>", "inline script content")
  .option("--input-data-uri <uri>", "input data URI")
  .option("--output-data-uri <uri>", "output data URI")
  .option("--params <json>", "additional parameters as JSON string")
  .action(async (opts) => {
    await runGpuSubmitJob({
      resourceId: opts.resourceId,
      leaseId: opts.leaseId,
      name: opts.name,
      jobType: opts.jobType,
      executionType: opts.executionType,
      dockerImage: opts.dockerImage,
      scriptContent: opts.scriptContent,
      inputDataUri: opts.inputDataUri,
      outputDataUri: opts.outputDataUri,
      params: opts.params,
    });
  });

gpuCmd
  .command("jobs")
  .description("List compute jobs")
  .option("--address <addr>", "filter by submitter address")
  .option("--resource-id <id>", "filter by resource ID", parseInt)
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runGpuJobs({ address: opts.address, resourceId: opts.resourceId, json: opts.json });
  });

gpuCmd
  .command("status")
  .description("Get compute job status")
  .argument("<jobId>", "job ID to check", parseInt)
  .option("--json", "output JSON")
  .action(async (jobId, opts) => {
    await runGpuStatus({ jobId, json: opts.json });
  });

gpuCmd
  .command("leases")
  .description("List compute leases")
  .option("--address <addr>", "filter by lessee address")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runGpuLeases({ address: opts.address, json: opts.json });
  });

gpuCmd
  .command("providers")
  .description("List registered GPU compute providers")
  .option("--active", "show only active providers")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runGpuProviders({ active: opts.active, json: opts.json });
  });

gpuCmd
  .command("job-status")
  .description("Get detailed status of a GPU compute job")
  .argument("<jobId>", "job ID to check", parseInt)
  .option("--json", "output JSON")
  .action(async (jobId, opts) => {
    await runGpuJobStatus({ jobId, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd model
// ---------------------------------------------------------------------------
const modelCmd = program.command("model").description("AI model registry");

modelCmd
  .command("list")
  .description("List registered AI models")
  .option("--owner <address>", "filter by owner address")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelList({ owner: opts.owner, json: opts.json });
  });

modelCmd
  .command("query <modelId>")
  .description("Get details of a specific model")
  .option("--json", "output JSON")
  .action(async (modelId: string, opts) => {
    await runModelQuery({ modelId, json: opts.json });
  });

modelCmd
  .command("register")
  .description("Register a new model in the on-chain registry")
  .requiredOption("--name <name>", "model name")
  .option("--description <text>", "model description")
  .option("--model-type <type>", "model type (e.g. llm, diffusion, classifier)")
  .option("--access-type <type>", "access type (free, per_query, subscription)")
  .option("--price-per-query <amount>", "price per query in uclaw")
  .option("--endpoint <url>", "inference endpoint URL")
  .action(async (opts) => {
    await runModelRegister({
      name: opts.name,
      description: opts.description,
      modelType: opts.modelType,
      accessType: opts.accessType,
      pricePerQuery: opts.pricePerQuery,
      endpoint: opts.endpoint,
    });
  });

modelCmd
  .command("providers")
  .description("List inference providers")
  .option("--model-id <id>", "filter by model ID")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelProviders({ modelId: opts.modelId, json: opts.json });
  });

modelCmd
  .command("inference")
  .description("Submit an inference request to a model")
  .requiredOption("--model-id <id>", "model ID")
  .requiredOption("--input <text>", "inference input/prompt")
  .option("--max-fee <amount>", "maximum fee in uclaw")
  .action(async (opts) => {
    await runModelInference({
      modelId: opts.modelId,
      input: opts.input,
      maxFee: opts.maxFee,
    });
  });

// ---------------------------------------------------------------------------
// clawd model-token
// ---------------------------------------------------------------------------
const modelTokenCmd = program.command("model-token").description("Tokenized AI-model assets");

modelTokenCmd
  .command("catalog")
  .description("List real model-token presets backed by OpenRouter model IDs")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelTokenCatalog({ json: opts.json });
  });

modelTokenCmd
  .command("issue")
  .description("Register a model, create its tokenfactory denom, mint supply, and optionally seed a DEX pool")
  .option("--model <id>", "model slug or OpenRouter model ID, e.g. anthropic/claude-opus-4.8")
  .option("--preset <id>", "real model preset from `model-token catalog`, e.g. claude-opus-4.8")
  .requiredOption("--supply <amount>", "initial model-token supply to mint")
  .option("--symbol <subdenom>", "tokenfactory subdenom; defaults to normalized --model")
  .option("--name <name>", "model registry display name")
  .option("--description <text>", "model registry description")
  .option("--framework <framework>", "model framework (pytorch, tensorflow, onnx, gguf, safetensors, jax, other)", "other")
  .option("--architecture <text>", "model architecture metadata")
  .option("--parameter-count <text>", "parameter count metadata")
  .option("--license <text>", "license metadata")
  .option("--tags <csv>", "comma-separated model tags")
  .option("--storage-type <type>", "model storage type", "remote")
  .option("--storage-uri <uri>", "model storage URI")
  .option("--checksum-sha256 <hex>", "model artifact checksum")
  .option("--size-bytes <n>", "model artifact size in bytes", "0")
  .option("--access-type <type>", "model access type (free, per_query, subscription, one_time)", "per_query")
  .option("--price-per-query-uclaw <amount>", "modelregistry price per query in uclaw", "0")
  .option("--price-one-time-uclaw <amount>", "modelregistry one-time price in uclaw", "0")
  .option("--dex-factory <address>", "Astroport factory contract to create TOKEN/CLAW pair")
  .option("--base-denom <denom>", "base asset denom for DEX pair; defaults to configured chain denom")
  .option("--base-amount <amount>", "base asset amount for initial liquidity")
  .option("--model-amount <amount>", "model-token amount for initial liquidity")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelTokenIssue({
      model: opts.model,
      preset: opts.preset,
      symbol: opts.symbol,
      supply: opts.supply,
      name: opts.name,
      description: opts.description,
      framework: opts.framework,
      architecture: opts.architecture,
      parameterCount: opts.parameterCount,
      license: opts.license,
      tags: opts.tags,
      storageType: opts.storageType,
      storageUri: opts.storageUri,
      checksumSha256: opts.checksumSha256,
      sizeBytes: opts.sizeBytes,
      accessType: opts.accessType,
      pricePerQueryUclaw: opts.pricePerQueryUclaw,
      priceOneTimeUclaw: opts.priceOneTimeUclaw,
      dexFactory: opts.dexFactory,
      baseDenom: opts.baseDenom,
      baseAmount: opts.baseAmount,
      modelAmount: opts.modelAmount,
      json: opts.json,
    });
  });

modelTokenCmd
  .command("launch")
  .description("Issue a model token AND deploy its ModelVault in one signed flow")
  .option("--model <id>", "model slug or OpenRouter model ID, e.g. anthropic/claude-opus-4.8")
  .option("--preset <id>", "real model preset from `model-token catalog`, e.g. claude-opus-4.8")
  .requiredOption("--supply <amount>", "initial model-token supply to mint")
  .option("--symbol <subdenom>", "tokenfactory subdenom; defaults to normalized --model")
  .option("--name <name>", "model registry display name")
  .option("--description <text>", "model registry description")
  .option("--framework <framework>", "model framework (pytorch, tensorflow, onnx, gguf, safetensors, jax, other)", "other")
  .option("--architecture <text>", "model architecture metadata")
  .option("--parameter-count <text>", "parameter count metadata")
  .option("--license <text>", "license metadata")
  .option("--tags <csv>", "comma-separated model tags")
  .option("--storage-type <type>", "model storage type", "remote")
  .option("--storage-uri <uri>", "model storage URI")
  .option("--checksum-sha256 <hex>", "model artifact checksum")
  .option("--size-bytes <n>", "model artifact size in bytes", "0")
  .option("--access-type <type>", "model access type (free, per_query, subscription, one_time)", "per_query")
  .option("--price-per-query-uclaw <amount>", "modelregistry price per query in uclaw", "0")
  .option("--price-one-time-uclaw <amount>", "modelregistry one-time price in uclaw", "0")
  .option("--dex-factory <address>", "Astroport factory contract to create TOKEN/CLAW pair")
  .option("--base-denom <denom>", "base asset denom for DEX pair; defaults to configured chain denom")
  .option("--base-amount <amount>", "base asset amount for initial liquidity")
  .option("--model-amount <amount>", "model-token amount for initial liquidity")
  .option("--wasm <path>", "optimized ModelVault wasm to store first (parses code_id)")
  .option("--code-id <n>", "reuse an already-uploaded ModelVault code id (skips the store step)")
  .option("--reserve-denom <denom>", "bonding-curve quote asset; defaults to --base-denom or chain denom")
  .option("--vault-owner <address>", "vault owner (defaults to the deploying signer)")
  .option("--fee-bps <n>", "vault swap fee in basis points", "30")
  .option("--label <s>", "instantiate label", "model-vault")
  .option("--admin <address>", "contract admin (defaults to the deploying signer)")
  .option("--seed-reserve <amount>", "reserve-denom amount to fund the vault after instantiate")
  .option("--seed-inventory <amount>", "model-denom amount to fund the vault after instantiate")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelTokenLaunch({
      model: opts.model,
      preset: opts.preset,
      symbol: opts.symbol,
      supply: opts.supply,
      name: opts.name,
      description: opts.description,
      framework: opts.framework,
      architecture: opts.architecture,
      parameterCount: opts.parameterCount,
      license: opts.license,
      tags: opts.tags,
      storageType: opts.storageType,
      storageUri: opts.storageUri,
      checksumSha256: opts.checksumSha256,
      sizeBytes: opts.sizeBytes,
      accessType: opts.accessType,
      pricePerQueryUclaw: opts.pricePerQueryUclaw,
      priceOneTimeUclaw: opts.priceOneTimeUclaw,
      dexFactory: opts.dexFactory,
      baseDenom: opts.baseDenom,
      baseAmount: opts.baseAmount,
      modelAmount: opts.modelAmount,
      wasm: opts.wasm,
      codeId: opts.codeId,
      reserveDenom: opts.reserveDenom,
      vaultOwner: opts.vaultOwner,
      feeBps: opts.feeBps,
      label: opts.label,
      admin: opts.admin,
      seedReserve: opts.seedReserve,
      seedInventory: opts.seedInventory,
      json: opts.json,
    });
  });

modelTokenCmd
  .command("redeem")
  .description("Burn model tokens and submit an inference job")
  .requiredOption("--model-id <id>", "on-chain modelregistry model ID")
  .requiredOption("--amount <amount>", "model-token amount to burn")
  .requiredOption("--input <text>", "prompt/input for the inference job")
  .option("--denom <denom>", "full tokenfactory denom to burn")
  .option("--model <slug>", "model slug used to derive denom when --denom is omitted")
  .option("--symbol <subdenom>", "tokenfactory subdenom used with --model")
  .option("--model-version <version>", "model version to request", "0")
  .option("--max-tokens <n>", "maximum output tokens", "512")
  .option("--temperature <value>", "sampling temperature", "0.7")
  .option("--payment-uclaw <amount>", "uclaw payment attached to the inference job", "0")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelTokenRedeem({
      modelId: opts.modelId,
      modelVersion: opts.modelVersion,
      amount: opts.amount,
      input: opts.input,
      denom: opts.denom,
      model: opts.model,
      symbol: opts.symbol,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      paymentUclaw: opts.paymentUclaw,
      json: opts.json,
    });
  });

modelTokenCmd
  .command("inference-setup")
  .description("Set model inference pricing and optionally register the owner as provider")
  .requiredOption("--model-id <id>", "on-chain modelregistry model ID")
  .option("--price-per-token-uclaw <amount>", "uclaw charged per output token", "0")
  .option("--price-per-query-uclaw <amount>", "flat uclaw charged per query", "0")
  .option("--min-payment-uclaw <amount>", "minimum uclaw payment accepted for jobs", "0")
  .option("--max-tokens <n>", "maximum output tokens accepted for jobs", "512")
  .option("--register-provider", "also register this wallet as an online inference provider")
  .option("--endpoint <uri>", "provider endpoint metadata", "clawchain://local-provider")
  .option("--max-concurrent <n>", "provider max concurrent jobs", "1")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelTokenInferenceSetup({
      modelId: opts.modelId,
      pricePerTokenUclaw: opts.pricePerTokenUclaw,
      pricePerQueryUclaw: opts.pricePerQueryUclaw,
      minPaymentUclaw: opts.minPaymentUclaw,
      maxTokens: opts.maxTokens,
      registerProvider: opts.registerProvider,
      endpoint: opts.endpoint,
      maxConcurrent: opts.maxConcurrent,
      json: opts.json,
    });
  });

modelTokenCmd
  .command("start-job")
  .description("Provider marks a model-token inference job as running")
  .requiredOption("--job-id <id>", "inference job ID")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelTokenStartJob({
      jobId: opts.jobId,
      json: opts.json,
    });
  });

modelTokenCmd
  .command("complete-job")
  .description("Provider completes a model-token inference job with output")
  .requiredOption("--job-id <id>", "inference job ID")
  .requiredOption("--output <text>", "inference result/output to store on-chain")
  .requiredOption("--tokens-used <n>", "output tokens used for settlement")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelTokenCompleteJob({
      jobId: opts.jobId,
      output: opts.output,
      tokensUsed: opts.tokensUsed,
      json: opts.json,
    });
  });

modelTokenCmd
  .command("serve-once")
  .description("Provider queries assigned jobs, starts pending jobs, and completes them once")
  .option("--model-id <id>", "only serve jobs for one model")
  .option("--status <status>", "job status to query: active, pending, running, completed, failed, all", "active")
  .option("--max-jobs <n>", "maximum jobs to serve", "1")
  .option("--output <template>", "completion output template; supports {job_id}, {model_id}, {requester}, {input}")
  .option("--openrouter-model <id>", "execute job input through OpenRouter using OPENROUTER_API_KEY")
  .option("--dry-run", "show matched assigned jobs without submitting txs")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelTokenServeOnce({
      modelId: opts.modelId,
      status: opts.status,
      maxJobs: opts.maxJobs,
      output: opts.output,
      openrouterModel: opts.openrouterModel,
      dryRun: opts.dryRun,
      json: opts.json,
    });
  });

modelTokenCmd
  .command("serve-loop")
  .description("Run the model-token provider job server repeatedly until stopped")
  .option("--model-id <id>", "only serve jobs for one model")
  .option("--status <status>", "job status to query: active, pending, running, completed, failed, all", "active")
  .option("--max-jobs <n>", "maximum jobs to serve per cycle", "1")
  .option("--interval-ms <n>", "milliseconds to wait between cycles", "5000")
  .option("--max-cycles <n>", "stop after this many cycles; 0 means run until stopped", "0")
  .option("--output <template>", "completion output template; supports {job_id}, {model_id}, {requester}, {input}")
  .option("--openrouter-model <id>", "execute job input through OpenRouter using OPENROUTER_API_KEY")
  .option("--dry-run", "show matched assigned jobs without submitting txs")
  .option("--json", "output JSON per cycle")
  .action(async (opts) => {
    await runModelTokenServeLoop({
      modelId: opts.modelId,
      status: opts.status,
      maxJobs: opts.maxJobs,
      intervalMs: opts.intervalMs,
      maxCycles: opts.maxCycles,
      output: opts.output,
      openrouterModel: opts.openrouterModel,
      dryRun: opts.dryRun,
      json: opts.json,
    });
  });

// ---------------------------------------------------------------------------
// clawd model-vault
// ---------------------------------------------------------------------------
const modelVaultCmd = program
  .command("model-vault")
  .description("ModelVault bonding-curve market + dividend pool for AI model tokens");

modelVaultCmd
  .command("fund")
  .description("Owner seeds the vault with reserve and/or model-token liquidity")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .requiredOption("--amount <amount>", "amount to attach")
  .requiredOption("--denom <denom>", "denom to attach (reserve_denom or model_denom)")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultFund({
      contract: opts.contract,
      amount: opts.amount,
      denom: opts.denom,
      json: opts.json,
    });
  });

modelVaultCmd
  .command("buy")
  .description("Buy model tokens off the bonding curve (attaches reserve_denom)")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .requiredOption("--amount <amount>", "reserve amount to spend")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultBuy({ contract: opts.contract, amount: opts.amount, json: opts.json });
  });

modelVaultCmd
  .command("sell")
  .description("Sell model tokens back to the bonding curve (attaches model_denom)")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .requiredOption("--amount <amount>", "model-token amount to sell")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultSell({ contract: opts.contract, amount: opts.amount, json: opts.json });
  });

modelVaultCmd
  .command("stake")
  .description("Stake model tokens into the dividend pool (attaches model_denom)")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .requiredOption("--amount <amount>", "model-token amount to stake")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultStake({ contract: opts.contract, amount: opts.amount, json: opts.json });
  });

modelVaultCmd
  .command("unstake")
  .description("Unstake previously staked model tokens")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .requiredOption("--amount <amount>", "model-token amount to unstake")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultUnstake({ contract: opts.contract, amount: opts.amount, json: opts.json });
  });

modelVaultCmd
  .command("claim")
  .description("Claim accrued reserve-denom dividends")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultClaim({ contract: opts.contract, json: opts.json });
  });

modelVaultCmd
  .command("distribute")
  .description("Distribute reserve-denom revenue to stakers pro-rata (attaches reserve_denom)")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .requiredOption("--amount <amount>", "reserve amount to distribute")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultDistribute({
      contract: opts.contract,
      amount: opts.amount,
      json: opts.json,
    });
  });

modelVaultCmd
  .command("quote")
  .description("Quote a hypothetical buy/sell against the curve (no signing)")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .requiredOption("--side <side>", 'trade side: "buy" or "sell"')
  .requiredOption("--amount <amount>", "input amount to quote")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultQuote({
      contract: opts.contract,
      side: opts.side,
      amount: opts.amount,
      json: opts.json,
    });
  });

modelVaultCmd
  .command("stake-info")
  .description("Query a staker's position and live claimable dividends")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .requiredOption("--address <address>", "staker address to inspect")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultStakeInfo({
      contract: opts.contract,
      address: opts.address,
      json: opts.json,
    });
  });

modelVaultCmd
  .command("pool-info")
  .description("Query global dividend-pool state (total staked + reward index)")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultPoolInfo({ contract: opts.contract, json: opts.json });
  });

modelVaultCmd
  .command("config")
  .description("Query the vault configuration (denoms, owner, fee)")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultConfig({ contract: opts.contract, json: opts.json });
  });

modelVaultCmd
  .command("pool")
  .description("Query the bonding-curve pool balances (reserve + inventory)")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultPool({ contract: opts.contract, json: opts.json });
  });

modelVaultCmd
  .command("watch")
  .description("Poll the curve spot price, reserves, total staked, and reward index each cycle")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .option("--interval-ms <ms>", "polling interval in milliseconds", "5000")
  .option("--max-cycles <n>", "stop after N cycles (0 = until interrupted)", "0")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultWatch({
      contract: opts.contract,
      intervalMs: opts.intervalMs,
      maxCycles: opts.maxCycles,
      json: opts.json,
    });
  });

modelVaultCmd
  .command("history")
  .description("Sample the curve spot price over time, then print the series + summary stats (first/last/min/max/changePct)")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .option("--interval-ms <ms>", "polling interval in milliseconds", "5000")
  .option("--samples <n>", "total number of samples to collect", "12")
  .option("--json", "output JSON")
  .option("--csv", "output CSV (timestamp,spotPrice,reserve,inventory)")
  .action(async (opts) => {
    await runModelVaultHistory({
      contract: opts.contract,
      intervalMs: opts.intervalMs,
      samples: opts.samples,
      json: opts.json,
      csv: opts.csv,
    });
  });

modelVaultCmd
  .command("alert")
  .description("Poll the curve spot price and fire when it crosses a threshold in the chosen direction")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .requiredOption("--threshold <price>", "spot-price threshold to compare against")
  .option("--direction <above|below>", "trigger when price is above or below the threshold", "above")
  .option("--interval-ms <ms>", "polling interval in milliseconds", "5000")
  .option("--max-cycles <n>", "stop after N cycles (0 = until triggered/interrupted)", "0")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultAlert({
      contract: opts.contract,
      threshold: opts.threshold,
      direction: opts.direction,
      intervalMs: opts.intervalMs,
      maxCycles: opts.maxCycles,
      json: opts.json,
    });
  });

modelVaultCmd
  .command("arb")
  .description("Compare curve spot price to a DEX pair and emit the rebalancing trade (dry-run by default)")
  .requiredOption("--contract <address>", "ModelVault contract address")
  .requiredOption("--dex-pair <address>", "Astroport pair contract address (TOKEN/CLAW)")
  .option("--threshold-bps <n>", "minimum price divergence (basis points) to act", "50")
  .option("--max-trade <amount>", "max curve-leg trade size", "1000000")
  .option("--execute", "sign + broadcast the curve leg (default is dry-run)")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultArb({
      contract: opts.contract,
      dexPair: opts.dexPair,
      thresholdBps: opts.thresholdBps,
      maxTrade: opts.maxTrade,
      execute: opts.execute,
      json: opts.json,
    });
  });

modelVaultCmd
  .command("portfolio")
  .description("Aggregate one staker's positions (staked + claimable) across a list of vaults")
  .option("--address <address>", "staker address to inspect (defaults to configured signer)")
  .option("--vaults <a,b,c>", "comma-separated vault contract addresses")
  .option(
    "--vault <address>",
    "vault contract address (repeatable)",
    (value: string, prev: string[] = []) => [...prev, value],
    [] as string[],
  )
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultPortfolio({
      address: opts.address,
      vaults: opts.vaults,
      vault: opts.vault,
      json: opts.json,
    });
  });

modelVaultCmd
  .command("compare")
  .description("Side-by-side bonding-curve snapshot (spot price, reserves, stake) across vaults")
  .option("--contracts <a,b,c>", "comma-separated vault contract addresses")
  .option(
    "--contract <address>",
    "vault contract address (repeatable)",
    (value: string, prev: string[] = []) => [...prev, value],
    [] as string[],
  )
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultCompare({
      contracts: opts.contracts,
      contract: opts.contract,
      json: opts.json,
    });
  });

modelVaultCmd
  .command("plan")
  .description("Suggest a trade to reach a target spot price (or estimate a buy/sell), validated against the on-chain quote")
  .requiredOption("--contract <address>", "vault contract address")
  .option("--target-price <p>", "target spot price to steer the curve toward")
  .option("--buy <reserveIn>", "estimate a buy of this reserve-denom amount")
  .option("--sell <tokensIn>", "estimate a sell of this model-token amount")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultPlan({
      contract: opts.contract,
      targetPrice: opts.targetPrice,
      buy: opts.buy,
      sell: opts.sell,
      json: opts.json,
    });
  });

modelVaultCmd
  .command("deploy")
  .description("Store + instantiate (+ optionally fund) a ModelVault for a model token")
  .requiredOption("--model-denom <denom>", "model-token denom the vault trades")
  .option("--reserve-denom <denom>", "reserve denom (bonding-curve quote asset)", "uclaw")
  .option("--owner <address>", "vault owner (defaults to the deploying signer)")
  .option("--fee-bps <n>", "swap fee in basis points", "30")
  .option("--wasm <path>", "optimized wasm artifact to store first (parses code_id)")
  .option("--code-id <n>", "reuse an already-uploaded code id (skips the store step)")
  .option("--label <s>", "instantiate label", "model-vault")
  .option("--admin <address>", "contract admin (defaults to the deploying signer)")
  .option("--seed-reserve <amount>", "reserve-denom amount to fund after instantiate")
  .option("--seed-inventory <amount>", "model-denom amount to fund after instantiate")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelVaultDeploy({
      modelDenom: opts.modelDenom,
      reserveDenom: opts.reserveDenom,
      owner: opts.owner,
      feeBps: opts.feeBps,
      wasm: opts.wasm,
      codeId: opts.codeId,
      label: opts.label,
      admin: opts.admin,
      seedReserve: opts.seedReserve,
      seedInventory: opts.seedInventory,
      json: opts.json,
    });
  });

// ---------------------------------------------------------------------------
// clawd model-index
// ---------------------------------------------------------------------------

const modelIndexCmd = program
  .command("model-index")
  .description("Oracle model index — compute & publish per-model fundamentals (P3)");

modelIndexCmd
  .command("compute")
  .description("Compute a model's fundamentals index from on-chain modelregistry data")
  .requiredOption("--model-id <id>", "model registry ID")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelIndexCompute({ modelId: opts.modelId, json: opts.json });
  });

modelIndexCmd
  .command("publish")
  .description("Publish the computed index as an oracle commit-reveal vote (prevote + vote)")
  .requiredOption("--model-id <id>", "model registry ID")
  .requiredOption("--validator <address>", "validator operator address (clawvaloper1...)")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelIndexPublish({
      modelId: opts.modelId,
      validator: opts.validator,
      json: opts.json,
    });
  });

modelIndexCmd
  .command("leaderboard")
  .description("Rank models by their computed fundamentals index (all registered models by default)")
  .option("--models <ids>", "comma-separated model ids to rank (default: all registered)")
  .option("--top <n>", "keep only the top N ranked models (default: all)")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runModelIndexLeaderboard({
      models: opts.models,
      top: opts.top,
      json: opts.json,
    });
  });

// ---------------------------------------------------------------------------
// clawd skill
// ---------------------------------------------------------------------------
const skillCmd = program.command("skill").description("Marketplace skill listings");

skillCmd
  .command("list")
  .description("Browse or search marketplace skills")
  .option("--category <cat>", "filter by category")
  .option("--search <term>", "search skills by keyword")
  .option("--owner <address>", "filter by owner address")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runSkillList({ category: opts.category, search: opts.search, owner: opts.owner, json: opts.json });
  });

skillCmd
  .command("create")
  .description("List a new skill on the marketplace")
  .requiredOption("--name <name>", "skill name")
  .requiredOption("--description <text>", "skill description")
  .requiredOption("--price <amount>", "price in uclaw")
  .option("--denom <denom>", "payment denom (default: uclaw)")
  .action(async (opts) => {
    await runSkillCreate({ name: opts.name, description: opts.description, price: opts.price, denom: opts.denom });
  });

skillCmd
  .command("purchase")
  .description("Purchase access to a marketplace skill")
  .requiredOption("--skill-id <id>", "skill ID to purchase", parseInt)
  .action(async (opts) => {
    await runSkillPurchase({ skillId: opts.skillId });
  });

// ---------------------------------------------------------------------------
// clawd clawhub
// ---------------------------------------------------------------------------
const clawhubCmd = program.command("clawhub").description("ClawHub skill registry — validate, search, install, publish skills");

clawhubCmd
  .command("validate")
  .description("Validate a skill directory for publish readiness")
  .argument("<path>", "path to the skill directory")
  .option("--json", "output JSON")
  .action(async (path, opts) => {
    await runClawHubValidate({ path, json: opts.json });
  });

clawhubCmd
  .command("search")
  .description("Search skills in the ClawHub registry")
  .argument("<query>", "search query")
  .option("--json", "output JSON")
  .action(async (query, opts) => {
    await runClawHubSearch({ query, json: opts.json });
  });

clawhubCmd
  .command("install")
  .description("Install a skill from the ClawHub registry")
  .argument("<name>", "skill name to install")
  .option("--version <version>", "install a specific version")
  .option("--dir <dir>", "target skills directory")
  .action(async (name, opts) => {
    await runClawHubInstall({ name, version: opts.version, dir: opts.dir });
  });

clawhubCmd
  .command("publish")
  .description("Validate and publish a skill to the ClawHub registry")
  .argument("<path>", "path to the skill directory")
  .action(async (path) => {
    await runClawHubPublish({ path });
  });

clawhubCmd
  .command("list")
  .description("List locally installed skills")
  .option("--dir <dir>", "skills directory to list")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runClawHubList({ dir: opts.dir, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd escrow
// ---------------------------------------------------------------------------
const escrowCmd = program.command("escrow").description("Manage marketplace escrows");

escrowCmd
  .command("list")
  .description("List escrows by buyer or seller address")
  .option("--buyer <address>", "filter by buyer address")
  .option("--seller <address>", "filter by seller address")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runEscrowList({ buyer: opts.buyer, seller: opts.seller, json: opts.json });
  });

escrowCmd
  .command("create")
  .description("Create a new escrow with a seller")
  .requiredOption("--seller <address>", "seller address")
  .requiredOption("--amount <uclaw>", "escrow amount in uclaw")
  .option("--milestones <json>", "milestones JSON array [{\"description\":\"...\",\"amount\":\"...\"}]")
  .option("--denom <denom>", "payment denom (default: uclaw)")
  .action(async (opts) => {
    await runEscrowCreate({ seller: opts.seller, amount: opts.amount, milestones: opts.milestones, denom: opts.denom });
  });

escrowCmd
  .command("status")
  .description("Query a single escrow by ID")
  .requiredOption("--escrow-id <id>", "escrow ID")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runEscrowStatus({ escrowId: opts.escrowId, json: opts.json });
  });

escrowCmd
  .command("complete")
  .description("Complete an escrow or milestone (release funds)")
  .requiredOption("--escrow-id <id>", "escrow ID")
  .option("--milestone-index <index>", "complete a specific milestone instead of the whole escrow", parseInt)
  .action(async (opts) => {
    await runEscrowComplete({ escrowId: opts.escrowId, milestoneIndex: opts.milestoneIndex });
  });

escrowCmd
  .command("dispute")
  .description("Dispute an escrow")
  .requiredOption("--escrow-id <id>", "escrow ID")
  .requiredOption("--reason <text>", "reason for dispute")
  .action(async (opts) => {
    await runEscrowDispute({ escrowId: opts.escrowId, reason: opts.reason });
  });

// ---------------------------------------------------------------------------
// clawd reputation
// ---------------------------------------------------------------------------
const repCmd = program.command("reputation").description("Agent reputation and trust");

repCmd
  .command("query")
  .description("Query reputation for an agent address")
  .argument("<address>", "agent bech32 address")
  .option("--json", "output JSON")
  .action(async (address, opts) => {
    await runReputationQuery({ address, json: opts.json });
  });

repCmd
  .command("leaderboard")
  .description("Show top rated agents")
  .option("--limit <n>", "number of agents to show", parseInt)
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runReputationLeaderboard({ limit: opts.limit, json: opts.json });
  });

repCmd
  .command("rate")
  .description("Rate an agent (1-5)")
  .argument("<address>", "agent bech32 address")
  .requiredOption("--rating <n>", "rating 1-5", parseInt)
  .option("--comment <text>", "optional comment")
  .action(async (address, opts) => {
    await runReputationRate({ address, rating: opts.rating, comment: opts.comment });
  });

repCmd
  .command("endorse")
  .description("Endorse an agent")
  .argument("<address>", "agent bech32 address")
  .option("--reason <text>", "endorsement reason")
  .action(async (address, opts) => {
    await runReputationEndorse({ address, reason: opts.reason });
  });

// ---------------------------------------------------------------------------
// clawd intent
// ---------------------------------------------------------------------------
const intentCmd = program.command("intent").description("Multi-agent intent coordination");

intentCmd
  .command("submit")
  .description("Submit a coordination intent")
  .requiredOption("--description <text>", "intent description")
  .option("--required-capabilities <caps>", "required agent capabilities")
  .option("--max-budget <amount>", "maximum budget in uclaw")
  .option("--deadline <blocks>", "deadline in blocks from now", parseInt)
  .action(async (opts) => {
    await runIntentSubmit({
      description: opts.description,
      requiredCapabilities: opts.requiredCapabilities,
      maxBudget: opts.maxBudget,
      deadline: opts.deadline,
    });
  });

intentCmd
  .command("respond <intentId>")
  .description("Respond to a coordination intent")
  .requiredOption("--proposed-budget <amount>", "proposed budget in uclaw")
  .option("--message <text>", "optional response message")
  .action(async (intentId, opts) => {
    await runIntentRespond({
      intentId: parseInt(intentId, 10),
      proposedBudget: opts.proposedBudget,
      message: opts.message,
    });
  });

intentCmd
  .command("finalize <intentId>")
  .description("Finalize an intent and select a respondent")
  .requiredOption("--selected-agent <address>", "selected agent bech32 address")
  .action(async (intentId, opts) => {
    await runIntentFinalize({
      intentId: parseInt(intentId, 10),
      selectedAgent: opts.selectedAgent,
    });
  });

intentCmd
  .command("list")
  .description("List coordination intents")
  .option("--address <addr>", "filter by creator address")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runIntentList({ address: opts.address, json: opts.json });
  });

intentCmd
  .command("query <intentId>")
  .description("Query a specific intent by ID")
  .option("--json", "output JSON")
  .action(async (intentId, opts) => {
    await runIntentQuery({ intentId: parseInt(intentId, 10), json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd task
// ---------------------------------------------------------------------------
const taskCmd = program.command("task").description("Manage agent task delegation");

taskCmd
  .command("delegate")
  .description("Delegate a task to another agent")
  .requiredOption("--assignee <address>", "assignee bech32 address")
  .requiredOption("--description <text>", "task description")
  .option("--requirements <text>", "task requirements")
  .option("--skill-id <id>", "required skill ID", parseInt)
  .option("--budget <amount>", "task budget in uclaw")
  .option("--deadline-blocks <n>", "deadline in blocks from now", parseInt)
  .action(async (opts) => {
    await runTaskDelegate({
      assignee: opts.assignee,
      description: opts.description,
      requirements: opts.requirements,
      skillId: opts.skillId,
      budget: opts.budget,
      deadlineBlocks: opts.deadlineBlocks,
    });
  });

taskCmd
  .command("status")
  .description("Query task status and details")
  .requiredOption("--task-id <id>", "task ID", parseInt)
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runTaskStatus({ taskId: opts.taskId, json: opts.json });
  });

taskCmd
  .command("accept")
  .description("Accept a delegated task")
  .requiredOption("--task-id <id>", "task ID to accept", parseInt)
  .action(async (opts) => {
    await runTaskAccept({ taskId: opts.taskId });
  });

taskCmd
  .command("complete")
  .description("Complete a task with result")
  .requiredOption("--task-id <id>", "task ID", parseInt)
  .requiredOption("--result <text>", "task result/output")
  .action(async (opts) => {
    await runTaskComplete({ taskId: opts.taskId, result: opts.result });
  });

// ---------------------------------------------------------------------------
// clawd governance
// ---------------------------------------------------------------------------
const govCmd = program.command("governance").description("On-chain governance proposals and voting");

govCmd
  .command("proposals")
  .description("List all governance proposals")
  .option("--json", "output JSON")
  .option("--status <status>", "filter by proposal status")
  .action(async (opts) => {
    await runGovernanceProposals({ json: opts.json, status: opts.status });
  });

govCmd
  .command("proposal")
  .description("Get details for a single proposal")
  .argument("<id>", "proposal ID", parseInt)
  .option("--json", "output JSON")
  .action(async (id, opts) => {
    await runGovernanceProposal({ proposalId: id, json: opts.json });
  });

govCmd
  .command("submit-proposal")
  .description("Submit a new text proposal")
  .requiredOption("--title <title>", "proposal title")
  .requiredOption("--description <text>", "proposal description")
  .requiredOption("--deposit <amount>", "initial deposit in uclaw")
  .action(async (opts) => {
    await runGovernanceSubmitProposal({
      title: opts.title,
      description: opts.description,
      deposit: opts.deposit,
    });
  });

govCmd
  .command("vote")
  .description("Vote on a proposal (yes/no/abstain/no_with_veto)")
  .requiredOption("--proposal-id <id>", "proposal ID", parseInt)
  .requiredOption("--option <option>", "vote option: yes, no, abstain, no_with_veto")
  .action(async (opts) => {
    await runGovernanceVote({ proposalId: opts.proposalId, option: opts.option });
  });

govCmd
  .command("params")
  .description("Query governance module parameters")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runGovernanceParams({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd oracle
// ---------------------------------------------------------------------------
const oracleCmd = program.command("oracle").description("Terra-forked oracle: exchange rates, tobin taxes, votes");

oracleCmd
  .command("price")
  .description("Query exchange rate for a single denom")
  .argument("<denom>", "denom (e.g. uusd)")
  .option("--json", "output JSON")
  .action(async (denom, opts) => {
    await runOraclePrice({ denom, json: opts.json });
  });

oracleCmd
  .command("prices")
  .description("List all exchange rates")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runOraclePrices({ json: opts.json });
  });

oracleCmd
  .command("actives")
  .description("List active oracle denoms")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runOracleActives({ json: opts.json });
  });

oracleCmd
  .command("vote-targets")
  .description("List oracle vote target denoms")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runOracleVoteTargets({ json: opts.json });
  });

oracleCmd
  .command("params")
  .description("Query oracle module parameters")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runOracleParams({ json: opts.json });
  });

oracleCmd
  .command("feeder")
  .description("Query feeder delegation for a validator")
  .argument("<validator>", "validator operator address")
  .option("--json", "output JSON")
  .action(async (validator, opts) => {
    await runOracleFeeder({ validator, json: opts.json });
  });

oracleCmd
  .command("miss")
  .description("Query miss counter for a validator")
  .argument("<validator>", "validator operator address")
  .option("--json", "output JSON")
  .action(async (validator, opts) => {
    await runOracleMiss({ validator, json: opts.json });
  });

oracleCmd
  .command("prevote")
  .description("Query aggregate prevote for a validator")
  .argument("<validator>", "validator operator address")
  .option("--json", "output JSON")
  .action(async (validator, opts) => {
    await runOraclePrevote({ validator, json: opts.json });
  });

oracleCmd
  .command("prevotes")
  .description("List all aggregate prevotes")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runOraclePrevotes({ json: opts.json });
  });

oracleCmd
  .command("vote")
  .description("Query aggregate vote for a validator")
  .argument("<validator>", "validator operator address")
  .option("--json", "output JSON")
  .action(async (validator, opts) => {
    await runOracleVote({ validator, json: opts.json });
  });

oracleCmd
  .command("votes")
  .description("List all aggregate votes")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runOracleVotes({ json: opts.json });
  });

oracleCmd
  .command("tobin-tax")
  .description("Query tobin tax for a denom")
  .argument("<denom>", "denom (e.g. uusd)")
  .option("--json", "output JSON")
  .action(async (denom, opts) => {
    await runOracleTobinTax({ denom, json: opts.json });
  });

oracleCmd
  .command("tobin-taxes")
  .description("List all tobin taxes")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runOracleTobinTaxes({ json: opts.json });
  });

oracleCmd
  .command("setup")
  .description("Interactive oracle feeder setup wizard")
  .option("--validator <address>", "validator operator address (clawvaloper1...)")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runOracleSetup({ validator: opts.validator, json: opts.json });
  });

oracleCmd
  .command("delegate-feed")
  .description("Delegate feed consent to a feeder address")
  .argument("<validator>", "validator operator address (clawvaloper1...)")
  .argument("<feeder>", "feeder address (claw1...)")
  .option("--json", "output JSON")
  .action(async (validator, feeder, opts) => {
    await runOracleDelegateFeed({ validator, feeder, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd messaging (alias: msg)
// ---------------------------------------------------------------------------
const msgCmd = program.command("messaging").alias("msg").description("P2P encrypted messaging");

msgCmd
  .command("send")
  .description("Send an encrypted message to another agent")
  .requiredOption("--recipient <address>", "recipient bech32 address")
  .requiredOption("--content <text>", "message content")
  .option("--encrypt", "encrypt the message content")
  .action(async (opts) => {
    await runMessagingSend({ recipient: opts.recipient, content: opts.content, encrypt: opts.encrypt });
  });

msgCmd
  .command("inbox")
  .description("List received messages")
  .option("--json", "output JSON")
  .option("--limit <n>", "max messages to show", parseInt)
  .action(async (opts) => {
    await runMessagingInbox({ json: opts.json, limit: opts.limit });
  });

msgCmd
  .command("sent")
  .description("List sent messages")
  .option("--json", "output JSON")
  .option("--limit <n>", "max messages to show", parseInt)
  .action(async (opts) => {
    await runMessagingSent({ json: opts.json, limit: opts.limit });
  });

msgCmd
  .command("read <messageId>")
  .description("Read a specific message by ID")
  .option("--json", "output JSON")
  .action(async (messageId: string, opts) => {
    await runMessagingRead({ messageId, json: opts.json });
  });

msgCmd
  .command("ack <messageId>")
  .description("Acknowledge receipt of a message")
  .action(async (messageId: string) => {
    await runMessagingAck({ messageId });
  });

// ---------------------------------------------------------------------------
// clawd privacy — ZK privacy module commands
// ---------------------------------------------------------------------------

const privacyCmd = program
  .command("privacy")
  .description("ZK privacy module — shield, unshield, tree stats");

privacyCmd
  .command("shield")
  .description("Shield tokens into the private pool")
  .requiredOption("-a, --amount <uclaw>", "amount in uclaw to shield")
  .action(async (opts) => {
    await runPrivacyShield({ amount: opts.amount });
  });

privacyCmd
  .command("unshield")
  .description("Unshield tokens from the private pool (requires ZK proof)")
  .requiredOption("-c, --commitment <hex>", "commitment to unshield")
  .requiredOption("-n, --nullifier <hex>", "nullifier for the commitment")
  .requiredOption("-p, --proof <hex>", "ZK proof (hex-encoded)")
  .requiredOption("-a, --amount <uclaw>", "amount in uclaw to unshield")
  .requiredOption("-r, --root <hex>", "Merkle root the proof was generated against")
  .option("--recipient <address>", "recipient address (defaults to own address)")
  .action(async (opts) => {
    await runPrivacyUnshield({
      commitment: opts.commitment,
      nullifier: opts.nullifier,
      proof: opts.proof,
      amount: opts.amount,
      root: opts.root,
      recipient: opts.recipient,
    });
  });

privacyCmd
  .command("tree-stats")
  .description("Show Merkle tree statistics")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runPrivacyTreeStats({ json: opts.json });
  });

privacyCmd
  .command("nullifier-check <nullifier>")
  .description("Check if a nullifier has been spent")
  .option("--json", "output as JSON")
  .action(async (nullifier: string, opts) => {
    await runPrivacyNullifierCheck({ nullifier, json: opts.json });
  });

privacyCmd
  .command("merkle-root")
  .description("Show current Merkle root")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runPrivacyMerkleRoot({ json: opts.json });
  });

privacyCmd
  .command("root-history")
  .description("Show Merkle root history")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runPrivacyRootHistory({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd staking — proof-of-stake delegation and rewards
// ---------------------------------------------------------------------------

const stakingCmd = program
  .command("staking")
  .description("Proof-of-stake delegation, rewards, and validator queries");

stakingCmd
  .command("validators")
  .description("List validators")
  .option("--status <status>", "filter by status (BOND_STATUS_BONDED, BOND_STATUS_UNBONDED)", "BOND_STATUS_BONDED")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runStakingValidators({ status: opts.status, json: opts.json });
  });

stakingCmd
  .command("delegations")
  .description("List your delegations")
  .option("--address <address>", "delegator address (defaults to own)")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runStakingDelegations({ address: opts.address, json: opts.json });
  });

stakingCmd
  .command("delegate")
  .description("Delegate tokens to a validator")
  .requiredOption("-v, --validator <valoper>", "validator operator address")
  .requiredOption("-a, --amount <uclaw>", "amount in uclaw to delegate")
  .action(async (opts) => {
    await runStakingDelegate({ validator: opts.validator, amount: opts.amount });
  });

stakingCmd
  .command("undelegate")
  .description("Undelegate tokens from a validator")
  .requiredOption("-v, --validator <valoper>", "validator operator address")
  .requiredOption("-a, --amount <uclaw>", "amount in uclaw to undelegate")
  .action(async (opts) => {
    await runStakingUndelegate({ validator: opts.validator, amount: opts.amount });
  });

stakingCmd
  .command("rewards")
  .description("Show pending staking rewards")
  .option("--address <address>", "delegator address (defaults to own)")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runStakingRewards({ address: opts.address, json: opts.json });
  });

stakingCmd
  .command("claim-rewards")
  .description("Claim all pending staking rewards")
  .option("-v, --validator <valoper>", "claim from specific validator (default: all)")
  .action(async (opts) => {
    await runStakingClaimRewards({ validator: opts.validator });
  });

// ---------------------------------------------------------------------------
// clawd negotiate
// ---------------------------------------------------------------------------
const negotiateCmd = program.command("negotiate").description("Agent-to-agent negotiation protocol");

negotiateCmd
  .command("propose")
  .description("Start a negotiation with another agent")
  .requiredOption("--target-agent <address>", "counterparty agent bech32 address")
  .requiredOption("--task-description <text>", "description of the task to negotiate")
  .requiredOption("--proposed-budget <amount>", "proposed budget in uclaw")
  .option("--proposed-deadline <blocks>", "proposed deadline in blocks", parseInt)
  .action(async (opts) => {
    await runNegotiatePropose({
      targetAgent: opts.targetAgent,
      taskDescription: opts.taskDescription,
      proposedBudget: opts.proposedBudget,
      proposedDeadline: opts.proposedDeadline,
    });
  });

negotiateCmd
  .command("counter <negotiationId>")
  .description("Submit a counter-proposal on an existing negotiation")
  .requiredOption("--counter-budget <amount>", "counter-proposed budget in uclaw")
  .option("--counter-deadline <blocks>", "counter-proposed deadline in blocks", parseInt)
  .option("--message <text>", "optional message to the other party")
  .action(async (negotiationId, opts) => {
    await runNegotiateCounter({
      negotiationId: parseInt(negotiationId, 10),
      counterBudget: opts.counterBudget,
      counterDeadline: opts.counterDeadline,
      message: opts.message,
    });
  });

negotiateCmd
  .command("accept <negotiationId>")
  .description("Accept a negotiation (auto-creates a task)")
  .action(async (negotiationId) => {
    await runNegotiateAccept({
      negotiationId: parseInt(negotiationId, 10),
    });
  });

negotiateCmd
  .command("list")
  .description("List active negotiations")
  .option("--address <address>", "filter by agent bech32 address")
  .option("--json", "output JSON")
  .action(async (opts) => {
    await runNegotiateList({ address: opts.address, json: opts.json });
  });

negotiateCmd
  .command("reject <negotiationId>")
  .description("Reject a negotiation")
  .option("--reason <text>", "optional rejection reason")
  .action(async (negotiationId, opts) => {
    await runNegotiateReject({
      negotiationId: parseInt(negotiationId, 10),
      reason: opts.reason,
    });
  });

// ---------------------------------------------------------------------------
// clawd ibc — IBC cross-chain queries
// ---------------------------------------------------------------------------

const ibcCmd = program
  .command("ibc")
  .description("IBC cross-chain queries — channels, connections, clients, remote agents");

ibcCmd
  .command("channels")
  .description("List IBC channels")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runIBCChannels({ json: opts.json });
  });

ibcCmd
  .command("connections")
  .description("List IBC connections")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runIBCConnections({ json: opts.json });
  });

ibcCmd
  .command("clients")
  .description("List IBC light clients")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runIBCClients({ json: opts.json });
  });

ibcCmd
  .command("remote-agents")
  .description("List agents discovered via IBC")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runIBCRemoteAgents({ json: opts.json });
  });

ibcCmd
  .command("denoms")
  .description("List IBC denom traces")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runIBCDenoms({ json: opts.json });
  });

ibcCmd
  .command("transfer")
  .description("Send an IBC token transfer")
  .requiredOption("-c, --channel <channel>", "source IBC channel (e.g. channel-0)")
  .requiredOption("-a, --amount <amount>", "amount to transfer")
  .requiredOption("-r, --receiver <address>", "receiver address on destination chain")
  .option("-d, --denom <denom>", "token denomination (default: uclaw)")
  .option("-m, --memo <memo>", "optional memo")
  .option("--timeout-height <height>", "timeout block height")
  .action(async (opts) => {
    await runIBCTransfer({
      channel: opts.channel,
      amount: opts.amount,
      receiver: opts.receiver,
      denom: opts.denom,
      memo: opts.memo,
      timeoutHeight: opts.timeoutHeight,
    });
  });

ibcCmd
  .command("delegate-task")
  .description("Delegate a task to a remote agent via IBC")
  .requiredOption("-c, --channel <channel>", "source IBC channel (e.g. channel-0)")
  .requiredOption("--assignee <address>", "assignee agent address on destination chain")
  .requiredOption("--description <desc>", "task description")
  .requiredOption("-b, --budget <amount>", "task budget (e.g. 1000000uclaw)")
  .option("--deadline-blocks <blocks>", "deadline in blocks (default: 200)")
  .option("--requirements <reqs>", "task requirements")
  .action(async (opts) => {
    await runIBCDelegateTask({
      channel: opts.channel,
      assignee: opts.assignee,
      description: opts.description,
      budget: opts.budget,
      deadlineBlocks: opts.deadlineBlocks,
      requirements: opts.requirements,
    });
  });

ibcCmd
  .command("shield")
  .description("Send tokens via IBC with auto-shield on the destination chain")
  .requiredOption("-c, --channel <channel>", "source IBC channel (e.g. channel-0)")
  .requiredOption("-a, --amount <amount>", "amount to transfer and auto-shield")
  .requiredOption("-r, --receiver <address>", "receiver address on destination chain")
  .option("-d, --denom <denom>", "token denomination (default: uclaw)")
  .action(async (opts) => {
    await runIBCShield({
      channel: opts.channel,
      amount: opts.amount,
      receiver: opts.receiver,
      denom: opts.denom,
    });
  });

ibcCmd
  .command("unshield")
  .description("Unshield tokens on a remote chain via IBC")
  .requiredOption("-c, --channel <channel>", "source IBC channel (e.g. channel-0)")
  .requiredOption("-a, --amount <amount>", "amount to unshield")
  .requiredOption("-p, --proof <hex>", "ZK proof (hex-encoded)")
  .requiredOption("-n, --nullifier <hex>", "nullifier (hex-encoded)")
  .requiredOption("-r, --receiver <address>", "receiver address on destination chain")
  .option("-d, --denom <denom>", "token denomination (default: uclaw)")
  .action(async (opts) => {
    await runIBCUnshield({
      channel: opts.channel,
      amount: opts.amount,
      proof: opts.proof,
      nullifier: opts.nullifier,
      receiver: opts.receiver,
      denom: opts.denom,
    });
  });

// ---------------------------------------------------------------------------
// clawd query -- standard chain queries (block, tx, account, supply, validators)
// ---------------------------------------------------------------------------

const queryCmd = program
  .command("query")
  .description("Standard chain queries (block, tx, account, supply, validators)");

queryCmd
  .command("block")
  .description("Query a block by height (latest if omitted)")
  .argument("[height]", "block height to query")
  .option("--json", "output as JSON")
  .action(async (height: string | undefined, opts: { json?: boolean }) => {
    await runQueryBlock({ height: height ?? undefined, json: opts.json });
  });

queryCmd
  .command("tx")
  .description("Query a transaction by hash")
  .argument("<hash>", "transaction hash")
  .option("--json", "output as JSON")
  .action(async (hash: string, opts: { json?: boolean }) => {
    await runQueryTx({ hash, json: opts.json });
  });

queryCmd
  .command("account")
  .description("Query account info, balances, delegations, agent status, and reputation")
  .argument("<address>", "bech32 account address")
  .option("--json", "output as JSON")
  .action(async (address: string, opts: { json?: boolean }) => {
    await runQueryAccount({ address, json: opts.json });
  });

queryCmd
  .command("supply")
  .description("Query total supply, staking pool, inflation, and community pool")
  .option("--json", "output as JSON")
  .action(async (opts: { json?: boolean }) => {
    await runQuerySupply({ json: opts.json });
  });

queryCmd
  .command("validators")
  .description("List bonded validators with rank, tokens, and commission")
  .option("--json", "output as JSON")
  .action(async (opts: { json?: boolean }) => {
    await runQueryValidators({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd wasm — CosmWasm contract queries
// ---------------------------------------------------------------------------

const wasmCmd = program
  .command("wasm")
  .description("CosmWasm smart contract queries");

wasmCmd
  .command("list-code")
  .description("List uploaded contract codes")
  .option("--json", "output as JSON")
  .action(async (opts: { json?: boolean }) => {
    await runWasmListCode({ json: opts.json });
  });

wasmCmd
  .command("code-info")
  .description("Get details for an uploaded code ID")
  .argument("<codeId>", "code ID")
  .option("--json", "output as JSON")
  .action(async (codeId: string, opts: { json?: boolean }) => {
    await runWasmCodeInfo({ codeId, json: opts.json });
  });

wasmCmd
  .command("list-contracts")
  .description("List contracts instantiated from a code ID")
  .argument("<codeId>", "code ID")
  .option("--json", "output as JSON")
  .action(async (codeId: string, opts: { json?: boolean }) => {
    await runWasmListContracts({ codeId, json: opts.json });
  });

wasmCmd
  .command("contract")
  .description("Get contract info (address, code_id, creator, admin, label)")
  .argument("<address>", "contract bech32 address")
  .option("--json", "output as JSON")
  .action(async (address: string, opts: { json?: boolean }) => {
    await runWasmContract({ address, json: opts.json });
  });

wasmCmd
  .command("query")
  .description("Query contract state with a JSON message")
  .argument("<address>", "contract bech32 address")
  .argument("<queryJson>", "JSON query message (e.g. '{\"balance\":{\"address\":\"claw1...\"}}')")
  .option("--json", "output as JSON")
  .action(async (address: string, queryJson: string, opts: { json?: boolean }) => {
    await runWasmQuery({ address, queryJson, json: opts.json });
  });

wasmCmd
  .command("history")
  .description("Show contract code migration history")
  .argument("<address>", "contract bech32 address")
  .option("--json", "output as JSON")
  .action(async (address: string, opts: { json?: boolean }) => {
    await runWasmHistory({ address, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd dex — DEX / AMM pool queries, swap execution, and liquidity management
// ---------------------------------------------------------------------------

const dexCmd = program
  .command("dex")
  .description("DEX / AMM pool queries, swap execution, and liquidity management");

dexCmd
  .command("pools")
  .description("List all trading pools from the factory contract")
  .requiredOption("--factory <address>", "factory contract address")
  .option("--limit <n>", "max pools to return")
  .option("--json", "output as JSON")
  .action(async (opts: { factory: string; limit?: string; json?: boolean }) => {
    await runDexPools({ factory: opts.factory, limit: opts.limit, json: opts.json });
  });

dexCmd
  .command("pool")
  .description("Get pool details (reserves, LP supply, fee rate, pool type)")
  .argument("<pair-addr>", "pair contract address")
  .option("--json", "output as JSON")
  .action(async (pairAddr: string, opts: { json?: boolean }) => {
    await runDexPool({ pairAddr, json: opts.json });
  });

dexCmd
  .command("price")
  .description("Get current price by simulating 1-unit swaps in both directions")
  .argument("<pair-addr>", "pair contract address")
  .option("--json", "output as JSON")
  .action(async (pairAddr: string, opts: { json?: boolean }) => {
    await runDexPrice({ pairAddr, json: opts.json });
  });

dexCmd
  .command("swap")
  .description("Execute a token swap on a pair contract")
  .requiredOption("--pair <address>", "pair contract address")
  .requiredOption("--offer-asset <denom>", "denom of the token to offer (native denom or CW20 contract address)")
  .requiredOption("--amount <amount>", "amount of offer asset (in smallest unit)")
  .option("--max-spread <percent>", "maximum spread tolerance in percent", "0.5")
  .option("--from <key>", "signing key name or address (uses local mnemonic)")
  .option("--json", "output as JSON")
  .action(async (opts: {
    pair: string;
    offerAsset: string;
    amount: string;
    maxSpread?: string;
    from?: string;
    json?: boolean;
  }) => {
    await runDexSwap({
      pair: opts.pair,
      offerAsset: opts.offerAsset,
      amount: opts.amount,
      maxSpread: opts.maxSpread,
      from: opts.from,
      json: opts.json,
    });
  });

dexCmd
  .command("add-liquidity")
  .description("Provide liquidity to a pool")
  .requiredOption("--pair <address>", "pair contract address")
  .requiredOption("--assets <denom1:amount1,denom2:amount2>", "assets to provide (e.g. uclaw:1000000,uusdc:500000)")
  .option("--slippage <percent>", "slippage tolerance in percent", "1")
  .option("--from <key>", "signing key name or address (uses local mnemonic)")
  .option("--json", "output as JSON")
  .action(async (opts: {
    pair: string;
    assets: string;
    slippage?: string;
    from?: string;
    json?: boolean;
  }) => {
    await runDexAddLiquidity({
      pair: opts.pair,
      assets: opts.assets,
      slippage: opts.slippage,
      from: opts.from,
      json: opts.json,
    });
  });

dexCmd
  .command("remove-liquidity")
  .description("Withdraw liquidity from a pool by burning LP tokens")
  .requiredOption("--pair <address>", "pair contract address")
  .requiredOption("--lp-amount <amount>", "amount of LP tokens to burn")
  .option("--from <key>", "signing key name or address (uses local mnemonic)")
  .option("--json", "output as JSON")
  .action(async (opts: {
    pair: string;
    lpAmount: string;
    from?: string;
    json?: boolean;
  }) => {
    await runDexRemoveLiquidity({
      pair: opts.pair,
      lpAmount: opts.lpAmount,
      from: opts.from,
      json: opts.json,
    });
  });

dexCmd
  .command("simulate")
  .description("Simulate a swap on a pair contract (dry-run)")
  .argument("<pair-addr>", "pair contract address")
  .option("--offer-denom <denom>", "native token denom to offer", "uclaw")
  .option("--offer-amount <amount>", "amount to offer", "1000000")
  .option("--offer-contract <addr>", "CW20 contract address (instead of native denom)")
  .option("--reverse", "reverse simulation (compute required offer for desired output)")
  .option("--json", "output as JSON")
  .action(async (pairAddr: string, opts: {
    offerDenom: string;
    offerAmount: string;
    offerContract?: string;
    reverse?: boolean;
    json?: boolean;
  }) => {
    await runDexSimulate({
      pairAddr,
      offerDenom: opts.offerDenom,
      offerAmount: opts.offerAmount,
      offerContract: opts.offerContract,
      reverse: opts.reverse,
      json: opts.json,
    });
  });

dexCmd
  .command("config")
  .description("Save or show DEX contract addresses (factory, router)")
  .option("--factory <address>", "set factory contract address")
  .option("--router <address>", "set router contract address")
  .option("--json", "output as JSON")
  .action(async (opts: { factory?: string; router?: string; json?: boolean }) => {
    await runDexConfig({ factory: opts.factory, router: opts.router, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd config — configuration management
// ---------------------------------------------------------------------------

const configCmd = program
  .command("config")
  .description("Manage clawd configuration (show, set, get, reset, validate, export, path)");

configCmd
  .command("show")
  .description("Display current configuration (sensitive values redacted)")
  .option("--json", "output as JSON")
  .action(async (opts: { json?: boolean }) => {
    await runConfigShow({ json: opts.json });
  });

configCmd
  .command("set")
  .description("Set a config value (e.g. clawd config set rpcUrl http://localhost:26657)")
  .argument("<key>", "config key to set")
  .argument("<value>", "value to set")
  .option("--json", "output as JSON")
  .action(async (key: string, value: string, opts: { json?: boolean }) => {
    await runConfigSet({ key, value, json: opts.json });
  });

configCmd
  .command("get")
  .description("Get a specific config value")
  .argument("<key>", "config key to read")
  .option("--json", "output as JSON")
  .action(async (key: string, opts: { json?: boolean }) => {
    await runConfigGet({ key, json: opts.json });
  });

configCmd
  .command("reset")
  .description("Reset configuration to defaults")
  .option("--confirm", "confirm the reset operation")
  .option("--json", "output as JSON")
  .action(async (opts: { confirm?: boolean; json?: boolean }) => {
    await runConfigReset({ confirm: opts.confirm, json: opts.json });
  });

configCmd
  .command("validate")
  .description("Validate current config (check RPC connectivity, denom, prefix)")
  .option("--json", "output as JSON")
  .action(async (opts: { json?: boolean }) => {
    await runConfigValidate({ json: opts.json });
  });

configCmd
  .command("export")
  .description("Export config as environment variables (KEY=VALUE format)")
  .option("--json", "output as JSON")
  .action(async (opts: { json?: boolean }) => {
    await runConfigExport({ json: opts.json });
  });

configCmd
  .command("path")
  .description("Show config file location")
  .option("--json", "output as JSON")
  .action(async (opts: { json?: boolean }) => {
    await runConfigPath({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd network — network switching and management
// ---------------------------------------------------------------------------

const networkCmd = program
  .command("network")
  .description("Manage network profiles (list, switch, add, remove, status)");

networkCmd
  .command("list")
  .description("List available preset and custom networks")
  .option("--json", "output as JSON")
  .action(async (opts: { json?: boolean }) => {
    await runNetworkList({ json: opts.json });
  });

networkCmd
  .command("switch")
  .description("Switch to a preset or custom network")
  .argument("<name>", "network name (mainnet, testnet, devnet, local, or custom)")
  .option("--json", "output as JSON")
  .action(async (name: string, opts: { json?: boolean }) => {
    await runNetworkSwitch({ name, json: opts.json });
  });

networkCmd
  .command("add")
  .description("Add a custom network profile")
  .argument("<name>", "network name")
  .requiredOption("--rpc <url>", "RPC endpoint URL")
  .requiredOption("--rest <url>", "REST/LCD endpoint URL")
  .requiredOption("--chain-id <id>", "chain ID")
  .option("--json", "output as JSON")
  .action(async (name: string, opts: { rpc: string; rest: string; chainId: string; json?: boolean }) => {
    await runNetworkAdd({ name, rpc: opts.rpc, rest: opts.rest, chainId: opts.chainId, json: opts.json });
  });

networkCmd
  .command("remove")
  .description("Remove a custom network profile")
  .argument("<name>", "network name to remove")
  .option("--json", "output as JSON")
  .action(async (name: string, opts: { json?: boolean }) => {
    await runNetworkRemove({ name, json: opts.json });
  });

networkCmd
  .command("status")
  .description("Show current network status (block height, peers, sync)")
  .option("--json", "output as JSON")
  .action(async (opts: { json?: boolean }) => {
    await runNetworkStatus({ json: opts.json });
  });

// clawd monitor
const monitorCmd = program
  .command("monitor")
  .description("Real-time chain monitoring with color-coded health indicators")
  .option("--json", "output machine-readable JSON (one object per refresh)")
  .option("--interval <seconds>", "seconds between refreshes (default: 5)", parseInt)
  .action(async (opts) => {
    await runMonitor({ json: opts.json, interval: opts.interval });
  });

monitorCmd
  .command("validators")
  .description("Track validator set changes (active, jailed, tombstoned)")
  .option("--json", "output machine-readable JSON")
  .option("--interval <seconds>", "seconds between refreshes (default: 5)", parseInt)
  .action(async (opts) => {
    await runMonitorValidators({ json: opts.json, interval: opts.interval });
  });

monitorCmd
  .command("blocks")
  .description("Watch recent blocks (height, proposer, tx count, gas)")
  .option("--count <n>", "number of blocks to show (default: 10)", parseInt)
  .option("--json", "output machine-readable JSON")
  .option("--interval <seconds>", "seconds between refreshes (default: 5)", parseInt)
  .action(async (opts) => {
    await runMonitorBlocks({ count: opts.count, json: opts.json, interval: opts.interval });
  });

monitorCmd
  .command("agents")
  .description("Watch agent activity (registrations, heartbeats, tasks)")
  .option("--json", "output machine-readable JSON")
  .option("--interval <seconds>", "seconds between refreshes (default: 5)", parseInt)
  .action(async (opts) => {
    await runMonitorAgents({ json: opts.json, interval: opts.interval });
  });

monitorCmd
  .command("dex")
  .description("Watch DEX activity (pools, volume, swaps, liquidity)")
  .option("--json", "output machine-readable JSON")
  .option("--interval <seconds>", "seconds between refreshes (default: 5)", parseInt)
  .action(async (opts) => {
    await runMonitorDex({ json: opts.json, interval: opts.interval });
  });

// clawd alerts
const alertsCmd = program
  .command("alerts")
  .description("Configure and manage alert rules for chain events");

alertsCmd
  .command("list")
  .description("Show configured alert rules")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runAlertsList({ json: opts.json });
  });

alertsCmd
  .command("add")
  .description("Add an alert rule (types: block-delay, validator-jail, large-transfer, agent-slash, pool-imbalance, governance-proposal)")
  .argument("<type>", "alert type")
  .option("--threshold <value>", "threshold value (meaning depends on type)")
  .option("--webhook <url>", "webhook URL for notifications")
  .option("--email <address>", "email address for notifications")
  .option("--json", "output as JSON")
  .action(async (type: string, opts) => {
    await runAlertsAdd(type, {
      threshold: opts.threshold,
      webhook: opts.webhook,
      email: opts.email,
      json: opts.json,
    });
  });

alertsCmd
  .command("remove")
  .description("Remove an alert rule by ID")
  .argument("<id>", "alert rule ID")
  .option("--json", "output as JSON")
  .action(async (id: string, opts) => {
    await runAlertsRemove(id, { json: opts.json });
  });

alertsCmd
  .command("history")
  .description("Show triggered alerts history")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    await runAlertsHistory({ json: opts.json });
  });

alertsCmd
  .command("test")
  .description("Fire a test alert to verify webhook/email delivery")
  .argument("<id>", "alert rule ID to test")
  .option("--json", "output as JSON")
  .action(async (id: string, opts) => {
    await runAlertsTest(id, { json: opts.json });
  });

// clawd completion
program
  .command("completion")
  .description("Generate shell completion scripts (bash, zsh, fish)")
  .argument("<shell>", "shell type: bash, zsh, or fish")
  .action((shell: string) => {
    runCompletion(shell);
  });

// ---------------------------------------------------------------------------
// clawd flux — parallel LLM completion explorer
// ---------------------------------------------------------------------------

const fluxCmd = program
  .command("flux")
  .description("Parallel LLM completion explorer for ClawChain agents");

fluxCmd
  .command("explore <prompt>")
  .description("Explore parallel completions for a prompt")
  .option("--model <name>", "LLM model name", "claude-sonnet-4-20250514")
  .option("--api-key <key>", "Anthropic API key")
  .option("--api-key-env <var>", "Environment variable holding API key", "ANTHROPIC_API_KEY")
  .option("--branches <n>", "Number of parallel completions", "3")
  .option("--depth <n>", "Max conversation depth for follow-ups", "1")
  .option("--temperature <t>", "Sampling temperature", "0.7")
  .option("--max-tokens <n>", "Max tokens per completion", "1024")
  .option("--scorer <type>", "Scoring method: length | keywords | llm", "length")
  .option("--system <msg>", "System prompt")
  .option("--select", "Auto-select best completion and print only that")
  .option("--json", "Output structured JSON")
  .action(async (prompt: string, opts: {
    model?: string;
    apiKey?: string;
    apiKeyEnv?: string;
    branches?: string;
    depth?: string;
    temperature?: string;
    maxTokens?: string;
    scorer?: string;
    system?: string;
    select?: boolean;
    json?: boolean;
  }) => {
    await runFluxExplore({
      prompt,
      model: opts.model,
      apiKey: opts.apiKey,
      apiKeyEnv: opts.apiKeyEnv,
      branches: opts.branches,
      depth: opts.depth,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      scorer: opts.scorer,
      system: opts.system,
      select: opts.select,
      json: opts.json,
    });
  });

fluxCmd
  .command("compare <prompt>")
  .description("Compare completions side-by-side across different models")
  .option("--models <list>", "Comma-separated model names", "claude-sonnet-4-20250514,claude-haiku-4-20250414")
  .option("--api-key <key>", "Anthropic API key")
  .option("--api-key-env <var>", "Environment variable holding API key", "ANTHROPIC_API_KEY")
  .option("--scorer <type>", "Scoring method: length | keywords | llm", "length")
  .option("--temperature <t>", "Sampling temperature", "0.7")
  .option("--max-tokens <n>", "Max tokens per completion", "1024")
  .option("--json", "Output structured JSON")
  .action(async (prompt: string, opts: {
    models?: string;
    apiKey?: string;
    apiKeyEnv?: string;
    scorer?: string;
    temperature?: string;
    maxTokens?: string;
    json?: boolean;
  }) => {
    await runFluxCompare({
      prompt,
      models: opts.models,
      apiKey: opts.apiKey,
      apiKeyEnv: opts.apiKeyEnv,
      scorer: opts.scorer,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      json: opts.json,
    });
  });

fluxCmd
  .command("scorers")
  .description("List available scoring methods")
  .option("--json", "Output structured JSON")
  .action(async (opts: { json?: boolean }) => {
    await runFluxScorers({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd upgrade — version checks, binary management, state migration
// ---------------------------------------------------------------------------

const upgradeCmd = program
  .command("upgrade")
  .description("Manage chain upgrades (check, info, prepare)");

upgradeCmd
  .command("check")
  .description("Check for available chain upgrades")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runUpgradeCheck({ json: opts.json });
  });

upgradeCmd
  .command("info")
  .description("Show current chain version and upgrade history")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runUpgradeInfo({ json: opts.json });
  });

upgradeCmd
  .command("prepare")
  .description("Prepare for a specific upgrade (download binary, verify)")
  .argument("<name>", "upgrade name")
  .option("--height <height>", "target upgrade height")
  .action(async (name: string, opts) => {
    await runUpgradePrepare({ name, height: opts.height });
  });

// ---------------------------------------------------------------------------
// clawd deploy-profile — config generator for local/VPS/k8s/docker
// ---------------------------------------------------------------------------

program
  .command("deploy-profile")
  .description("Generate deployment configs for local, VPS, Docker, or Kubernetes")
  .argument("<target>", "deployment target: local, vps, docker, or k8s")
  .option("--output <dir>", "output directory for generated files")
  .option("--moniker <name>", "node moniker")
  .option("--chain-id <id>", "chain ID")
  .option("--rpc-port <port>", "RPC port")
  .option("--rest-port <port>", "REST port")
  .option("--json", "output machine-readable JSON")
  .action(async (target: string, opts) => {
    await runDeployProfile({
      target: target as "local" | "vps" | "k8s" | "docker",
      output: opts.output,
      moniker: opts.moniker,
      chainId: opts.chainId,
      rpcPort: opts.rpcPort,
      restPort: opts.restPort,
      json: opts.json,
    });
  });

// ---------------------------------------------------------------------------
// clawd launch-gate — mainnet launch readiness assessment
// ---------------------------------------------------------------------------

program
  .command("launch-gate")
  .description("Check all 18 mainnet launch criteria programmatically")
  .option("--json", "output machine-readable JSON report")
  .option("--verbose", "show detailed check output")
  .action(async (opts) => {
    await runLaunchGate({ json: opts.json, verbose: opts.verbose });
  });

// ---------------------------------------------------------------------------
// clawd provenance — binary checksums and genesis validation
// ---------------------------------------------------------------------------

const provenanceCmd = program
  .command("provenance")
  .description("Binary provenance and genesis validation");

provenanceCmd
  .command("checksums")
  .description("Generate SHA-256 checksums for chain binaries")
  .option("--output <file>", "write checksums to file")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runProvenance({ output: opts.output, json: opts.json });
  });

provenanceCmd
  .command("genesis-validate")
  .description("Validate genesis file structure and parameters")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runGenesisValidate({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd migrate — state migration tooling for chain upgrades
// ---------------------------------------------------------------------------

const migrateCmd = program
  .command("migrate")
  .description("State migration tooling for chain upgrades");

migrateCmd
  .command("export")
  .description("Export chain state at a given height")
  .option("--height <height>", "block height to export at")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runMigrateExport({ height: opts.height, json: opts.json });
  });

migrateCmd
  .command("validate")
  .description("Validate a genesis/state file structure and module state")
  .option("--file <path>", "path to the state/genesis file")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runMigrateValidate({ file: opts.file, json: opts.json });
  });

migrateCmd
  .command("diff")
  .description("Diff two state files module-by-module")
  .requiredOption("--old <file>", "path to the old state file")
  .requiredOption("--new <file>", "path to the new state file")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runMigrateDiff({ old: opts.old, new: opts.new, json: opts.json });
  });

migrateCmd
  .command("check")
  .description("Pre-migration readiness check")
  .option("--version <version>", "target upgrade version name")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runMigrateCheck({ version: opts.version, json: opts.json });
  });

migrateCmd
  .command("history")
  .description("Show migration export history")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runMigrateHistory({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd gpu-provider — GPU compute provider management
// ---------------------------------------------------------------------------

const gpuProviderCmd = program
  .command("gpu-provider")
  .description("GPU compute provider registration and management");

gpuProviderCmd
  .command("register")
  .description("Register as a GPU compute provider")
  .requiredOption("--vram <gb>", "VRAM in GB")
  .requiredOption("--price <uclaw>", "price per hour in uclaw")
  .option("--cuda-cores <n>", "CUDA core count")
  .option("--name <name>", "provider name")
  .action(async (opts) => {
    await runGpuRegister({
      vram: opts.vram,
      price: opts.price,
      cudaCores: opts.cudaCores,
      name: opts.name,
    });
  });

gpuProviderCmd
  .command("status")
  .description("Show GPU provider registration status")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runGpuProviderStatus({ json: opts.json });
  });

gpuProviderCmd
  .command("earnings")
  .description("Show GPU provider earnings from completed jobs")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runGpuEarnings({ json: opts.json });
  });

gpuProviderCmd
  .command("setup")
  .description("Interactive setup wizard for GPU providers (detect hardware, validate chain, generate config)")
  .option("--skip-checks", "skip chain connectivity and balance checks")
  .option("--output <path>", "config output path (default: config.toml)")
  .option("--name <name>", "provider display name")
  .option("--rest-url <url>", "chain REST endpoint override")
  .option("--rpc-url <url>", "chain RPC endpoint override")
  .action(async (opts) => {
    await runGpuProviderSetup({
      skipChecks: opts.skipChecks,
      output: opts.output,
      name: opts.name,
      restUrl: opts.restUrl,
      rpcUrl: opts.rpcUrl,
    });
  });

gpuProviderCmd
  .command("detect-hardware")
  .description("Detect available GPU hardware (NVIDIA, AMD, Apple Silicon)")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runDetectHardware({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd skills — skill marketplace provider management
// ---------------------------------------------------------------------------

const skillsCmd = program
  .command("skills")
  .description("Skill marketplace provider management (publish, price, delist, sales)");

skillsCmd
  .command("list")
  .description("List published skills")
  .option("--owner <address>", "filter by owner address")
  .option("--category <cat>", "filter by category")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runSkillsList({ owner: opts.owner, category: opts.category, json: opts.json });
  });

skillsCmd
  .command("publish")
  .description("Publish a new skill to the marketplace")
  .requiredOption("--name <name>", "skill name")
  .requiredOption("--description <desc>", "skill description")
  .requiredOption("--price <uclaw>", "skill price in uclaw")
  .option("--category <cat>", "skill category")
  .option("--denom <denom>", "payment denom")
  .action(async (opts) => {
    await runSkillsPublish({
      name: opts.name,
      description: opts.description,
      price: opts.price,
      category: opts.category,
      denom: opts.denom,
    });
  });

skillsCmd
  .command("price")
  .description("Update skill price")
  .requiredOption("--skill-id <id>", "skill ID")
  .requiredOption("--price <uclaw>", "new price in uclaw")
  .action(async (opts) => {
    await runSkillsPrice({ skillId: opts.skillId, price: opts.price });
  });

skillsCmd
  .command("delist")
  .description("Delist a skill from the marketplace")
  .requiredOption("--skill-id <id>", "skill ID")
  .action(async (opts) => {
    await runSkillsDelist({ skillId: opts.skillId });
  });

skillsCmd
  .command("sales")
  .description("Show sales analytics for a skill")
  .requiredOption("--skill-id <id>", "skill ID")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runSkillsSales({ skillId: opts.skillId, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd inventory — provider-side inventory summary
// ---------------------------------------------------------------------------

program
  .command("inventory")
  .description("Show provider-side inventory: skills, GPU, models, tasks, earnings")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runInventory({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd earnings — provider-side earnings breakdown
// ---------------------------------------------------------------------------

program
  .command("earnings")
  .description("Show provider-side earnings breakdown (agent mining, tasks, staking, GPU, skills)")
  .option("--json", "output machine-readable JSON")
  .option("--period <period>", "time period: day, week, month, all", "all")
  .action(async (opts) => {
    await runEarnings({ json: opts.json, period: opts.period });
  });

// ---------------------------------------------------------------------------
// clawd artemis — DEX arbitrage bot
// ---------------------------------------------------------------------------

const artemisCmd = program
  .command("artemis")
  .description("DEX arbitrage bot — scan pools and execute cross-pool swaps");

artemisCmd
  .command("run")
  .description("Start the arbitrage bot polling loop")
  .option("--factory <addr>", "ClawDEX factory contract address")
  .option("--pools <addrs>", "comma-separated pool addresses (if no factory)")
  .option("--interval <ms>", "polling interval in milliseconds", "5000")
  .option("--min-profit <bps>", "minimum profit in basis points", "50")
  .option("--dry-run", "simulate only, do not broadcast")
  .option("--json", "output structured JSON logs")
  .action(async (opts) => {
    await runArtemisRun({
      factory: opts.factory,
      pools: opts.pools,
      interval: opts.interval,
      minProfit: opts.minProfit,
      dryRun: opts.dryRun,
      json: opts.json,
    });
  });

artemisCmd
  .command("scan")
  .description("One-shot scan for arbitrage opportunities")
  .option("--factory <addr>", "ClawDEX factory contract address")
  .option("--pools <addrs>", "comma-separated pool addresses")
  .option("--min-profit <bps>", "minimum profit in basis points", "10")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runArtemisScan({
      factory: opts.factory,
      pools: opts.pools,
      minProfit: opts.minProfit,
      json: opts.json,
    });
  });

artemisCmd
  .command("pools")
  .description("List all DEX pools with reserves and prices")
  .option("--factory <addr>", "ClawDEX factory contract address")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runArtemisPools({
      factory: opts.factory,
      json: opts.json,
    });
  });

// ---------------------------------------------------------------------------
// clawd cryo — blockchain data extractor
// ---------------------------------------------------------------------------

const cryoCmd = program
  .command("cryo")
  .description("Blockchain data extractor — export blocks, txs, events to CSV/JSON");

cryoCmd
  .command("extract <dataset>")
  .description("Extract data (blocks, transactions, agent_events, privacy_events, marketplace_events, staking_events, governance_events, dex_swaps, module_params)")
  .option("--start <height>", "start block height")
  .option("--end <height>", "end block height")
  .option("--last-n <n>", "last N blocks")
  .option("--format <fmt>", "output format: csv, json, jsonl", "json")
  .option("--output <file>", "output file path (default: stdout)")
  .option("--json", "alias for --format json")
  .action(async (dataset: string, opts) => {
    await runCryoExtract(dataset, {
      start: opts.start,
      end: opts.end,
      lastN: opts.lastN,
      format: opts.format,
      output: opts.output,
      json: opts.json,
    });
  });

cryoCmd
  .command("datasets")
  .description("List available datasets for extraction")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runCryoDatasets({ json: opts.json });
  });

cryoCmd
  .command("stats")
  .description("Show chain statistics summary")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runCryoStats({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd flood — RPC load tester
// ---------------------------------------------------------------------------

const floodCmd = program
  .command("flood")
  .description("RPC load tester — benchmark CometBFT RPC, REST, gRPC endpoints");

floodCmd
  .command("run <scenario>")
  .description("Run a load test scenario (read, write, mixed, blocks, txquery, abci)")
  .option("--concurrency <n>", "number of concurrent workers", parseInt)
  .option("--duration <s>", "test duration in seconds", parseInt)
  .option("--rate <rps>", "max requests per second (0 = unlimited)", parseInt)
  .option("--rpc <url>", "CometBFT RPC URL")
  .option("--rest <url>", "REST API URL")
  .option("--verbose", "show per-request output")
  .option("--json", "output structured JSON results")
  .action(async (scenario: string, opts) => {
    await runFloodRun({
      scenario,
      concurrency: opts.concurrency,
      duration: opts.duration,
      rate: opts.rate,
      rpc: opts.rpc,
      rest: opts.rest,
      verbose: opts.verbose,
      json: opts.json,
    });
  });

floodCmd
  .command("scenarios")
  .description("List available load test scenarios")
  .option("--json", "output structured JSON")
  .action(async (opts: { json?: boolean }) => {
    await runFloodScenarios({ json: opts.json });
  });

floodCmd
  .command("check")
  .description("Quick health check on RPC/REST endpoints")
  .option("--rpc <url>", "CometBFT RPC URL")
  .option("--rest <url>", "REST API URL")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runFloodCheck({ rpc: opts.rpc, rest: opts.rest, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd benchmark — built-in performance benchmarking
// ---------------------------------------------------------------------------

const benchmarkCmd = program
  .command("benchmark")
  .description("Performance benchmarking — run suites, compare results, track history");

benchmarkCmd
  .command("run")
  .description("Run a comprehensive benchmark suite")
  .option("--profile <name>", "benchmark profile: quick, standard, thorough", "standard")
  .option("--rpc <url>", "CometBFT RPC URL")
  .option("--rest <url>", "REST API URL")
  .option("--verbose", "show per-request output")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runBenchmarkRun({
      profile: opts.profile,
      rpc: opts.rpc,
      rest: opts.rest,
      verbose: opts.verbose,
      json: opts.json,
    });
  });

benchmarkCmd
  .command("compare")
  .description("Compare two benchmark results side-by-side")
  .requiredOption("--baseline <file>", "path to baseline benchmark JSON")
  .requiredOption("--current <file>", "path to current benchmark JSON")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runBenchmarkCompare({
      baseline: opts.baseline,
      current: opts.current,
      json: opts.json,
    });
  });

benchmarkCmd
  .command("profiles")
  .description("List available benchmark profiles")
  .option("--json", "output structured JSON")
  .action(async (opts: { json?: boolean }) => {
    await runBenchmarkProfiles({ json: opts.json });
  });

benchmarkCmd
  .command("history")
  .description("Show past benchmark runs")
  .option("--limit <n>", "max entries to show", parseInt)
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runBenchmarkHistory({ limit: opts.limit, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd data-portal — dataset catalog and downloader
// ---------------------------------------------------------------------------

const dataPortalCmd = program
  .command("data-portal")
  .description("Dataset catalog — browse, inspect, and download ClawChain datasets");

dataPortalCmd
  .command("list")
  .description("List available datasets")
  .option("--category <cat>", "filter by category")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runDataPortalList({ category: opts.category, json: opts.json });
  });

dataPortalCmd
  .command("categories")
  .description("Show dataset categories")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runDataPortalCategories({ json: opts.json });
  });

dataPortalCmd
  .command("info <dataset-id>")
  .description("Show detailed info about a dataset")
  .option("--json", "output structured JSON")
  .action(async (datasetId: string, opts: { json?: boolean }) => {
    await runDataPortalInfo({ datasetId, json: opts.json });
  });

dataPortalCmd
  .command("download <dataset-id>")
  .description("Download or generate a dataset")
  .option("--format <fmt>", "output format: csv or json", "csv")
  .option("--output <file>", "output file path (default: stdout)")
  .option("--sample", "generate sample data instead of live fetch")
  .option("--limit <n>", "max rows to return", "1000")
  .option("--json", "alias for --format json")
  .action(async (datasetId: string, opts) => {
    await runDataPortalDownload({
      datasetId,
      format: opts.format,
      output: opts.output,
      sample: opts.sample,
      limit: opts.limit,
      json: opts.json,
    });
  });

// ---------------------------------------------------------------------------
// clawd rivet — chain inspector
// ---------------------------------------------------------------------------

const rivetCmd = program
  .command("rivet")
  .description("Chain inspector — inspect, watch, decode, query, simulate");

rivetCmd
  .command("inspect")
  .description("Inspect a block or transaction")
  .argument("<type>", "type to inspect: block or tx")
  .argument("<id>", "block height or tx hash")
  .option("--rpc <url>", "CometBFT RPC URL")
  .option("--rest <url>", "REST API URL")
  .option("--decode", "decode transaction messages")
  .option("--json", "output structured JSON")
  .action(async (type: string, id: string, opts) => {
    await runRivetInspect({ type, id, rpc: opts.rpc, rest: opts.rest, decode: opts.decode, json: opts.json });
  });

rivetCmd
  .command("watch")
  .description("Live stream of new blocks and transactions")
  .option("--filter <type>", "filter by type: all, blocks, txs", "all")
  .option("--rpc <url>", "CometBFT RPC URL")
  .option("--decode", "decode transaction messages")
  .option("--json", "output structured JSON per event")
  .action(async (opts) => {
    await runRivetWatch({ filter: opts.filter, rpc: opts.rpc, decode: opts.decode, json: opts.json });
  });

rivetCmd
  .command("decode")
  .description("Decode a raw transaction (base64 or hex)")
  .argument("<data>", "raw transaction bytes (base64 or hex)")
  .option("--type <type>", "message type hint")
  .option("--json", "output structured JSON")
  .action(async (data: string, opts) => {
    await runRivetDecode({ data, type: opts.type, json: opts.json });
  });

rivetCmd
  .command("query")
  .description("Query module state (agent, privacy, marketplace, governance, staking, bank, wasm)")
  .argument("<module>", "module name")
  .argument("[args...]", "query path arguments")
  .option("--path <p>", "query path within module")
  .option("--rest <url>", "REST API URL")
  .option("--json", "output structured JSON")
  .action(async (module: string, args: string[], opts) => {
    await runRivetQuery({ module, path: opts.path, args, rest: opts.rest, json: opts.json });
  });

rivetCmd
  .command("simulate")
  .description("Simulate a transaction without broadcasting")
  .argument("<msg-json>", "message JSON to simulate")
  .option("--rest <url>", "REST API URL")
  .option("--from <address>", "sender address")
  .option("--json", "output structured JSON")
  .action(async (msgJson: string, opts) => {
    await runRivetSimulate({ msgJson, rest: opts.rest, from: opts.from, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd ecosystem — discover ClawChain ecosystem packages
// ---------------------------------------------------------------------------

const ecosystemCmd = program
  .command("ecosystem")
  .description("Discover and explore ClawChain ecosystem packages and tools");

ecosystemCmd
  .command("list")
  .description("List all ecosystem packages")
  .option("--category <cat>", "filter by category: primitives, react, cli-tool, contract")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runEcosystemList({ category: opts.category, json: opts.json });
  });

ecosystemCmd
  .command("info")
  .description("Show detailed info about an ecosystem package")
  .argument("<name>", "package name")
  .option("--json", "output structured JSON")
  .action(async (name: string, opts) => {
    await runEcosystemInfo(name, { json: opts.json });
  });

ecosystemCmd
  .command("categories")
  .description("Show ecosystem categories")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runEcosystemCategories({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd testnet — local multi-validator testnet management
// ---------------------------------------------------------------------------

const testnetCmd = program
  .command("testnet")
  .description("Manage local multi-validator testnets");

testnetCmd
  .command("create")
  .description("Create a new local testnet")
  .option("--validators <n>", "number of validators (1-20)", "4")
  .option("--chain-id <id>", "chain ID for the testnet")
  .option("--denom <d>", "bond denomination")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runTestnetCreate({
      validators: opts.validators,
      chainId: opts.chainId,
      denom: opts.denom,
      json: opts.json,
    });
  });

testnetCmd
  .command("start")
  .description("Start a testnet (all validator nodes as background processes)")
  .option("--chain-id <id>", "chain ID to identify which testnet")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runTestnetStart({ chainId: opts.chainId, json: opts.json });
  });

testnetCmd
  .command("stop")
  .description("Stop a running testnet")
  .option("--chain-id <id>", "chain ID to identify which testnet")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runTestnetStop({ chainId: opts.chainId, json: opts.json });
  });

testnetCmd
  .command("status")
  .description("Show testnet status (processes, block height, peers)")
  .option("--chain-id <id>", "chain ID to identify which testnet")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runTestnetStatus({ chainId: opts.chainId, json: opts.json });
  });

testnetCmd
  .command("reset")
  .description("Reset testnet state (keeps keys and genesis, or --destroy to remove everything)")
  .option("--chain-id <id>", "chain ID to identify which testnet")
  .option("--destroy", "remove the testnet entirely instead of resetting")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runTestnetReset({ chainId: opts.chainId, destroy: opts.destroy, json: opts.json });
  });

testnetCmd
  .command("list")
  .description("List all created testnets")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runTestnetList({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd genesis — genesis file inspection and validation
// ---------------------------------------------------------------------------

const genesisCmd = program
  .command("genesis")
  .description("Inspect, validate, and compare genesis files");

genesisCmd
  .command("inspect")
  .description("Show genesis file summary (chain ID, accounts, validators, modules)")
  .option("--file <path>", "genesis file path")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runGenesisInspect({ file: opts.file, json: opts.json });
  });

genesisCmd
  .command("accounts")
  .description("List genesis accounts and balances")
  .option("--file <path>", "genesis file path")
  .option("--top <n>", "show top N accounts by balance")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runGenesisAccounts({ file: opts.file, top: opts.top ? parseInt(opts.top, 10) : undefined, json: opts.json });
  });

genesisCmd
  .command("validators")
  .description("List genesis validators and their stakes")
  .option("--file <path>", "genesis file path")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runGenesisValidators({ file: opts.file, json: opts.json });
  });

genesisCmd
  .command("module-params")
  .description("Show module parameters from genesis")
  .option("--file <path>", "genesis file path")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runGenesisModuleParams({ file: opts.file, json: opts.json });
  });

genesisCmd
  .command("hash")
  .description("Compute and optionally verify genesis hash")
  .option("--file <path>", "genesis file path")
  .option("--expected <hash>", "expected hash to verify against")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runGenesisHash({ file: opts.file, expected: opts.expected, json: opts.json });
  });

genesisCmd
  .command("diff")
  .description("Compare two genesis files and show differences")
  .argument("<old>", "path to old genesis file")
  .argument("<new>", "path to new genesis file")
  .option("--json", "output structured JSON")
  .action(async (oldPath: string, newPath: string, opts) => {
    await runGenesisDiff({ old: oldPath, new: newPath, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd checksums — release binary checksum management
// ---------------------------------------------------------------------------

const checksumsCmd = program
  .command("checksums")
  .description("Generate, verify, and show SHA-256 checksums for release binaries");

checksumsCmd
  .command("generate")
  .description("Compute SHA-256 checksums for all files in build directory")
  .option("--output-dir <dir>", "build directory to scan", "./build")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runChecksumsGenerate({ outputDir: opts.outputDir, json: opts.json });
  });

checksumsCmd
  .command("verify")
  .description("Verify checksums file against actual files")
  .option("--file <path>", "checksums file to verify", "./build/checksums.txt")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runChecksumsVerify({ file: opts.file, json: opts.json });
  });

checksumsCmd
  .command("show")
  .description("Display current checksums")
  .option("--file <path>", "checksums file to display", "./build/checksums.txt")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runChecksumsShow({ file: opts.file, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd launch-checklist — launch readiness tracking
// ---------------------------------------------------------------------------

const launchChecklistCmd = program
  .command("launch-checklist")
  .description("Track and manage launch readiness checklist (18 criteria)");

launchChecklistCmd
  .command("status")
  .description("Show full launch checklist status")
  .option("--category <cat>", "filter by category: testing, security, infrastructure, operations, documentation")
  .option("--json", "output structured JSON")
  .action((opts) => {
    runLaunchChecklistStatus({ category: opts.category, json: opts.json });
  });

launchChecklistCmd
  .command("sign <item>")
  .description("Sign off on a checklist item")
  .argument("<evidence>", "evidence string (file path, URL, or description)")
  .option("--json", "output structured JSON")
  .action((item: string, evidence: string, opts) => {
    runLaunchChecklistSign({ item: parseInt(item, 10), evidence, json: opts.json });
  });

launchChecklistCmd
  .command("reset")
  .description("Reset checklist (all items or a specific one)")
  .option("--item <n>", "specific item number to reset")
  .option("--json", "output structured JSON")
  .action((opts) => {
    runLaunchChecklistReset({ item: opts.item ? parseInt(opts.item, 10) : undefined, json: opts.json });
  });

launchChecklistCmd
  .command("export")
  .description("Export checklist as markdown")
  .option("--output <file>", "output file path (default: stdout)")
  .option("--json", "output structured JSON")
  .action((opts) => {
    runLaunchChecklistExport({ output: opts.output, json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd health — service health checks
// ---------------------------------------------------------------------------

const healthCmd = program
  .command("health")
  .description("Check health of all ClawChain services");

healthCmd
  .command("check")
  .description("Run health checks on all services")
  .option("--services <list>", "comma-separated list of services to check")
  .option("--rpc <url>", "CometBFT RPC URL")
  .option("--rest <url>", "REST API URL")
  .option("--timeout <ms>", "request timeout in milliseconds", "5000")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runHealthCheck({
      services: opts.services,
      rpc: opts.rpc,
      rest: opts.rest,
      timeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
      json: opts.json,
    });
  });

healthCmd
  .command("watch")
  .description("Continuously monitor service health")
  .option("--interval <sec>", "check interval in seconds", "10")
  .option("--rpc <url>", "CometBFT RPC URL")
  .option("--rest <url>", "REST API URL")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runHealthWatch({
      interval: opts.interval ? parseInt(opts.interval, 10) : undefined,
      rpc: opts.rpc,
      rest: opts.rest,
      json: opts.json,
    });
  });

healthCmd
  .command("endpoints")
  .description("List all configured service endpoints")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runHealthEndpoints({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd validate — installation and configuration validation
// ---------------------------------------------------------------------------

const validateCmd = program
  .command("validate")
  .description("Validate ClawChain installation, config, binaries, and chain data");

validateCmd
  .command("config")
  .description("Validate clawd configuration file")
  .option("--json", "output structured JSON")
  .action((opts) => {
    runValidateConfig({ json: opts.json });
  });

validateCmd
  .command("binaries")
  .description("Check required binaries are installed")
  .option("--json", "output structured JSON")
  .action((opts) => {
    runValidateBinaries({ json: opts.json });
  });

validateCmd
  .command("chain")
  .description("Validate chain data directory")
  .option("--home <dir>", "chain home directory", "~/.clawchain")
  .option("--json", "output structured JSON")
  .action((opts) => {
    runValidateChain({ home: opts.home, json: opts.json });
  });

validateCmd
  .command("genesis")
  .description("Deep validate genesis file structure")
  .option("--file <path>", "genesis file path")
  .option("--json", "output structured JSON")
  .action((opts) => {
    runValidateGenesis({ file: opts.file, json: opts.json });
  });

validateCmd
  .command("all")
  .description("Run all validations (config + binaries + chain)")
  .option("--json", "output structured JSON")
  .action((opts) => {
    runValidateAll({ json: opts.json });
  });

// ---------------------------------------------------------------------------
// clawd monitoring — Prometheus, Grafana, AlertManager management
// ---------------------------------------------------------------------------

const monitoringCmd = program
  .command("monitoring")
  .description("Manage and validate the monitoring stack (Prometheus, Grafana, AlertManager)");

monitoringCmd
  .command("status")
  .description("Check if Prometheus, Grafana, and AlertManager are reachable")
  .option("--prometheus-url <url>", "Prometheus URL", "http://localhost:9090")
  .option("--grafana-url <url>", "Grafana URL", "http://localhost:3000")
  .option("--alertmanager-url <url>", "AlertManager URL", "http://localhost:9093")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runMonitoringStatus({
      prometheusUrl: opts.prometheusUrl,
      grafanaUrl: opts.grafanaUrl,
      alertmanagerUrl: opts.alertmanagerUrl,
      json: opts.json,
    });
  });

monitoringCmd
  .command("check")
  .description("Validate local monitoring config files")
  .option("--config-dir <dir>", "monitoring config directory")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runMonitoringCheck({ configDir: opts.configDir, json: opts.json });
  });

monitoringCmd
  .command("metrics")
  .description("Query key chain metrics from Prometheus")
  .option("--prometheus-url <url>", "Prometheus URL", "http://localhost:9090")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runMonitoringMetrics({ prometheusUrl: opts.prometheusUrl, json: opts.json });
  });

monitoringCmd
  .command("alerts")
  .description("Show active alerts from AlertManager")
  .option("--alertmanager-url <url>", "AlertManager URL", "http://localhost:9093")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runMonitoringAlerts({ alertmanagerUrl: opts.alertmanagerUrl, json: opts.json });
  });

monitoringCmd
  .command("dashboards")
  .description("List and validate Grafana dashboards")
  .option("--grafana-url <url>", "Grafana URL", "http://localhost:3000")
  .option("--api-key <key>", "Grafana API key for authentication")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runMonitoringDashboards({ grafanaUrl: opts.grafanaUrl, apiKey: opts.apiKey, json: opts.json });
  });

monitoringCmd
  .command("export")
  .description("Generate monitoring config files (Prometheus, Grafana datasource, alerts)")
  .option("--output <dir>", "output directory")
  .option("--format <fmt>", "config format: docker, k8s, standalone", "docker")
  .option("--json", "output structured JSON")
  .action(async (opts) => {
    await runMonitoringExport({ output: opts.output, format: opts.format, json: opts.json });
  });

program.parse();

function parseStringMap(raw: unknown): Record<string, string> {
  const text = String(raw ?? "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      const key = String(k).trim();
      const val = String(v ?? "").trim();
      if (!key || !val) continue;
      out[key] = val;
    }
    return out;
  } catch {
    console.error("Invalid --id-map-json: expected JSON object.");
    process.exit(1);
  }
}

function renderCommandTemplate(template: string, skillName: string, skillFilePath: string): string {
  return template
    .replaceAll("{skill_name}", skillName)
    .replaceAll("{skill_dir}", dirname(skillFilePath))
    .replaceAll("{skill_file}", skillFilePath);
}

function normalizeUclawString(raw: string, label: string): string {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) {
    console.error(`${label} must be a non-negative integer in uclaw.`);
    process.exit(1);
  }
  return text;
}

function normalizePositiveInt(raw: number, label: string): number {
  if (!Number.isFinite(raw) || raw <= 0) {
    console.error(`${label} must be a positive integer.`);
    process.exit(1);
  }
  return Math.floor(raw);
}
