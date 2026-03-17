#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = "/Users/arhansubasi/new-blokchain";

const registryMainnetPath = path.join(
  repoRoot,
  "keplr-chain-registry/cosmos/clawchain.json"
);
const registryTestnetPath = path.join(
  repoRoot,
  "keplr-chain-registry/cosmos/clawchain-testnet.json"
);
const keplrConfigPath = path.join(
  repoRoot,
  "keplr-wallet/apps/extension/src/config.ts"
);
const mobileConfigPath = path.join(
  repoRoot,
  "claw-wallet-mobile/sandbox/sandbox_react_native/constants/chain.ts"
);

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function getObjectSourceByChainId(source, chainId) {
  const chainIdToken = `chainId: "${chainId}"`;
  const idx = source.indexOf(chainIdToken);
  if (idx === -1) return null;

  let start = idx;
  while (start >= 0 && source[start] !== "{") {
    start--;
  }
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

function extractString(objSource, key) {
  const m = objSource.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  return m ? m[1] : null;
}

function extractNumber(objSource, key) {
  const m = objSource.match(new RegExp(`${key}:\\s*([0-9.]+)`));
  return m ? Number(m[1]) : null;
}

function ensureEqual(errors, label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label} mismatch: actual="${actual}" expected="${expected}"`);
  }
}

function verifyKeplrConfig(registry, keplrSource, chainId, errors) {
  const obj = getObjectSourceByChainId(keplrSource, chainId);
  if (!obj) {
    errors.push(`keplr-wallet missing chain object for ${chainId}`);
    return;
  }

  ensureEqual(errors, `keplr ${chainId} rpc`, extractString(obj, "rpc"), registry.rpc);
  ensureEqual(errors, `keplr ${chainId} rest`, extractString(obj, "rest"), registry.rest);
  ensureEqual(
    errors,
    `keplr ${chainId} bech32 prefix`,
    obj.includes('defaultBech32Config("claw")') ? "claw" : null,
    registry.bech32Config.bech32PrefixAccAddr
  );
  ensureEqual(
    errors,
    `keplr ${chainId} coinType`,
    extractNumber(obj, "coinType"),
    registry.bip44.coinType
  );
  ensureEqual(
    errors,
    `keplr ${chainId} gas average`,
    extractNumber(obj, "average"),
    registry.feeCurrencies[0].gasPriceStep.average
  );
}

function verifyMobileConfig(registry, mobileSource, chainId, errors) {
  const obj = getObjectSourceByChainId(mobileSource, chainId);
  if (!obj) {
    errors.push(`claw-wallet-mobile missing chain object for ${chainId}`);
    return;
  }

  ensureEqual(errors, `mobile ${chainId} rpc`, extractString(obj, "rpc"), registry.rpc);
  ensureEqual(errors, `mobile ${chainId} rest`, extractString(obj, "rest"), registry.rest);
  ensureEqual(
    errors,
    `mobile ${chainId} bech32Prefix`,
    extractString(obj, "bech32Prefix"),
    registry.bech32Config.bech32PrefixAccAddr
  );
  ensureEqual(
    errors,
    `mobile ${chainId} denom`,
    extractString(obj, "denom"),
    registry.currencies[0].coinMinimalDenom
  );
  ensureEqual(
    errors,
    `mobile ${chainId} coinType`,
    extractNumber(obj, "bip44CoinType"),
    registry.bip44.coinType
  );
  ensureEqual(
    errors,
    `mobile ${chainId} gas average`,
    extractNumber(obj, "average"),
    registry.feeCurrencies[0].gasPriceStep.average
  );
}

const registryMainnet = readJSON(registryMainnetPath);
const registryTestnet = readJSON(registryTestnetPath);
const keplrSource = readText(keplrConfigPath);
const mobileSource = readText(mobileConfigPath);

const errors = [];

verifyKeplrConfig(registryMainnet, keplrSource, registryMainnet.chainId, errors);
verifyKeplrConfig(registryTestnet, keplrSource, registryTestnet.chainId, errors);
verifyMobileConfig(registryMainnet, mobileSource, registryMainnet.chainId, errors);
verifyMobileConfig(registryTestnet, mobileSource, registryTestnet.chainId, errors);

if (errors.length > 0) {
  console.error("Chain sync verification failed:");
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log(
  `Chain sync verification passed for ${registryMainnet.chainId} and ${registryTestnet.chainId}.`
);
