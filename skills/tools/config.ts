/**
 * Shared configuration for ClawChain skill tools.
 *
 * Reads environment variables at import time and exports typed defaults
 * that every tool can reference.  All values have sensible fallbacks for
 * local development (single-node chain on localhost).
 */

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/** Tendermint RPC endpoint. */
export const RPC_URL: string =
  process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657";

/** Cosmos SDK REST / LCD endpoint. */
export const REST_URL: string =
  process.env.CLAWCHAIN_REST_URL ?? "http://localhost:1317";

/** gRPC endpoint (host:port). */
export const GRPC_URL: string =
  process.env.CLAWCHAIN_GRPC_URL ?? "localhost:9090";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * BIP-39 mnemonic used by the agent to sign transactions.
 *
 * IMPORTANT: Never hard-code a real mnemonic.  Set the environment variable
 * `CLAWCHAIN_MNEMONIC` in the agent runtime (e.g. .env file or secret
 * manager).
 */
export const MNEMONIC: string = process.env.CLAWCHAIN_MNEMONIC ?? "";

/** Human-readable agent name used during on-chain registration. */
export const AGENT_NAME: string =
  process.env.CLAWCHAIN_AGENT_NAME ?? "openclaw-agent";

/** HTTP(S) endpoint where the agent is reachable by other agents. */
export const AGENT_ENDPOINT: string =
  process.env.CLAWCHAIN_AGENT_ENDPOINT ?? "";

// ---------------------------------------------------------------------------
// Chain parameters
// ---------------------------------------------------------------------------

/** Bech32 address prefix. */
export const ADDRESS_PREFIX: string =
  process.env.CLAWCHAIN_PREFIX ?? "cosmos";

/** Base token denomination. */
export const DENOM: string =
  process.env.CLAWCHAIN_DENOM ?? "uclaw";

/** Gas price string for automatic fee estimation. */
export const GAS_PRICE: string =
  process.env.CLAWCHAIN_GAS_PRICE ?? "0.025uclaw";

// ---------------------------------------------------------------------------
// Proof generation
// ---------------------------------------------------------------------------

/**
 * Absolute path to the `clawproof` Go binary.
 *
 * If left empty, the SDK falls back to looking up "clawproof" on $PATH.
 */
export const PROOF_BINARY_PATH: string =
  process.env.CLAWCHAIN_PROOF_BINARY ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Throw an informative error if the mnemonic has not been configured. */
export function requireMnemonic(): string {
  if (!MNEMONIC) {
    throw new Error(
      "CLAWCHAIN_MNEMONIC is not set. " +
        "Export the environment variable before running this tool.",
    );
  }
  return MNEMONIC;
}

/**
 * Build the standard ClawChainClientOptions object from the shared config.
 * Suitable for read-only connections (no mnemonic required).
 */
export function readOnlyClientOptions() {
  return {
    rpcUrl: RPC_URL,
    grpcUrl: GRPC_URL,
    prefix: ADDRESS_PREFIX,
    gasPrice: GAS_PRICE,
  } as const;
}

/**
 * Build the standard ClawChainClientOptions object that includes the
 * mnemonic so the client can sign transactions.
 */
export function signingClientOptions() {
  return {
    ...readOnlyClientOptions(),
    mnemonic: requireMnemonic(),
  } as const;
}

/**
 * Build ClawChainAgentOptions from the shared config.
 */
export function agentOptions() {
  return {
    name: AGENT_NAME,
    mnemonic: requireMnemonic(),
    rpcUrl: RPC_URL,
    grpcUrl: GRPC_URL,
    proofBinaryPath: PROOF_BINARY_PATH || undefined,
    prefix: ADDRESS_PREFIX,
    endpoint: AGENT_ENDPOINT,
  } as const;
}
