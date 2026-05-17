import Ajv from "ajv";
import { describe, expect, it, vi } from "vitest";
import {
  EventFrameSchema,
  HeartbeatEventPayloadSchema,
  ShutdownEventSchema,
  TickEventSchema,
} from "./protocol/schema.js";
import { GATEWAY_EVENTS } from "./server-methods-list.js";
import { createGatewayBroadcaster } from "./server-broadcast.js";
import type { GatewayWsClient } from "./server/ws-types.js";

type ParsedEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence?: number; health?: number };
};

describe("gateway event frame contract coherence", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateEventFrame = ajv.compile(EventFrameSchema);
  const validateHeartbeatPayload = ajv.compile(HeartbeatEventPayloadSchema);
  const validateTickPayload = ajv.compile(TickEventSchema);
  const validateShutdownPayload = ajv.compile(ShutdownEventSchema);

  function createHarness() {
    const socket = {
      bufferedAmount: 0,
      send: vi.fn(),
      close: vi.fn(),
    };
    const clients = new Set<GatewayWsClient>([
      {
        socket: socket as unknown as GatewayWsClient["socket"],
        connect: { role: "operator", scopes: ["operator.read"] } as GatewayWsClient["connect"],
        connId: "c-events",
      },
    ]);
    const { broadcast } = createGatewayBroadcaster({ clients });
    return { socket, broadcast };
  }

  function parseFirstSentFrame(socket: { send: ReturnType<typeof vi.fn> }): ParsedEventFrame {
    const raw = socket.send.mock.calls[0]?.[0];
    expect(typeof raw).toBe("string");
    return JSON.parse(raw as string) as ParsedEventFrame;
  }

  it("validates event frame + payload schemas for heartbeat, tick, and shutdown", () => {
    expect(GATEWAY_EVENTS).toContain("heartbeat");
    expect(GATEWAY_EVENTS).toContain("tick");
    expect(GATEWAY_EVENTS).toContain("shutdown");

    const heartbeat = createHarness();
    const heartbeatPayload = {
      ts: Date.now(),
      status: "sent",
      indicatorType: "alert",
      channel: "web",
      silent: false,
    } as const;
    heartbeat.broadcast("heartbeat", heartbeatPayload);
    const heartbeatFrame = parseFirstSentFrame(heartbeat.socket);
    expect(validateEventFrame(heartbeatFrame)).toBe(true);
    expect(heartbeatFrame.event).toBe("heartbeat");
    expect(validateHeartbeatPayload(heartbeatFrame.payload)).toBe(true);

    const tick = createHarness();
    const tickPayload = { ts: Date.now() } as const;
    tick.broadcast("tick", tickPayload);
    const tickFrame = parseFirstSentFrame(tick.socket);
    expect(validateEventFrame(tickFrame)).toBe(true);
    expect(tickFrame.event).toBe("tick");
    expect(validateTickPayload(tickFrame.payload)).toBe(true);

    const shutdown = createHarness();
    const shutdownPayload = { reason: "service restart", restartExpectedMs: 5000 } as const;
    shutdown.broadcast("shutdown", shutdownPayload);
    const shutdownFrame = parseFirstSentFrame(shutdown.socket);
    expect(validateEventFrame(shutdownFrame)).toBe(true);
    expect(shutdownFrame.event).toBe("shutdown");
    expect(validateShutdownPayload(shutdownFrame.payload)).toBe(true);
  });
});
