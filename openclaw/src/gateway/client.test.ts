import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceIdentity } from "../infra/device-identity.js";

const wsInstances = vi.hoisted((): MockWebSocket[] => []);
const clearDeviceAuthTokenMock = vi.hoisted(() => vi.fn());
const logDebugMock = vi.hoisted(() => vi.fn());

type WsEvent = "open" | "message" | "close" | "error";
type WsEventHandlers = {
  open: () => void;
  message: (data: string | Buffer) => void;
  close: (code: number, reason: Buffer) => void;
  error: (err: unknown) => void;
};

class MockWebSocket {
  private openHandlers: WsEventHandlers["open"][] = [];
  private messageHandlers: WsEventHandlers["message"][] = [];
  private closeHandlers: WsEventHandlers["close"][] = [];
  private errorHandlers: WsEventHandlers["error"][] = [];

  constructor(_url: string, _options?: unknown) {
    wsInstances.push(this);
  }

  on(event: "open", handler: WsEventHandlers["open"]): void;
  on(event: "message", handler: WsEventHandlers["message"]): void;
  on(event: "close", handler: WsEventHandlers["close"]): void;
  on(event: "error", handler: WsEventHandlers["error"]): void;
  on(event: WsEvent, handler: WsEventHandlers[WsEvent]): void {
    switch (event) {
      case "open":
        this.openHandlers.push(handler as WsEventHandlers["open"]);
        return;
      case "message":
        this.messageHandlers.push(handler as WsEventHandlers["message"]);
        return;
      case "close":
        this.closeHandlers.push(handler as WsEventHandlers["close"]);
        return;
      case "error":
        this.errorHandlers.push(handler as WsEventHandlers["error"]);
        return;
      default:
        return;
    }
  }

  close(_code?: number, _reason?: string): void {}

  emitClose(code: number, reason: string): void {
    for (const handler of this.closeHandlers) {
      handler(code, Buffer.from(reason));
    }
  }
}

vi.mock("ws", () => ({
  WebSocket: MockWebSocket,
}));

vi.mock("../infra/device-auth-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../infra/device-auth-store.js")>();
  return {
    ...actual,
    clearDeviceAuthToken: (...args: unknown[]) => clearDeviceAuthTokenMock(...args),
  };
});

vi.mock("../logger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../logger.js")>();
  return {
    ...actual,
    logDebug: (...args: unknown[]) => logDebugMock(...args),
  };
});

const { GatewayClient } = await import("./client.js");

function getLatestWs(): MockWebSocket {
  const ws = wsInstances.at(-1);
  if (!ws) {
    throw new Error("missing mock websocket instance");
  }
  return ws;
}

describe("GatewayClient close handling", () => {
  beforeEach(() => {
    wsInstances.length = 0;
    clearDeviceAuthTokenMock.mockReset();
    logDebugMock.mockReset();
  });

  it("clears stale token on device token mismatch close", () => {
    const onClose = vi.fn();
    const identity: DeviceIdentity = {
      deviceId: "dev-1",
      privateKeyPem: "private-key",
      publicKeyPem: "public-key",
    };
    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
      deviceIdentity: identity,
      onClose,
    });

    client.start();
    getLatestWs().emitClose(
      1008,
      "unauthorized: DEVICE token mismatch (rotate/reissue device token)",
    );

    expect(clearDeviceAuthTokenMock).toHaveBeenCalledWith({ deviceId: "dev-1", role: "operator" });
    expect(onClose).toHaveBeenCalledWith(
      1008,
      "unauthorized: DEVICE token mismatch (rotate/reissue device token)",
    );
    client.stop();
  });

  it("does not break close flow when token clear throws", () => {
    clearDeviceAuthTokenMock.mockImplementation(() => {
      throw new Error("disk unavailable");
    });
    const onClose = vi.fn();
    const identity: DeviceIdentity = {
      deviceId: "dev-2",
      privateKeyPem: "private-key",
      publicKeyPem: "public-key",
    };
    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
      deviceIdentity: identity,
      onClose,
    });

    client.start();
    expect(() => {
      getLatestWs().emitClose(1008, "unauthorized: device token mismatch");
    }).not.toThrow();

    expect(logDebugMock).toHaveBeenCalledWith(
      expect.stringContaining("failed clearing stale device-auth token"),
    );
    expect(onClose).toHaveBeenCalledWith(1008, "unauthorized: device token mismatch");
    client.stop();
  });

  it("maps typed chain client helpers to the expected gateway methods", async () => {
    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
    });
    const requestSpy = vi.spyOn(client, "request").mockResolvedValue({} as never);

    await client.chain.status();
    await client.chain.runtimeStatus();
    await client.chain.agents.list({ limit: 10, offset: 5 });
    await client.chain.agents.info({ address: "claw1agent" });
    await client.chain.agents.tasks({ role: "assignee" });
    await client.chain.agents.delegate({
      assignee: "claw1worker",
      description: "Run job",
      budget: "5",
    });
    await client.chain.agents.reputation({ address: "claw1agent" });
    await client.chain.wallet.balance({ denom: "uclaw" });
    await client.chain.wallet.transfer({ recipient: "claw1dest", amount: "9" });
    await client.chain.wallet.stakingDelegations({});
    await client.chain.wallet.stakingRewards({});
    await client.chain.wallet.history({ limit: 7 });
    await client.provider.status();
    await client.provider.help({ phase: "earn" });
    await client.provider.dashboard();

    expect(requestSpy).toHaveBeenNthCalledWith(1, "chain.status", {});
    expect(requestSpy).toHaveBeenNthCalledWith(2, "runtime.status", {});
    expect(requestSpy).toHaveBeenNthCalledWith(3, "chain.agents.list", { limit: 10, offset: 5 });
    expect(requestSpy).toHaveBeenNthCalledWith(4, "chain.agents.info", { address: "claw1agent" });
    expect(requestSpy).toHaveBeenNthCalledWith(5, "chain.agents.tasks", { role: "assignee" });
    expect(requestSpy).toHaveBeenNthCalledWith(6, "chain.agents.delegate", {
      assignee: "claw1worker",
      description: "Run job",
      budget: "5",
    });
    expect(requestSpy).toHaveBeenNthCalledWith(7, "chain.agents.reputation", {
      address: "claw1agent",
    });
    expect(requestSpy).toHaveBeenNthCalledWith(8, "chain.wallet.balance", { denom: "uclaw" });
    expect(requestSpy).toHaveBeenNthCalledWith(9, "chain.wallet.transfer", {
      recipient: "claw1dest",
      amount: "9",
    });
    expect(requestSpy).toHaveBeenNthCalledWith(10, "chain.wallet.staking.delegations", {});
    expect(requestSpy).toHaveBeenNthCalledWith(11, "chain.wallet.staking.rewards", {});
    expect(requestSpy).toHaveBeenNthCalledWith(12, "chain.wallet.history", { limit: 7 });
    expect(requestSpy).toHaveBeenNthCalledWith(13, "provider.status", {});
    expect(requestSpy).toHaveBeenNthCalledWith(14, "provider.help", { phase: "earn" });
    expect(requestSpy).toHaveBeenNthCalledWith(15, "provider.dashboard", {});
  });
});
