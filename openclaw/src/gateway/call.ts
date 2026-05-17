import { randomUUID } from "node:crypto";
import type { OpenClawConfig } from "../config/config.js";
import {
  loadConfig,
  resolveConfigPath,
  resolveGatewayPort,
  resolveStateDir,
} from "../config/config.js";
import { loadOrCreateDeviceIdentity } from "../infra/device-identity.js";
import { pickPrimaryTailnetIPv4 } from "../infra/tailnet.js";
import { loadGatewayTlsRuntime } from "../infra/tls/gateway.js";
import {
  GATEWAY_CLIENT_MODES,
  GATEWAY_CLIENT_NAMES,
  type GatewayClientMode,
  type GatewayClientName,
} from "../utils/message-channel.js";
import { GatewayClient } from "./client.js";
import { pickPrimaryLanIPv4 } from "./net.js";
import { PROTOCOL_VERSION } from "./protocol/index.js";
import type {
  ChainAgentsDelegateParams,
  ChainAgentsDelegateResult,
  ChainAgentsInfoParams,
  ChainAgentsInfoResult,
  ChainAgentsListParams,
  ChainAgentsListResult,
  ChainAgentsReputationParams,
  ChainAgentsReputationResult,
  ChainAgentsTasksParams,
  ChainAgentsTasksResult,
  ChainStatusResult,
  ChainWalletBalanceParams,
  ChainWalletBalanceResult,
  ChainWalletHistoryParams,
  ChainWalletHistoryResult,
  ChainWalletStakingDelegationsParams,
  ChainWalletStakingDelegationsResult,
  ChainWalletStakingRewardsParams,
  ChainWalletStakingRewardsResult,
  ChainWalletTransferParams,
  ChainWalletTransferResult,
  RuntimeStatusResult,
} from "./protocol/index.js";

export type CallGatewayOptions = {
  url?: string;
  token?: string;
  password?: string;
  tlsFingerprint?: string;
  config?: OpenClawConfig;
  method: string;
  params?: unknown;
  expectFinal?: boolean;
  timeoutMs?: number;
  clientName?: GatewayClientName;
  clientDisplayName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: GatewayClientMode;
  instanceId?: string;
  minProtocol?: number;
  maxProtocol?: number;
  /**
   * Overrides the config path shown in connection error details.
   * Does not affect config loading; callers still control auth via opts.token/password/env/config.
   */
  configPath?: string;
};

export type GatewayConnectionDetails = {
  url: string;
  urlSource: string;
  bindDetail?: string;
  remoteFallbackNote?: string;
  message: string;
};

export type ExplicitGatewayAuth = {
  token?: string;
  password?: string;
};

export function resolveExplicitGatewayAuth(opts?: ExplicitGatewayAuth): ExplicitGatewayAuth {
  const token =
    typeof opts?.token === "string" && opts.token.trim().length > 0 ? opts.token.trim() : undefined;
  const password =
    typeof opts?.password === "string" && opts.password.trim().length > 0
      ? opts.password.trim()
      : undefined;
  return { token, password };
}

export function ensureExplicitGatewayAuth(params: {
  urlOverride?: string;
  auth: ExplicitGatewayAuth;
  errorHint: string;
  configPath?: string;
}): void {
  if (!params.urlOverride) {
    return;
  }
  if (params.auth.token || params.auth.password) {
    return;
  }
  const message = [
    "gateway url override requires explicit credentials",
    params.errorHint,
    params.configPath ? `Config: ${params.configPath}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
  throw new Error(message);
}

export function buildGatewayConnectionDetails(
  options: { config?: OpenClawConfig; url?: string; configPath?: string } = {},
): GatewayConnectionDetails {
  const config = options.config ?? loadConfig();
  const configPath =
    options.configPath ?? resolveConfigPath(process.env, resolveStateDir(process.env));
  const isRemoteMode = config.gateway?.mode === "remote";
  const remote = isRemoteMode ? config.gateway?.remote : undefined;
  const tlsEnabled = config.gateway?.tls?.enabled === true;
  const localPort = resolveGatewayPort(config);
  const tailnetIPv4 = pickPrimaryTailnetIPv4();
  const bindMode = config.gateway?.bind ?? "loopback";
  const preferTailnet = bindMode === "tailnet" && !!tailnetIPv4;
  const preferLan = bindMode === "lan";
  const lanIPv4 = preferLan ? pickPrimaryLanIPv4() : undefined;
  const scheme = tlsEnabled ? "wss" : "ws";
  const localUrl =
    preferTailnet && tailnetIPv4
      ? `${scheme}://${tailnetIPv4}:${localPort}`
      : preferLan && lanIPv4
        ? `${scheme}://${lanIPv4}:${localPort}`
        : `${scheme}://127.0.0.1:${localPort}`;
  const urlOverride =
    typeof options.url === "string" && options.url.trim().length > 0
      ? options.url.trim()
      : undefined;
  const remoteUrl =
    typeof remote?.url === "string" && remote.url.trim().length > 0 ? remote.url.trim() : undefined;
  const remoteMisconfigured = isRemoteMode && !urlOverride && !remoteUrl;
  const url = urlOverride || remoteUrl || localUrl;
  const urlSource = urlOverride
    ? "cli --url"
    : remoteUrl
      ? "config gateway.remote.url"
      : remoteMisconfigured
        ? "missing gateway.remote.url (fallback local)"
        : preferTailnet && tailnetIPv4
          ? `local tailnet ${tailnetIPv4}`
          : preferLan && lanIPv4
            ? `local lan ${lanIPv4}`
            : "local loopback";
  const remoteFallbackNote = remoteMisconfigured
    ? "Warn: gateway.mode=remote but gateway.remote.url is missing; set gateway.remote.url or switch gateway.mode=local."
    : undefined;
  const bindDetail = !urlOverride && !remoteUrl ? `Bind: ${bindMode}` : undefined;
  const message = [
    `Gateway target: ${url}`,
    `Source: ${urlSource}`,
    `Config: ${configPath}`,
    bindDetail,
    remoteFallbackNote,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    url,
    urlSource,
    bindDetail,
    remoteFallbackNote,
    message,
  };
}

export async function callGateway<T = Record<string, unknown>>(
  opts: CallGatewayOptions,
): Promise<T> {
  const timeoutMs =
    typeof opts.timeoutMs === "number" && Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 10_000;
  const safeTimerTimeoutMs = Math.max(1, Math.min(Math.floor(timeoutMs), 2_147_483_647));
  const config = opts.config ?? loadConfig();
  const isRemoteMode = config.gateway?.mode === "remote";
  const remote = isRemoteMode ? config.gateway?.remote : undefined;
  const urlOverride =
    typeof opts.url === "string" && opts.url.trim().length > 0 ? opts.url.trim() : undefined;
  const explicitAuth = resolveExplicitGatewayAuth({ token: opts.token, password: opts.password });
  ensureExplicitGatewayAuth({
    urlOverride,
    auth: explicitAuth,
    errorHint: "Fix: pass --token or --password (or gatewayToken in tools).",
    configPath: opts.configPath ?? resolveConfigPath(process.env, resolveStateDir(process.env)),
  });
  const remoteUrl =
    typeof remote?.url === "string" && remote.url.trim().length > 0 ? remote.url.trim() : undefined;
  if (isRemoteMode && !urlOverride && !remoteUrl) {
    const configPath =
      opts.configPath ?? resolveConfigPath(process.env, resolveStateDir(process.env));
    throw new Error(
      [
        "gateway remote mode misconfigured: gateway.remote.url missing",
        `Config: ${configPath}`,
        "Fix: set gateway.remote.url, or set gateway.mode=local.",
      ].join("\n"),
    );
  }
  const authToken = config.gateway?.auth?.token;
  const authPassword = config.gateway?.auth?.password;
  const connectionDetails = buildGatewayConnectionDetails({
    config,
    url: urlOverride,
    ...(opts.configPath ? { configPath: opts.configPath } : {}),
  });
  const url = connectionDetails.url;
  const useLocalTls =
    config.gateway?.tls?.enabled === true && !urlOverride && !remoteUrl && url.startsWith("wss://");
  const tlsRuntime = useLocalTls ? await loadGatewayTlsRuntime(config.gateway?.tls) : undefined;
  const remoteTlsFingerprint =
    isRemoteMode && !urlOverride && remoteUrl && typeof remote?.tlsFingerprint === "string"
      ? remote.tlsFingerprint.trim()
      : undefined;
  const overrideTlsFingerprint =
    typeof opts.tlsFingerprint === "string" ? opts.tlsFingerprint.trim() : undefined;
  const tlsFingerprint =
    overrideTlsFingerprint ||
    remoteTlsFingerprint ||
    (tlsRuntime?.enabled ? tlsRuntime.fingerprintSha256 : undefined);
  const token =
    explicitAuth.token ||
    (!urlOverride
      ? isRemoteMode
        ? typeof remote?.token === "string" && remote.token.trim().length > 0
          ? remote.token.trim()
          : undefined
        : process.env.OPENCLAW_GATEWAY_TOKEN?.trim() ||
          process.env.CLAWDBOT_GATEWAY_TOKEN?.trim() ||
          (typeof authToken === "string" && authToken.trim().length > 0
            ? authToken.trim()
            : undefined)
      : undefined);
  const password =
    explicitAuth.password ||
    (!urlOverride
      ? process.env.OPENCLAW_GATEWAY_PASSWORD?.trim() ||
        process.env.CLAWDBOT_GATEWAY_PASSWORD?.trim() ||
        (isRemoteMode
          ? typeof remote?.password === "string" && remote.password.trim().length > 0
            ? remote.password.trim()
            : undefined
          : typeof authPassword === "string" && authPassword.trim().length > 0
            ? authPassword.trim()
            : undefined)
      : undefined);

  const formatCloseError = (code: number, reason: string) => {
    const reasonText = reason?.trim() || "no close reason";
    const hint =
      code === 1006 ? "abnormal closure (no close frame)" : code === 1000 ? "normal closure" : "";
    const suffix = hint ? ` ${hint}` : "";
    return `gateway closed (${code}${suffix}): ${reasonText}\n${connectionDetails.message}`;
  };
  const formatTimeoutError = () =>
    `gateway timeout after ${timeoutMs}ms\n${connectionDetails.message}`;
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    let ignoreClose = false;
    const stop = (err?: Error, value?: T) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve(value as T);
      }
    };

    const client = new GatewayClient({
      url,
      token,
      password,
      tlsFingerprint,
      instanceId: opts.instanceId ?? randomUUID(),
      clientName: opts.clientName ?? GATEWAY_CLIENT_NAMES.CLI,
      clientDisplayName: opts.clientDisplayName,
      clientVersion: opts.clientVersion ?? "dev",
      platform: opts.platform,
      mode: opts.mode ?? GATEWAY_CLIENT_MODES.CLI,
      role: "operator",
      scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
      deviceIdentity: loadOrCreateDeviceIdentity(),
      minProtocol: opts.minProtocol ?? PROTOCOL_VERSION,
      maxProtocol: opts.maxProtocol ?? PROTOCOL_VERSION,
      onHelloOk: async () => {
        try {
          const result = await client.request<T>(opts.method, opts.params, {
            expectFinal: opts.expectFinal,
          });
          ignoreClose = true;
          stop(undefined, result);
          client.stop();
        } catch (err) {
          ignoreClose = true;
          client.stop();
          stop(err as Error);
        }
      },
      onClose: (code, reason) => {
        if (settled || ignoreClose) {
          return;
        }
        ignoreClose = true;
        client.stop();
        stop(new Error(formatCloseError(code, reason)));
      },
    });

    const timer = setTimeout(() => {
      ignoreClose = true;
      client.stop();
      stop(new Error(formatTimeoutError()));
    }, safeTimerTimeoutMs);

    client.start();
  });
}

export function randomIdempotencyKey() {
  return randomUUID();
}

export const callGatewayChain = {
  status: async (opts: Omit<CallGatewayOptions, "method" | "params"> = {}) =>
    await callGateway<ChainStatusResult>({ ...opts, method: "chain.status", params: {} }),
  runtimeStatus: async (opts: Omit<CallGatewayOptions, "method" | "params"> = {}) =>
    await callGateway<RuntimeStatusResult>({ ...opts, method: "runtime.status", params: {} }),
  agents: {
    list: async (
      params: ChainAgentsListParams = {},
      opts: Omit<CallGatewayOptions, "method" | "params"> = {},
    ) => await callGateway<ChainAgentsListResult>({ ...opts, method: "chain.agents.list", params }),
    info: async (
      params: ChainAgentsInfoParams,
      opts: Omit<CallGatewayOptions, "method" | "params"> = {},
    ) => await callGateway<ChainAgentsInfoResult>({ ...opts, method: "chain.agents.info", params }),
    tasks: async (
      params: ChainAgentsTasksParams = {},
      opts: Omit<CallGatewayOptions, "method" | "params"> = {},
    ) => await callGateway<ChainAgentsTasksResult>({ ...opts, method: "chain.agents.tasks", params }),
    delegate: async (
      params: ChainAgentsDelegateParams,
      opts: Omit<CallGatewayOptions, "method" | "params"> = {},
    ) =>
      await callGateway<ChainAgentsDelegateResult>({
        ...opts,
        method: "chain.agents.delegate",
        params,
      }),
    reputation: async (
      params: ChainAgentsReputationParams,
      opts: Omit<CallGatewayOptions, "method" | "params"> = {},
    ) =>
      await callGateway<ChainAgentsReputationResult>({
        ...opts,
        method: "chain.agents.reputation",
        params,
      }),
  },
  wallet: {
    balance: async (
      params: ChainWalletBalanceParams = {},
      opts: Omit<CallGatewayOptions, "method" | "params"> = {},
    ) =>
      await callGateway<ChainWalletBalanceResult>({
        ...opts,
        method: "chain.wallet.balance",
        params,
      }),
    transfer: async (
      params: ChainWalletTransferParams,
      opts: Omit<CallGatewayOptions, "method" | "params"> = {},
    ) =>
      await callGateway<ChainWalletTransferResult>({
        ...opts,
        method: "chain.wallet.transfer",
        params,
      }),
    stakingDelegations: async (
      params: ChainWalletStakingDelegationsParams = {},
      opts: Omit<CallGatewayOptions, "method" | "params"> = {},
    ) =>
      await callGateway<ChainWalletStakingDelegationsResult>({
        ...opts,
        method: "chain.wallet.staking.delegations",
        params,
      }),
    stakingRewards: async (
      params: ChainWalletStakingRewardsParams = {},
      opts: Omit<CallGatewayOptions, "method" | "params"> = {},
    ) =>
      await callGateway<ChainWalletStakingRewardsResult>({
        ...opts,
        method: "chain.wallet.staking.rewards",
        params,
      }),
    history: async (
      params: ChainWalletHistoryParams = {},
      opts: Omit<CallGatewayOptions, "method" | "params"> = {},
    ) =>
      await callGateway<ChainWalletHistoryResult>({
        ...opts,
        method: "chain.wallet.history",
        params,
      }),
  },
};
