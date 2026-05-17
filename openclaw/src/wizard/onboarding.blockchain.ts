import crypto from "node:crypto";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { detectBinary } from "../commands/onboard-helpers.js";
import type { WizardPrompter } from "./prompts.js";
import type { WizardFlow } from "./onboarding.types.js";

type BlockchainOnboardingOptions = {
  flow: WizardFlow;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

type BlockchainOnboardResult = {
  nextConfig: OpenClawConfig;
  skipped: boolean;
};

/**
 * Generate a random BIP-39-style mnemonic (24 words).
 * Uses a simplified wordlist subset for deterministic generation.
 * In production, the full BIP-39 wordlist should be used via a library.
 */
function generatePlaceholderMnemonic(): string {
  const words = [
    "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
    "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid",
    "acquire", "across", "act", "action", "actor", "actress", "actual", "adapt",
    "add", "addict", "address", "adjust", "admit", "adult", "advance", "advice",
    "aerobic", "affair", "afford", "afraid", "again", "age", "agent", "agree",
    "ahead", "aim", "air", "airport", "aisle", "alarm", "album", "alcohol",
    "alert", "alien", "all", "alley", "allow", "almost", "alone", "alpha",
    "already", "also", "alter", "always", "amateur", "amazing", "among", "amount",
    "amused", "analyst", "anchor", "ancient", "anger", "angle", "angry", "animal",
    "ankle", "announce", "annual", "another", "answer", "antenna", "antique", "anxiety",
    "any", "apart", "apology", "appear", "apple", "approve", "april", "arch",
    "arctic", "area", "arena", "argue", "arm", "armed", "armor", "army",
    "around", "arrange", "arrest", "arrive", "arrow", "art", "artefact", "artist",
    "artwork", "ask", "aspect", "assault", "asset", "assist", "assume", "asthma",
    "athlete", "atom", "attack", "attend", "attitude", "attract", "auction", "audit",
    "august", "aunt", "author", "auto", "autumn", "average", "avocado", "avoid",
    "awake", "aware", "awesome", "awful", "awkward", "axis", "baby", "bachelor",
    "bacon", "badge", "bag", "balance", "balcony", "ball", "bamboo", "banana",
    "banner", "bar", "barely", "bargain", "barrel", "base", "basic", "basket",
    "battle", "beach", "bean", "beauty", "because", "become", "beef", "before",
    "begin", "behave", "behind", "believe", "below", "belt", "bench", "benefit",
    "best", "betray", "better", "between", "beyond", "bicycle", "bid", "bike",
    "bind", "biology", "bird", "birth", "bitter", "black", "blade", "blame",
    "blanket", "blast", "bleak", "bless", "blind", "blood", "blossom", "blow",
    "blue", "blur", "blush", "board", "boat", "body", "boil", "bomb",
    "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss",
    "bottom", "bounce", "box", "boy", "bracket", "brain", "brand", "brass",
    "brave", "bread", "breeze", "brick", "bridge", "brief", "bright", "bring",
    "brisk", "broccoli", "broken", "bronze", "broom", "brother", "brown", "brush",
    "bubble", "buddy", "budget", "buffalo", "build", "bulb", "bulk", "bullet",
    "bundle", "bunny", "burden", "burger", "burst", "bus", "business", "busy",
    "butter", "buyer", "buzz", "cabbage", "cabin", "cable", "cactus", "cage",
    "cake", "call", "calm", "camera", "camp", "can", "canal", "cancel",
    "candy", "cannon", "canoe", "canvas", "canyon", "capable", "capital", "captain",
  ];
  const result: string[] = [];
  for (let i = 0; i < 24; i++) {
    const randomIndex = crypto.randomInt(0, words.length);
    result.push(words[randomIndex]);
  }
  return result.join(" ");
}

function validateRpcUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {return "RPC URL is required";}
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Must be http:// or https:// URL";
    }
  } catch {
    return "Invalid URL format";
  }
  return undefined;
}

export async function setupBlockchain(
  cfg: OpenClawConfig,
  options: BlockchainOnboardingOptions,
): Promise<BlockchainOnboardResult> {
  const { flow, prompter, runtime } = options;
  const existingEnabled = cfg.blockchain?.enabled === true;

  await prompter.note(
    [
      "ClawChain connects your agent to a decentralized AI economy.",
      "",
      "  Install  — clawchaind node + clawproof binary",
      "  Run      — register on-chain, accept tasks, earn rewards",
      "  Earn     — complete tasks, stake CLAW, climb the leaderboard",
      "",
      "Enable ClawChain to let your agent participate in the network.",
      "Skip if you only want a standalone assistant.",
    ].join("\n"),
    "ClawChain — Install, Run, Earn",
  );

  const shouldEnable =
    flow === "quickstart"
      ? existingEnabled
      : await prompter.confirm({
          message: "Enable ClawChain blockchain integration?",
          initialValue: existingEnabled,
        });

  if (!shouldEnable) {
    return {
      nextConfig: {
        ...cfg,
        blockchain: cfg.blockchain ? { ...cfg.blockchain, enabled: false } : undefined,
      },
      skipped: true,
    };
  }

  if (flow === "quickstart") {
    // QuickStart: enable with defaults, keep existing values
    const next: OpenClawConfig = {
      ...cfg,
      blockchain: {
        ...cfg.blockchain,
        enabled: true,
        rpcUrl: cfg.blockchain?.rpcUrl ?? "http://localhost:26657",
        restUrl: cfg.blockchain?.restUrl ?? "http://localhost:1317",
        denom: cfg.blockchain?.denom ?? "uclaw",
        prefix: cfg.blockchain?.prefix ?? "claw",
        gasPrice: cfg.blockchain?.gasPrice ?? "0.025uclaw",
        autoRegister: cfg.blockchain?.autoRegister ?? true,
        heartbeat: {
          enabled: cfg.blockchain?.heartbeat?.enabled ?? true,
          intervalSeconds: cfg.blockchain?.heartbeat?.intervalSeconds ?? 60,
          ...cfg.blockchain?.heartbeat,
        },
      },
    };
    await prompter.note(
      [
        "ClawChain enabled with defaults:",
        `  RPC:  ${next.blockchain!.rpcUrl}`,
        `  REST: ${next.blockchain!.restUrl}`,
        `  Auto-register: yes`,
        `  Heartbeat: every 60s`,
        "",
        `Configure later: ${formatCliCommand("openclaw configure --section blockchain")}`,
      ].join("\n"),
      "ClawChain QuickStart",
    );
    return { nextConfig: next, skipped: false };
  }

  // Advanced flow: step-by-step configuration
  // Step 1: Check prerequisites
  const hasClawchaind = await detectBinary("clawchaind");
  const hasClawproof = await detectBinary("clawproof");

  const prereqLines: string[] = [];
  prereqLines.push(hasClawchaind ? "clawchaind: found" : "clawchaind: not found");
  prereqLines.push(hasClawproof ? "clawproof:  found" : "clawproof:  not found");

  if (!hasClawchaind || !hasClawproof) {
    prereqLines.push("");
    prereqLines.push("Missing binaries can be installed from:");
    prereqLines.push("  https://github.com/openclaw/clawchain/releases");
    if (!hasClawchaind) {
      prereqLines.push("  Or build: cd clawchain && make install");
    }
    if (!hasClawproof) {
      prereqLines.push("  clawproof: cd cmd/clawproof && go build -o clawproof");
    }
  }
  await prompter.note(prereqLines.join("\n"), "Prerequisites");

  if (!hasClawchaind && !hasClawproof) {
    const continueAnyway = await prompter.confirm({
      message: "Neither binary found. Continue anyway? (you can install later)",
      initialValue: true,
    });
    if (!continueAnyway) {
      return { nextConfig: cfg, skipped: true };
    }
  }

  // Step 2: Network connection
  const networkChoice = await prompter.select({
    message: "Network",
    options: [
      { value: "local", label: "Local node", hint: "Run your own node on this machine" },
      { value: "testnet", label: "Testnet", hint: "Connect to ClawChain testnet" },
      { value: "mainnet", label: "Mainnet", hint: "Connect to ClawChain mainnet" },
      { value: "custom", label: "Custom", hint: "Provide your own RPC/REST URLs" },
    ],
    initialValue: "local",
  });

  let rpcUrl = cfg.blockchain?.rpcUrl ?? "http://localhost:26657";
  let restUrl = cfg.blockchain?.restUrl ?? "http://localhost:1317";
  let nodeAutoStart = cfg.blockchain?.node?.autoStart ?? false;

  if (networkChoice === "local") {
    rpcUrl = "http://localhost:26657";
    restUrl = "http://localhost:1317";
    if (hasClawchaind) {
      nodeAutoStart = await prompter.confirm({
        message: "Auto-start clawchaind when the gateway starts?",
        initialValue: true,
      });
    }
  } else if (networkChoice === "testnet") {
    rpcUrl = "https://rpc.testnet.clawchain.io:443";
    restUrl = "https://api.testnet.clawchain.io:443";
    await prompter.note(
      [
        "Connecting to ClawChain testnet.",
        "Use the testnet faucet to get test tokens.",
      ].join("\n"),
      "Testnet",
    );
  } else if (networkChoice === "mainnet") {
    rpcUrl = "https://rpc.clawchain.io:443";
    restUrl = "https://api.clawchain.io:443";
  } else {
    rpcUrl = await prompter.text({
      message: "RPC URL",
      initialValue: rpcUrl,
      validate: validateRpcUrl,
    });
    restUrl = await prompter.text({
      message: "REST/LCD URL",
      initialValue: restUrl,
      validate: validateRpcUrl,
    });
  }

  // Step 3: Agent identity
  const identityChoice = await prompter.select({
    message: "Agent identity (keypair)",
    options: [
      { value: "generate", label: "Generate new mnemonic", hint: "Create a fresh keypair" },
      { value: "import", label: "Import existing mnemonic", hint: "Paste a 24-word mnemonic" },
      { value: "env", label: "Use environment variable", hint: "BLOCKCHAIN_MNEMONIC env var" },
      { value: "skip", label: "Skip for now", hint: "Configure later" },
    ],
    initialValue: cfg.blockchain?.mnemonic ? "import" : "generate",
  });

  let mnemonic: string | undefined = cfg.blockchain?.mnemonic;

  if (identityChoice === "generate") {
    mnemonic = generatePlaceholderMnemonic();
    await prompter.note(
      [
        "Generated mnemonic (SAVE THIS SECURELY):",
        "",
        mnemonic,
        "",
        "This is your agent's private key. If lost, you lose access to your on-chain identity and funds.",
        "Store it in a password manager or encrypted file.",
      ].join("\n"),
      "New Mnemonic",
    );
    const confirmed = await prompter.confirm({
      message: "I have saved the mnemonic securely",
      initialValue: false,
    });
    if (!confirmed) {
      await prompter.note("Please save your mnemonic before continuing.", "Warning");
    }
  } else if (identityChoice === "import") {
    const input = await prompter.text({
      message: "Enter 24-word mnemonic",
      placeholder: "word1 word2 word3 ... word24",
      validate: (value) => {
        const words = value.trim().split(/\s+/);
        if (words.length < 12) {return "Mnemonic must be at least 12 words";}
        if (words.length > 24) {return "Mnemonic must be at most 24 words";}
        return undefined;
      },
    });
    mnemonic = input.trim();
  } else if (identityChoice === "env") {
    mnemonic = undefined; // Will be loaded from BLOCKCHAIN_MNEMONIC at runtime
    await prompter.note(
      [
        "Set the BLOCKCHAIN_MNEMONIC environment variable before starting the gateway.",
        "",
        "Example:",
        '  export BLOCKCHAIN_MNEMONIC="word1 word2 ... word24"',
        "",
        "The gateway will read it at startup.",
      ].join("\n"),
      "Environment Variable",
    );
  }

  // Step 4: Auto-register and heartbeat
  const autoRegister = await prompter.confirm({
    message: "Auto-register agent on-chain at startup?",
    initialValue: cfg.blockchain?.autoRegister ?? true,
  });

  const heartbeatEnabled = await prompter.confirm({
    message: "Enable periodic heartbeat (proves liveness)?",
    initialValue: cfg.blockchain?.heartbeat?.enabled ?? true,
  });

  // Step 5: Faucet (for testnet/local)
  let faucetEnabled = cfg.blockchain?.faucet?.enabled ?? false;
  let faucetUrl = cfg.blockchain?.faucet?.url;
  if (networkChoice === "testnet") {
    faucetUrl = "https://faucet.testnet.clawchain.io";
    await prompter.note(`Testnet faucet: ${faucetUrl}`, "Faucet");
  } else if (networkChoice === "local") {
    faucetEnabled = await prompter.confirm({
      message: "Run a local faucet server? (for development)",
      initialValue: false,
    });
  }

  // Step 6: Autonomous loop
  const autonomousEnabled = await prompter.confirm({
    message: "Enable autonomous task loop? (discover + accept + execute tasks)",
    initialValue: cfg.blockchain?.autonomousLoop?.enabled ?? false,
  });

  // Build the config
  const next: OpenClawConfig = {
    ...cfg,
    blockchain: {
      enabled: true,
      rpcUrl,
      restUrl,
      denom: cfg.blockchain?.denom ?? "uclaw",
      prefix: cfg.blockchain?.prefix ?? "claw",
      gasPrice: cfg.blockchain?.gasPrice ?? "0.025uclaw",
      ...(mnemonic ? { mnemonic } : {}),
      proofBinaryPath: cfg.blockchain?.proofBinaryPath,
      keysDir: cfg.blockchain?.keysDir,
      autoRegister,
      messagingEndpoint: cfg.blockchain?.messagingEndpoint,
      node: {
        autoStart: nodeAutoStart,
        binaryPath: cfg.blockchain?.node?.binaryPath,
        home: cfg.blockchain?.node?.home,
      },
      faucet: {
        enabled: faucetEnabled,
        port: cfg.blockchain?.faucet?.port ?? 8888,
        dripAmount: cfg.blockchain?.faucet?.dripAmount ?? "10000000",
        ...(faucetUrl ? { url: faucetUrl } : {}),
      },
      peers: cfg.blockchain?.peers,
      heartbeat: {
        enabled: heartbeatEnabled,
        intervalSeconds: cfg.blockchain?.heartbeat?.intervalSeconds ?? 60,
        includeNodeStatus: cfg.blockchain?.heartbeat?.includeNodeStatus ?? true,
      },
      autonomousLoop: {
        enabled: autonomousEnabled,
        autoAcceptTasks: cfg.blockchain?.autonomousLoop?.autoAcceptTasks ?? true,
        maxConcurrentTasks: cfg.blockchain?.autonomousLoop?.maxConcurrentTasks ?? 3,
        pollIntervalMs: cfg.blockchain?.autonomousLoop?.pollIntervalMs ?? 30000,
        llmEndpoint: cfg.blockchain?.autonomousLoop?.llmEndpoint,
      },
    },
  };

  // Summary
  const summaryLines = [
    `Network: ${networkChoice}`,
    `RPC: ${rpcUrl}`,
    `REST: ${restUrl}`,
    `Identity: ${identityChoice === "generate" ? "new keypair" : identityChoice === "import" ? "imported" : identityChoice === "env" ? "via BLOCKCHAIN_MNEMONIC" : "not set"}`,
    `Auto-register: ${autoRegister ? "yes" : "no"}`,
    `Heartbeat: ${heartbeatEnabled ? "yes (60s)" : "no"}`,
    `Autonomous loop: ${autonomousEnabled ? "yes" : "no"}`,
    ...(nodeAutoStart ? ["Node auto-start: yes"] : []),
    ...(faucetEnabled ? ["Local faucet: yes"] : []),
    "",
    `Manage later: ${formatCliCommand("openclaw configure --section blockchain")}`,
    `Check status: ${formatCliCommand("openclaw blockchain status")}`,
  ];

  await prompter.note(summaryLines.join("\n"), "ClawChain Configured");

  return { nextConfig: next, skipped: false };
}
