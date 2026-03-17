#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJSON(filePath) {
  return JSON.parse(readText(filePath));
}

function extractObjectLiteral(source, startBraceIdx) {
  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let i = startBraceIdx; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(startBraceIdx, i + 1);
      }
    }
  }

  throw new Error("Unterminated object literal while parsing Keplr config");
}

function parseMobileConfig(tsSource, constantName) {
  const blockRe = new RegExp(
    `export const ${constantName} = \\{([\\s\\S]*?)\\} as const;`,
    "m"
  );
  const block = tsSource.match(blockRe)?.[1];
  if (!block) {
    throw new Error(`Could not find ${constantName} in mobile chain config`);
  }

  const getStr = (field) => {
    const m = block.match(new RegExp(`${field}:\\s*"([^"]+)"`));
    if (!m) throw new Error(`Missing ${constantName}.${field}`);
    return m[1];
  };
  const getNum = (field) => {
    const m = block.match(new RegExp(`${field}:\\s*([0-9]+(?:\\.[0-9]+)?)`));
    if (!m) throw new Error(`Missing ${constantName}.${field}`);
    return m[1];
  };

  return {
    chainId: getStr("chainId"),
    chainName: getStr("chainName"),
    rpc: getStr("rpc"),
    rest: getStr("rest"),
    bech32Prefix: getStr("bech32Prefix"),
    denom: getStr("denom"),
    displayDenom: getStr("displayDenom"),
    coinGeckoId: getStr("coinGeckoId"),
    gasPrice: getStr("gasPrice"),
    decimals: parseInt(getNum("decimals"), 10),
  };
}

function parseKeplrConfig(tsSource, chainIdLiteral) {
  const chainIdx = tsSource.indexOf(`chainId: "${chainIdLiteral}"`);
  if (chainIdx === -1) {
    throw new Error(`Could not find keplr config block for ${chainIdLiteral}`);
  }

  // Walk backwards to the nearest object start and parse using brace depth.
  const startIdx = tsSource.lastIndexOf("{", chainIdx);
  if (startIdx === -1) {
    throw new Error(`Could not isolate keplr config block for ${chainIdLiteral}`);
  }
  const block = extractObjectLiteral(tsSource, startIdx);

  const getStr = (field) => {
    const m = block.match(new RegExp(`${field}:\\s*"([^"]+)"`));
    if (!m) throw new Error(`Missing ${chainIdLiteral}.${field} in keplr config`);
    return m[1];
  };
  const getNum = (field) => {
    const m = block.match(new RegExp(`${field}:\\s*([0-9]+(?:\\.[0-9]+)?)`));
    if (!m) throw new Error(`Missing ${chainIdLiteral}.${field} in keplr config`);
    return m[1];
  };

  const bech32PrefixMatch = block.match(/defaultBech32Config\("([^"]+)"\)/);
  if (!bech32PrefixMatch) {
    throw new Error(`Missing ${chainIdLiteral}.bech32Config in keplr config`);
  }

  const minimalDenomMatch = block.match(/coinMinimalDenom:\s*"([^"]+)"/);
  if (!minimalDenomMatch) {
    throw new Error(`Missing ${chainIdLiteral}.coinMinimalDenom in keplr config`);
  }
  const denomMatch = block.match(/stakeCurrency:\s*\{[\s\S]*?coinDenom:\s*"([^"]+)"/);
  if (!denomMatch) {
    throw new Error(`Missing ${chainIdLiteral}.stakeCurrency.coinDenom in keplr config`);
  }
  const decimalsMatch = block.match(/stakeCurrency:\s*\{[\s\S]*?coinDecimals:\s*([0-9]+)/);
  if (!decimalsMatch) {
    throw new Error(`Missing ${chainIdLiteral}.stakeCurrency.coinDecimals in keplr config`);
  }
  const coinGeckoMatch = block.match(/coinGeckoId:\s*"([^"]+)"/);
  const gasAverageMatch = block.match(/feeCurrencies:\s*\[[\s\S]*?gasPriceStep:\s*\{[\s\S]*?average:\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!gasAverageMatch) {
    throw new Error(`Missing ${chainIdLiteral}.feeCurrencies[].gasPriceStep.average in keplr config`);
  }

  return {
    chainId: chainIdLiteral,
    chainName: getStr("chainName"),
    rpc: getStr("rpc"),
    rest: getStr("rest"),
    bip44CoinType: parseInt(getNum("coinType"), 10),
    bech32Prefix: bech32PrefixMatch[1],
    denom: minimalDenomMatch[1],
    displayDenom: denomMatch[1],
    decimals: parseInt(decimalsMatch[1], 10),
    coinGeckoId: coinGeckoMatch ? coinGeckoMatch[1] : null,
    gasPriceAverage: parseFloat(gasAverageMatch[1]),
  };
}

function parseMobileGasPrice(value, networkLabel) {
  const m = value.match(/^([0-9]+(?:\.[0-9]+)?)([a-z0-9/]+)$/i);
  if (!m) {
    throw new Error(`Invalid ${networkLabel}.mobile.gasPrice format: ${value}`);
  }
  return { amount: parseFloat(m[1]), denom: m[2] };
}

function assertEqual(label, a, b, failures) {
  if (a !== b) {
    failures.push(`${label}: expected "${a}" == "${b}"`);
  }
}

function assertNumberEqual(label, a, b, failures, epsilon = 1e-12) {
  if (Math.abs(a - b) > epsilon) {
    failures.push(`${label}: expected ${a} == ${b}`);
  }
}

function assertHttps(label, url, failures) {
  if (!/^https:\/\//.test(url)) {
    failures.push(`${label}: expected https URL, got "${url}"`);
  }
}

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, "");
}

function joinURL(base, suffix) {
  return `${stripTrailingSlash(base)}${suffix}`;
}

async function getJSON(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function formatErr(err) {
  const base = err?.message ? String(err.message) : String(err);
  const cause = err?.cause?.message ? String(err.cause.message) : null;
  return cause && cause !== base ? `${base}; cause=${cause}` : base;
}

async function checkRPCNetwork({ name, endpoint, expectedChainId, failures }) {
  const url = joinURL(endpoint, "/status");
  try {
    const body = await getJSON(url);
    const network = body?.result?.node_info?.network;
    if (network !== expectedChainId) {
      failures.push(
        `${name}.rpc.chainId: expected "${expectedChainId}", got "${network ?? "missing"}" (${url})`
      );
    }
    const catchingUp = body?.result?.sync_info?.catching_up;
    if (typeof catchingUp !== "boolean") {
      failures.push(`${name}.rpc.syncInfo: missing catching_up (${url})`);
    }
  } catch (err) {
    failures.push(`${name}.rpc.unreachable: ${url} (${formatErr(err)})`);
  }
}

async function checkRESTNodeInfo({ name, endpoint, expectedChainId, failures }) {
  const url = joinURL(endpoint, "/cosmos/base/tendermint/v1beta1/node_info");
  try {
    const body = await getJSON(url);
    const network = body?.default_node_info?.network;
    if (network !== expectedChainId) {
      failures.push(
        `${name}.rest.chainId: expected "${expectedChainId}", got "${network ?? "missing"}" (${url})`
      );
    }
  } catch (err) {
    failures.push(`${name}.rest.unreachable: ${url} (${formatErr(err)})`);
  }
}

async function runLiveChecks(networks, failures) {
  for (const network of networks) {
    await checkRPCNetwork({
      name: network.name,
      endpoint: network.rpcEndpoint,
      expectedChainId: network.registry.chainId,
      failures,
    });
    await checkRESTNodeInfo({
      name: network.name,
      endpoint: network.restEndpoint,
      expectedChainId: network.registry.chainId,
      failures,
    });
  }
}

function validateNetwork({ name, registry, mobile, keplr, failures }) {
  const mobileGas = parseMobileGasPrice(mobile.gasPrice, name);

  assertEqual(`${name}.chainId registry/mobile`, registry.chainId, mobile.chainId, failures);
  assertEqual(`${name}.chainId registry/keplr`, registry.chainId, keplr.chainId, failures);
  assertEqual(`${name}.chainName registry/mobile`, registry.chainName, mobile.chainName, failures);
  assertEqual(`${name}.chainName registry/keplr`, registry.chainName, keplr.chainName, failures);
  assertEqual(`${name}.rpc registry/mobile`, registry.rpc, mobile.rpc, failures);
  assertEqual(`${name}.rpc registry/keplr`, registry.rpc, keplr.rpc, failures);
  assertEqual(`${name}.rest registry/mobile`, registry.rest, mobile.rest, failures);
  assertEqual(`${name}.rest registry/keplr`, registry.rest, keplr.rest, failures);
  assertHttps(`${name}.registry.rpc`, registry.rpc, failures);
  assertHttps(`${name}.registry.rest`, registry.rest, failures);
  assertHttps(`${name}.mobile.rpc`, mobile.rpc, failures);
  assertHttps(`${name}.mobile.rest`, mobile.rest, failures);
  assertHttps(`${name}.keplr.rpc`, keplr.rpc, failures);
  assertHttps(`${name}.keplr.rest`, keplr.rest, failures);
  assertEqual(
    `${name}.bech32Prefix registry/mobile`,
    registry.bech32Config?.bech32PrefixAccAddr,
    mobile.bech32Prefix,
    failures
  );
  assertEqual(
    `${name}.bech32Prefix registry/keplr`,
    registry.bech32Config?.bech32PrefixAccAddr,
    keplr.bech32Prefix,
    failures
  );
  assertEqual(
    `${name}.denom registry/mobile`,
    registry.stakeCurrency?.coinMinimalDenom,
    mobile.denom,
    failures
  );
  assertEqual(
    `${name}.denom registry/keplr`,
    registry.stakeCurrency?.coinMinimalDenom,
    keplr.denom,
    failures
  );
  assertEqual(
    `${name}.displayDenom registry/mobile`,
    registry.stakeCurrency?.coinDenom,
    mobile.displayDenom,
    failures
  );
  assertEqual(
    `${name}.displayDenom registry/keplr`,
    registry.stakeCurrency?.coinDenom,
    keplr.displayDenom,
    failures
  );
  assertEqual(
    `${name}.decimals registry/mobile`,
    registry.stakeCurrency?.coinDecimals,
    mobile.decimals,
    failures
  );
  assertEqual(
    `${name}.decimals registry/keplr`,
    registry.stakeCurrency?.coinDecimals,
    keplr.decimals,
    failures
  );
  assertEqual(`${name}.coinGecko registry/mobile`, registry.currencies?.[0]?.coinGeckoId, mobile.coinGeckoId, failures);
  if (keplr.coinGeckoId !== null) {
    assertEqual(`${name}.coinGecko registry/keplr`, registry.currencies?.[0]?.coinGeckoId, keplr.coinGeckoId, failures);
  }
  assertEqual(`${name}.bip44CoinType registry/keplr`, registry.bip44?.coinType, keplr.bip44CoinType, failures);
  assertEqual(`${name}.gasPriceDenom mobile/registry`, mobileGas.denom, registry.stakeCurrency?.coinMinimalDenom, failures);
  assertNumberEqual(
    `${name}.gasPriceAverage mobile/registry`,
    mobileGas.amount,
    Number(registry.feeCurrencies?.[0]?.gasPriceStep?.average),
    failures
  );
  assertNumberEqual(`${name}.gasPriceAverage mobile/keplr`, mobileGas.amount, keplr.gasPriceAverage, failures);
}

const root = process.cwd();
const mobilePath = path.join(
  root,
  "claw-wallet-mobile/sandbox/sandbox_react_native/constants/chain.ts"
);
const keplrPath = path.join(root, "keplr-wallet/apps/extension/src/config.ts");
const registryMainPath = path.join(root, "keplr-chain-registry/cosmos/clawchain.json");
const registryTestPath = path.join(
  root,
  "keplr-chain-registry/cosmos/clawchain-testnet.json"
);

const mobileSource = readText(mobilePath);
const keplrSource = readText(keplrPath);
const registryMain = readJSON(registryMainPath);
const registryTest = readJSON(registryTestPath);

const mobileMain = parseMobileConfig(mobileSource, "CHAIN_CONFIG");
const mobileTest = parseMobileConfig(mobileSource, "TESTNET_CONFIG");

const keplrMain = parseKeplrConfig(keplrSource, "clawchain-1");
const keplrTest = parseKeplrConfig(keplrSource, "clawchain-testnet-1");

const failures = [];
validateNetwork({
  name: "mainnet",
  registry: registryMain,
  mobile: mobileMain,
  keplr: keplrMain,
  failures,
});
validateNetwork({
  name: "testnet",
  registry: registryTest,
  mobile: mobileTest,
  keplr: keplrTest,
  failures,
});

const liveMode = process.env.WALLET_SYNC_LIVE === "1";
if (liveMode) {
  const liveScope = (process.env.WALLET_SYNC_LIVE_SCOPE || "all").toLowerCase();
  const includeMainnet = liveScope === "all" || liveScope === "mainnet";
  const includeTestnet = liveScope === "all" || liveScope === "testnet";
  if (!includeMainnet && !includeTestnet) {
    failures.push(
      `Invalid WALLET_SYNC_LIVE_SCOPE="${liveScope}" (expected: all|mainnet|testnet)`
    );
  }

  const liveNetworks = [];
  if (includeMainnet) {
    liveNetworks.push({
      name: "mainnet",
      registry: registryMain,
      rpcEndpoint: process.env.WALLET_SYNC_MAINNET_RPC || registryMain.rpc,
      restEndpoint: process.env.WALLET_SYNC_MAINNET_REST || registryMain.rest,
    });
  }
  if (includeTestnet) {
    liveNetworks.push({
      name: "testnet",
      registry: registryTest,
      rpcEndpoint: process.env.WALLET_SYNC_TESTNET_RPC || registryTest.rpc,
      restEndpoint: process.env.WALLET_SYNC_TESTNET_REST || registryTest.rest,
    });
  }

  await runLiveChecks(
    liveNetworks,
    failures
  );
}

if (failures.length > 0) {
  console.error(
    `Wallet chain config sync check failed${liveMode ? " (including live endpoint checks)" : ""}:`
  );
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Wallet chain config sync check passed${liveMode ? " (including live endpoint checks)" : ""}.`
);
