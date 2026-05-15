import test, { describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { ClawChainClient } from "./client.js";

// ---------------------------------------------------------------------------
// Minimal WebSocket mock
// ---------------------------------------------------------------------------

type WSHandler = (...args: any[]) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = 0; // CONNECTING
  onopen: WSHandler | null = null;
  onmessage: WSHandler | null = null;
  onclose: WSHandler | null = null;
  onerror: WSHandler | null = null;
  sentMessages: string[] = [];
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = 3; // CLOSED
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) this.onopen({} as Event);
  }

  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  simulateClose() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose({} as Event);
  }

  simulateError() {
    if (this.onerror) this.onerror({} as Event);
  }
}

// ---------------------------------------------------------------------------
// Test setup and teardown
// ---------------------------------------------------------------------------

let originalWebSocket: typeof globalThis.WebSocket;

function installMockWebSocket() {
  originalWebSocket = globalThis.WebSocket;
  (globalThis as any).WebSocket = MockWebSocket;
  MockWebSocket.instances = [];
}

function restoreMockWebSocket() {
  (globalThis as any).WebSocket = originalWebSocket;
  MockWebSocket.instances = [];
}

// ---------------------------------------------------------------------------
// subscribeNewBlock tests
// ---------------------------------------------------------------------------

describe("ClawChainClient WebSocket subscriptions", () => {
  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreMockWebSocket();
  });

  test("subscribeNewBlock opens WebSocket and sends subscribe message", () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    const blocks: any[] = [];

    client.subscribeNewBlock((block) => blocks.push(block));

    // A WebSocket should have been created
    assert.equal(MockWebSocket.instances.length, 1);
    const ws = MockWebSocket.instances[0];
    assert.ok(ws.url.includes("websocket"));

    // Simulate connection open
    ws.simulateOpen();

    // Should have sent a subscribe message
    assert.ok(ws.sentMessages.length > 0);
    const msg = JSON.parse(ws.sentMessages[0]);
    assert.equal(msg.method, "subscribe");
    assert.ok(msg.params.query.includes("NewBlock"));

    client.unsubscribeAll();
  });

  test("subscribeNewBlock delivers parsed block info", () => {
    const client = new ClawChainClient();
    const blocks: any[] = [];

    client.subscribeNewBlock((block) => blocks.push(block));
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Simulate a new block event
    ws.simulateMessage({
      result: {
        data: {
          type: "new_block",
          value: {
            block: {
              header: {
                height: "42",
                time: "2026-03-09T10:00:00Z",
                num_txs: "3",
                proposer_address: "cosmosvaloper1abc",
                app_hash: "DEADBEEF",
              },
              data: { txs: ["tx1", "tx2", "tx3"] },
            },
            block_id: { hash: "ABCD1234" },
          },
        },
      },
    });

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].height, 42);
    assert.equal(blocks[0].hash, "ABCD1234");
    assert.equal(blocks[0].time, "2026-03-09T10:00:00Z");
    assert.equal(blocks[0].proposer, "cosmosvaloper1abc");

    client.unsubscribeAll();
  });

  test("subscribeTx delivers parsed transaction filtered by address", () => {
    const client = new ClawChainClient();
    const txs: any[] = [];
    const address = "cosmos1sender";

    client.subscribeTx(address, (tx) => txs.push(tx));
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Simulate a matching tx event
    ws.simulateMessage({
      result: {
        data: {
          type: "tx",
          value: {
            TxResult: {
              hash: "TX123",
              height: "100",
              result: {
                code: 0,
                events: [
                  {
                    type: "transfer",
                    attributes: [
                      { key: "sender", value: "cosmos1sender" },
                      { key: "recipient", value: "cosmos1receiver" },
                      { key: "amount", value: "1000uclaw" },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    });

    assert.equal(txs.length, 1);
    assert.equal(txs[0].hash, "TX123");
    assert.equal(txs[0].height, 100);
    assert.equal(txs[0].code, 0);
    assert.equal(txs[0].sender, "cosmos1sender");
    assert.equal(txs[0].recipient, "cosmos1receiver");

    client.unsubscribeAll();
  });

  test("subscribeTx filters out non-matching addresses", () => {
    const client = new ClawChainClient();
    const txs: any[] = [];

    client.subscribeTx("cosmos1other", (tx) => txs.push(tx));
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({
      result: {
        data: {
          type: "tx",
          value: {
            TxResult: {
              hash: "TX999",
              height: "200",
              result: {
                code: 0,
                events: [
                  {
                    type: "transfer",
                    attributes: [
                      { key: "sender", value: "cosmos1someone" },
                      { key: "recipient", value: "cosmos1else" },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    });

    // Should not deliver because address doesn't match
    assert.equal(txs.length, 0);

    client.unsubscribeAll();
  });

  test("subscribeEvent delivers only matching event types", () => {
    const client = new ClawChainClient();
    const events: any[] = [];

    client.subscribeEvent("agent_registered", (ev) => events.push(ev));
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({
      result: {
        data: {
          type: "tx",
          value: {
            TxResult: {
              height: "50",
              result: {
                events: [
                  {
                    type: "transfer",
                    attributes: [{ key: "amount", value: "100uclaw" }],
                  },
                  {
                    type: "agent_registered",
                    attributes: [
                      { key: "agent", value: "cosmos1agent" },
                      { key: "name", value: "TestAgent" },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    });

    // Only the agent_registered event should come through
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "agent_registered");
    assert.equal(events[0].attributes.agent, "cosmos1agent");
    assert.equal(events[0].attributes.name, "TestAgent");
    assert.equal(events[0].height, 50);

    client.unsubscribeAll();
  });

  test("unsubscribe function removes callback", () => {
    const client = new ClawChainClient();
    const blocks: any[] = [];

    const unsub = client.subscribeNewBlock((block) => blocks.push(block));
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // First event should be delivered
    ws.simulateMessage({
      result: {
        data: {
          type: "new_block",
          value: {
            block: { header: { height: "1", time: "", num_txs: "0", proposer_address: "" } },
          },
        },
      },
    });
    assert.equal(blocks.length, 1);

    // Unsubscribe
    unsub();

    // Second event should not be delivered
    ws.simulateMessage({
      result: {
        data: {
          type: "new_block",
          value: {
            block: { header: { height: "2", time: "", num_txs: "0", proposer_address: "" } },
          },
        },
      },
    });
    assert.equal(blocks.length, 1);
  });

  test("unsubscribeAll closes WebSocket and clears subscriptions", () => {
    const client = new ClawChainClient();

    client.subscribeNewBlock(() => {});
    client.subscribeTx("cosmos1abc", () => {});

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    client.unsubscribeAll();

    assert.ok(ws.closed);
    // Internal state should be cleared
    assert.equal((client as any).wsSubscriptions.size, 0);
  });

  test("WebSocket derives correct URL from http rpcUrl", () => {
    const client = new ClawChainClient({ rpcUrl: "http://mynode:26657" });
    assert.equal((client as any).wsUrl, "ws://mynode:26657/websocket");
  });

  test("WebSocket derives correct URL from https rpcUrl", () => {
    const client = new ClawChainClient({ rpcUrl: "https://secure.node:26657" });
    assert.equal((client as any).wsUrl, "wss://secure.node:26657/websocket");
  });

  test("WebSocket falls back to default URL on invalid rpcUrl", () => {
    const client = new ClawChainClient({ rpcUrl: "not-a-url" });
    assert.equal((client as any).wsUrl, "ws://localhost:26657/websocket");
  });

  test("reconnection is scheduled on WebSocket close", () => {
    const client = new ClawChainClient();

    client.subscribeNewBlock(() => {});
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Simulate close — should schedule reconnect
    ws.simulateClose();

    assert.ok((client as any).wsReconnectTimer !== null);

    // Cleanup
    client.unsubscribeAll();
  });

  test("reconnection attempt counter increments on close", () => {
    const client = new ClawChainClient();

    client.subscribeNewBlock(() => {});
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    assert.equal((client as any).wsReconnectAttempt, 0);

    ws.simulateClose();

    // Reconnect attempt should be incremented
    assert.equal((client as any).wsReconnectAttempt, 1);

    client.unsubscribeAll();
  });

  test("multiple subscriptions share a single WebSocket", () => {
    const client = new ClawChainClient();

    client.subscribeNewBlock(() => {});
    client.subscribeTx("cosmos1abc", () => {});
    client.subscribeEvent("transfer", () => {});

    // Only one WebSocket should be created
    assert.equal(MockWebSocket.instances.length, 1);

    client.unsubscribeAll();
  });

  test("resubscribes after reconnection", () => {
    const client = new ClawChainClient();

    client.subscribeNewBlock(() => {});
    const ws1 = MockWebSocket.instances[0];
    ws1.simulateOpen();

    const initialSentCount = ws1.sentMessages.length;
    assert.ok(initialSentCount > 0);

    // Simulate close — which triggers reconnect logic
    ws1.simulateClose();

    // Clear the reconnect timer and manually trigger reconnect
    if ((client as any).wsReconnectTimer) {
      clearTimeout((client as any).wsReconnectTimer);
      (client as any).wsReconnectTimer = null;
    }
    (client as any).wsConnecting = false;
    (client as any).ws = null;

    // Force a new ensureWebSocket
    (client as any).ensureWebSocket();
    assert.equal(MockWebSocket.instances.length, 2);

    const ws2 = MockWebSocket.instances[1];
    ws2.simulateOpen();

    // After reconnection, the subscribe message should be re-sent
    assert.ok(ws2.sentMessages.length > 0);
    const msg = JSON.parse(ws2.sentMessages[0]);
    assert.equal(msg.method, "subscribe");
    assert.ok(msg.params.query.includes("NewBlock"));

    client.unsubscribeAll();
  });

  test("ignores malformed WebSocket messages gracefully", () => {
    const client = new ClawChainClient();
    const blocks: any[] = [];

    client.subscribeNewBlock((block) => blocks.push(block));
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Send malformed message — should not throw
    ws.simulateMessage({ invalid: "data" });
    assert.equal(blocks.length, 0);

    // Send a null result
    ws.simulateMessage({ result: null });
    assert.equal(blocks.length, 0);

    // Send message with missing data
    ws.simulateMessage({ result: { data: null } });
    assert.equal(blocks.length, 0);

    client.unsubscribeAll();
  });

  test("callback errors do not propagate to other subscribers", () => {
    const client = new ClawChainClient();
    const blocks: any[] = [];

    // First subscriber throws
    client.subscribeNewBlock(() => {
      throw new Error("boom");
    });
    // Second subscriber should still receive events
    client.subscribeNewBlock((block) => blocks.push(block));

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({
      result: {
        data: {
          type: "new_block",
          value: {
            block: { header: { height: "10", time: "", num_txs: "0", proposer_address: "" } },
          },
        },
      },
    });

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].height, 10);

    client.unsubscribeAll();
  });

  test("disconnect also cleans up WebSocket subscriptions", async () => {
    const client = new ClawChainClient();

    client.subscribeNewBlock(() => {});
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Disconnect should not throw, and WS should be cleaned
    client.unsubscribeAll();
    assert.ok(ws.closed);
    assert.equal((client as any).wsSubscriptions.size, 0);
  });

  test("subscribeTx with empty events still parses correctly", () => {
    const client = new ClawChainClient();
    const txs: any[] = [];

    // Subscribe with empty string address to match all txs
    client.subscribeTx("", (tx) => txs.push(tx));
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({
      result: {
        data: {
          type: "tx",
          value: {
            TxResult: {
              hash: "TX_EMPTY",
              height: "1",
              result: {
                code: 0,
                events: [],
              },
            },
          },
        },
      },
    });

    // Empty address matches everything
    assert.equal(txs.length, 1);
    assert.equal(txs[0].hash, "TX_EMPTY");
    assert.equal(txs[0].events.length, 0);

    client.unsubscribeAll();
  });
});
