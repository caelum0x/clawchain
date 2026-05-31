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

import * as privacyTx from "../generated/proto/clawchain/privacy/v1/tx.js";
import * as agentTx from "../generated/proto/clawchain/agent/v1/tx.js";
import * as marketplaceTx from "../generated/proto/clawchain/marketplace/v1/tx.js";
import * as oracleTx from "../generated/proto/clawchain/oracle/v1beta1/tx.js";

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

/** Oracle module (`x/oracle`) message codecs. */
export const clawchainOracleTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("clawchain.oracle.v1beta1", oracleTx);

/**
 * All clawchain custom-module message codecs, ready to register.
 * Additional modules (modelregistry, reputation, messaging, …) are appended here as
 * their generated codecs are wired in.
 */
export const clawchainCustomTypes: ReadonlyArray<[string, GeneratedType]> = [
  ...clawchainPrivacyTypes,
  ...clawchainAgentTypes,
  ...clawchainMarketplaceTypes,
  ...clawchainOracleTypes,
];

/**
 * Build a cosmjs `Registry` containing the standard cosmos-sdk types plus every
 * clawchain custom-module type. Use this anywhere a `SigningStargateClient` needs to
 * encode `/clawchain.*` messages.
 */
export function createClawchainRegistry(): Registry {
  return new Registry([...defaultRegistryTypes, ...clawchainCustomTypes]);
}
