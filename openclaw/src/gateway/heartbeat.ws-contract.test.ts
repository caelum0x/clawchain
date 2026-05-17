import Ajv from "ajv";
import { describe, expect, it, vi } from "vitest";
import { HeartbeatEventPayloadSchema } from "./protocol/schema.js";
import { GATEWAY_EVENTS } from "./server-methods-list.js";
import { createGatewayBroadcaster } from "./server-broadcast.js";
import type { GatewayWsClient } from "./server/ws-types.js";

describe("heartbeat event WS contract coherence", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateHeartbeatPayload = ajv.compile(HeartbeatEventPayloadSchema);

  it("is advertised and broadcast payload is schema-valid", () => {
    expect(GATEWAY_EVENTS).toContain("heartbeat");

    const socket = {
      bufferedAmount: 0,
      send: vi.fn(),
      close: vi.fn(),
    };

    const clients = new Set<GatewayWsClient>([
      {
        socket: socket as unknown as GatewayWsClient["socket"],
        connect: { role: "operator", scopes: ["operator.read"] } as GatewayWsClient["connect"],
        connId: "c-heartbeat",
      },
    ]);
    const { broadcast } = createGatewayBroadcaster({ clients });

    const payload = {
      ts: Date.now(),
      status: "sent",
      to: "ops-room",
      durationMs: 42,
      indicatorType: "alert",
      channel: "web",
      silent: false,
    } as const;
    broadcast("heartbeat", payload);

    const frameRaw = socket.send.mock.calls[0]?.[0];
    expect(typeof frameRaw).toBe("string");
    const frame = JSON.parse(frameRaw as string) as { event?: string; payload?: unknown };
    expect(frame.event).toBe("heartbeat");
    expect(validateHeartbeatPayload(frame.payload)).toBe(true);
  });
});
