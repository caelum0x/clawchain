/**
 * CometBFT and Cosmos REST transports for Cosmos SDK chains.
 *
 * These transports are purpose-built for the CometBFT JSON-RPC and
 * Cosmos SDK REST (LCD) APIs, which differ from Ethereum's JSON-RPC.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CometBFTTransportOptions {
  /** Request timeout in milliseconds. @default 10_000 */
  timeout?: number
}

export interface CometBFTTransport {
  readonly type: 'cometbft'
  readonly url: string
  request<T = unknown>(method: string, params?: unknown): Promise<T>
}

export interface CosmosRestTransportOptions {
  /** Request timeout in milliseconds. @default 10_000 */
  timeout?: number
}

export interface CosmosRestTransport {
  readonly type: 'cosmosRest'
  readonly url: string
  get<T = unknown>(path: string): Promise<T>
  post<T = unknown>(path: string, body: unknown): Promise<T>
}

// ---------------------------------------------------------------------------
// CometBFT JSON-RPC transport
// ---------------------------------------------------------------------------

/**
 * Creates a CometBFT JSON-RPC transport.
 *
 * @example
 * ```ts
 * import { cometbft } from 'viem/cosmos'
 *
 * const transport = cometbft('https://rpc.clawchain.io')
 * const status = await transport.request('status')
 * ```
 */
export function cometbft(
  url: string,
  options?: CometBFTTransportOptions,
): CometBFTTransport {
  const timeout = options?.timeout ?? 10_000

  return {
    type: 'cometbft' as const,
    url,

    async request<T = unknown>(
      method: string,
      params?: unknown,
    ): Promise<T> {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params: params ?? {},
        }),
        signal: AbortSignal.timeout(timeout),
      })

      if (!res.ok) {
        throw new Error(
          `CometBFT RPC request failed: ${res.status} ${res.statusText}`,
        )
      }

      const data: { result?: T; error?: { message: string; code?: number } } =
        await res.json()

      if (data.error) {
        throw new Error(data.error.message)
      }

      return data.result as T
    },
  }
}

// ---------------------------------------------------------------------------
// Cosmos REST (LCD) transport
// ---------------------------------------------------------------------------

/**
 * Creates a Cosmos SDK REST (LCD) transport.
 *
 * @example
 * ```ts
 * import { cosmosRest } from 'viem/cosmos'
 *
 * const rest = cosmosRest('https://api.clawchain.io')
 * const balances = await rest.get('/cosmos/bank/v1beta1/balances/claw1...')
 * ```
 */
export function cosmosRest(
  url: string,
  options?: CosmosRestTransportOptions,
): CosmosRestTransport {
  const timeout = options?.timeout ?? 10_000
  const baseUrl = url.replace(/\/+$/, '')

  return {
    type: 'cosmosRest' as const,
    url: baseUrl,

    async get<T = unknown>(path: string): Promise<T> {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeout),
      })

      if (!res.ok) {
        throw new Error(
          `Cosmos REST GET failed: ${res.status} ${res.statusText}`,
        )
      }

      return res.json() as Promise<T>
    },

    async post<T = unknown>(path: string, body: unknown): Promise<T> {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      })

      if (!res.ok) {
        throw new Error(
          `Cosmos REST POST failed: ${res.status} ${res.statusText}`,
        )
      }

      return res.json() as Promise<T>
    },
  }
}
