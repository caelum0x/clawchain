/**
 * Shared cosmjs protobuf registry for clawchain custom-module messages.
 *
 * cosmjs's default registry only knows the standard cosmos-sdk message types, so
 * `signAndBroadcast` rejects any `/clawchain.*` message with "Unregistered type url".
 * This module registers the generated codecs for every custom module alongside the
 * cosmos defaults so clawd can actually encode and submit custom-module transactions.
 */

import { GeneratedType, Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";
import {
  MsgExecuteContract,
  MsgInstantiateContract,
  MsgStoreCode,
} from "cosmjs-types/cosmwasm/wasm/v1/tx.js";

import * as privacyTx from "../generated/proto/clawchain/privacy/v1/tx.js";
import * as agentTx from "../generated/proto/clawchain/agent/v1/tx.js";
import * as marketplaceTx from "../generated/proto/clawchain/marketplace/v1/tx.js";
import * as oracleTx from "../generated/proto/clawchain/oracle/v1beta1/tx.js";
import * as modelregistryTx from "../generated/proto/clawchain/modelregistry/v1/tx.js";
import * as reputationTx from "../generated/proto/clawchain/reputation/v1/tx.js";
import * as messagingTx from "../generated/proto/clawchain/messaging/v1/tx.js";
import * as governanceTx from "../generated/proto/clawchain/governance/v1/tx.js";
import * as clawchainTx from "../generated/proto/clawchain/clawchain/v1/tx.js";
import * as tokenfactoryTx from "../generated/proto/osmosis/tokenfactory/v1beta1/tx.js";

/**
 * ts-proto v2 emits codecs backed by `@bufbuild/protobuf` wire types. These are
 * structurally compatible at runtime with what cosmjs's `Registry` invokes
 * (`encode(value).finish()`, `decode(bytes)`, `fromPartial(obj)`), but their static
 * types differ from cosmjs's protobufjs-based `TsProtoGeneratedType`. Bridge the two
 * with a single explicit cast rather than scattering `as any` across every entry.
 */
const asGeneratedType = (codec: unknown): GeneratedType => codec as GeneratedType;

/**
 * Build registry entries for a module: maps each `MsgXxx` codec to its fully-qualified
 * type url `/<protoPackage>.MsgXxx`. Response types and non-Msg codecs are skipped.
 */
function moduleTypes(
  protoPackage: string,
  txModule: Record<string, unknown>,
): Array<[string, GeneratedType]> {
  return Object.entries(txModule)
    .filter(
      ([name, codec]) =>
        name.startsWith("Msg") &&
        !name.endsWith("Response") &&
        codec != null &&
        typeof (codec as { encode?: unknown }).encode === "function",
    )
    .map(([name, codec]) => [`/${protoPackage}.${name}`, asGeneratedType(codec)]);
}

/** Privacy module (`x/privacy`) message codecs. */
export const clawchainPrivacyTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("clawchain.privacy.v1", privacyTx);

/** Agent module (`x/agent`) message codecs. */
export const clawchainAgentTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("clawchain.agent.v1", agentTx);

/** Marketplace module (`x/marketplace`) message codecs. */
export const clawchainMarketplaceTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("clawchain.marketplace.v1", marketplaceTx);

/**
 * Oracle module (`x/oracle`) message codecs.
 *
 * The oracle Go types were originally generated from a stale `terra/oracle/v1beta1`
 * proto and registered under `terra.oracle.v1beta1.*`. Gap B regenerated `x/oracle`
 * from the repo's actual source proto (`proto/clawchain/oracle/v1beta1/tx.proto`,
 * which declares `package clawchain.oracle.v1beta1` and carries the
 * `cosmos.msg.v1.service` annotation), so the chain now resolves these msgs under
 * `clawchain.oracle.v1beta1.*` — matching every other custom module.
 */
export const clawchainOracleTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("clawchain.oracle.v1beta1", oracleTx);

/** Model-registry module (`x/modelregistry`) message codecs. */
export const clawchainModelRegistryTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("clawchain.modelregistry.v1", modelregistryTx);

/** Reputation module (`x/reputation`) message codecs. */
export const clawchainReputationTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("clawchain.reputation.v1", reputationTx);

/** Messaging module (`x/messaging`) message codecs. */
export const clawchainMessagingTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("clawchain.messaging.v1", messagingTx);

/** Governance module (`x/governance`) message codecs. */
export const clawchainGovernanceTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("clawchain.governance.v1", governanceTx);

/** Core clawchain module (`x/clawchain`) message codecs. */
export const clawchainCoreTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("clawchain.clawchain.v1", clawchainTx);

/**
 * Tokenfactory module (`x/tokenfactory`) message codecs.
 *
 * The proto deliberately uses the Osmosis-compatible package
 * `osmosis.tokenfactory.v1beta1` (see proto/osmosis/tokenfactory/v1beta1/tx.proto):
 * the Astroport DEX and app/wasm_tokenfactory.go both key off the
 * `/osmosis.tokenfactory.v1beta1.Msg*` type URLs. Registering these lets clawd
 * create + mint factory denoms (e.g. AI model tokens `factory/<issuer>/<modelid>`).
 */
export const tokenfactoryTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("osmosis.tokenfactory.v1beta1", tokenfactoryTx);

/**
 * CosmWasm message codecs. MsgExecuteContract drives DEX pair/liquidity flows;
 * MsgStoreCode + MsgInstantiateContract let clawd upload and instantiate
 * contracts (e.g. `clawd model-vault deploy`).
 */
export const cosmwasmTypes: ReadonlyArray<[string, GeneratedType]> = [
  ["/cosmwasm.wasm.v1.MsgExecuteContract", asGeneratedType(MsgExecuteContract)],
  ["/cosmwasm.wasm.v1.MsgStoreCode", asGeneratedType(MsgStoreCode)],
  ["/cosmwasm.wasm.v1.MsgInstantiateContract", asGeneratedType(MsgInstantiateContract)],
];

/**
 * All clawchain custom-module message codecs, ready to register. Covers every
 * custom module's `Msg` service (privacy, agent, marketplace, oracle,
 * modelregistry, reputation, messaging, governance, clawchain).
 */
export const clawchainCustomTypes: ReadonlyArray<[string, GeneratedType]> = [
  ...clawchainPrivacyTypes,
  ...clawchainAgentTypes,
  ...clawchainMarketplaceTypes,
  ...clawchainOracleTypes,
  ...clawchainModelRegistryTypes,
  ...clawchainReputationTypes,
  ...clawchainMessagingTypes,
  ...clawchainGovernanceTypes,
  ...clawchainCoreTypes,
  ...tokenfactoryTypes,
  ...cosmwasmTypes,
];

/**
 * Build a cosmjs `Registry` containing the standard cosmos-sdk types plus every
 * clawchain custom-module type. Use this anywhere a `SigningStargateClient` needs to
 * encode `/clawchain.*` messages.
 */
export function createClawchainRegistry(): Registry {
  return new Registry([...defaultRegistryTypes, ...clawchainCustomTypes]);
}
