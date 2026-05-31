/**
 * Helper for creating a `SigningStargateClient` wired with the clawchain custom-module
 * registry. Every command that submits a `/clawchain.*` transaction MUST connect through
 * this helper — connecting via `SigningStargateClient.connectWithSigner` directly uses the
 * default registry, which cannot encode any custom-module message.
 */

import { OfflineSigner } from "@cosmjs/proto-signing";
import {
  SigningStargateClient,
  SigningStargateClientOptions,
} from "@cosmjs/stargate";

import { createClawchainRegistry } from "./registry.js";

/**
 * Connect a `SigningStargateClient` that can encode clawchain custom-module messages.
 *
 * @param rpcUrl  Tendermint RPC endpoint.
 * @param signer  Offline signer (e.g. a `DirectSecp256k1HdWallet`).
 * @param options Standard client options. Any caller-supplied `registry` is overridden
 *                with the clawchain registry to guarantee custom types are encodable.
 */
export async function connectClawchainSigningClient(
  rpcUrl: string,
  signer: OfflineSigner,
  options: Omit<SigningStargateClientOptions, "registry"> = {},
): Promise<SigningStargateClient> {
  return SigningStargateClient.connectWithSigner(rpcUrl, signer, {
    ...options,
    registry: createClawchainRegistry(),
  });
}
