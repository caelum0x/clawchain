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
import * as modelregistryTx from "../generated/proto/clawchain/modelregistry/v1/tx.js";
import * as reputationTx from "../generated/proto/clawchain/reputation/v1/tx.js";
import * as messagingTx from "../generated/proto/clawchain/messaging/v1/tx.js";
import * as governanceTx from "../generated/proto/clawchain/governance/v1/tx.js";
import * as clawchainTx from "../generated/proto/clawchain/clawchain/v1/tx.js";

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
 * NOTE: the on-chain Go types register under `terra.oracle.v1beta1.*` (the `.pb.go`
 * is generated from `terra/oracle/v1beta1/tx.proto`), even though the proto SOURCE
 * file in this repo declares `package clawchain.oracle.v1beta1`. The protobuf wire
 * format is package-independent, so the generated codecs are correct — but the
 * registry MUST map them to the `terra.oracle.v1beta1` type urls the chain resolves,
 * or tx parsing fails with "unable to resolve type URL". (Tracked as Gap B.)
 */
export const clawchainOracleTypes: ReadonlyArray<[string, GeneratedType]> =
  moduleTypes("terra.oracle.v1beta1", oracleTx);

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
];

/**
 * Build a cosmjs `Registry` containing the standard cosmos-sdk types plus every
 * clawchain custom-module type. Use this anywhere a `SigningStargateClient` needs to
 * encode `/clawchain.*` messages.
 */
export function createClawchainRegistry(): Registry {
  return new Registry([...defaultRegistryTypes, ...clawchainCustomTypes]);
}
