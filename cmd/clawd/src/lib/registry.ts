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
  MsgBatchPrivateTransfer,
  MsgPrivateTransfer,
  MsgRegisterViewKey,
  MsgShield,
  MsgUnshield,
  MsgUpdateParams as MsgUpdatePrivacyParams,
} from "../generated/proto/clawchain/privacy/v1/tx.js";

/**
 * ts-proto v2 emits codecs backed by `@bufbuild/protobuf` wire types. These are
 * structurally compatible at runtime with what cosmjs's `Registry` invokes
 * (`encode(value).finish()`, `decode(bytes)`, `fromPartial(obj)`), but their static
 * types differ from cosmjs's protobufjs-based `TsProtoGeneratedType`. Bridge the two
 * with a single explicit cast rather than scattering `as any` across every entry.
 */
const asGeneratedType = (codec: unknown): GeneratedType => codec as GeneratedType;

/** Privacy module (`x/privacy`) message codecs. */
export const clawchainPrivacyTypes: ReadonlyArray<[string, GeneratedType]> = [
  ["/clawchain.privacy.v1.MsgShield", asGeneratedType(MsgShield)],
  ["/clawchain.privacy.v1.MsgUnshield", asGeneratedType(MsgUnshield)],
  ["/clawchain.privacy.v1.MsgPrivateTransfer", asGeneratedType(MsgPrivateTransfer)],
  ["/clawchain.privacy.v1.MsgRegisterViewKey", asGeneratedType(MsgRegisterViewKey)],
  ["/clawchain.privacy.v1.MsgBatchPrivateTransfer", asGeneratedType(MsgBatchPrivateTransfer)],
  ["/clawchain.privacy.v1.MsgUpdateParams", asGeneratedType(MsgUpdatePrivacyParams)],
];

/**
 * All clawchain custom-module message codecs, ready to register.
 * Additional modules (oracle, agent, marketplace, …) are appended here as their
 * generated codecs are wired in.
 */
export const clawchainCustomTypes: ReadonlyArray<[string, GeneratedType]> = [
  ...clawchainPrivacyTypes,
];

/**
 * Build a cosmjs `Registry` containing the standard cosmos-sdk types plus every
 * clawchain custom-module type. Use this anywhere a `SigningStargateClient` needs to
 * encode `/clawchain.*` messages.
 */
export function createClawchainRegistry(): Registry {
  return new Registry([...defaultRegistryTypes, ...clawchainCustomTypes]);
}
