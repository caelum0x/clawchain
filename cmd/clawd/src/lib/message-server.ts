/**
 * Agent messaging HTTP server.
 *
 * Listens for incoming encrypted agent messages, decrypts them,
 * verifies sender signatures via on-chain pubkey lookup, and
 * stores them in the local message store.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { eciesDecrypt, verifySignature } from "./crypto.js";
import { MessageStore } from "./message-store.js";
import type { AgentMessage } from "./messaging.js";

export type AgentMessageServerOptions = {
  /** Port to listen on (default: 7777). */
  port?: number;
  /** Agent's secp256k1 private key (hex). */
  privateKeyHex: string;
  /** Agent's bech32 address. */
  agentAddress: string;
  /** Chain REST URL for looking up sender pubkeys. */
  restUrl: string;
  /** Message store instance. */
  messageStore: MessageStore;
  /** Optional callback when a message is received. */
  onMessage?: (msg: { id: string; from: string; body: string }) => void | Promise<void>;
};

const DEFAULT_PORT = 7777;

export class AgentMessageServer {
  private server: Server | null = null;
  private readonly port: number;
  private readonly privateKeyHex: string;
  private readonly agentAddress: string;
  private readonly restUrl: string;
  private readonly messageStore: MessageStore;
  private readonly onMessage?: AgentMessageServerOptions["onMessage"];

  /** Cache: address -> compressed pubkey hex. */
  private readonly pubkeyCache = new Map<string, string>();

  constructor(options: AgentMessageServerOptions) {
    this.port = options.port ?? DEFAULT_PORT;
    this.privateKeyHex = options.privateKeyHex;
    this.agentAddress = options.agentAddress;
    this.restUrl = options.restUrl;
    this.messageStore = options.messageStore;
    this.onMessage = options.onMessage;
  }

  /**
   * Start the messaging HTTP server.
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          this.sendJson(res, 500, { error: String(err) });
        });
      });

      this.server.on("error", reject);
      this.server.listen(this.port, () => {
        console.log(`Agent messaging server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the messaging server.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);

    if (url.pathname === "/agent/messages" && req.method === "POST") {
      await this.handleIncomingMessage(req, res);
    } else if (url.pathname === "/agent/health" && req.method === "GET") {
      this.sendJson(res, 200, {
        status: "ok",
        address: this.agentAddress,
        port: this.port,
      });
    } else {
      this.sendJson(res, 404, { error: "Not found" });
    }
  }

  private async handleIncomingMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);

    let message: AgentMessage;
    try {
      message = JSON.parse(body);
    } catch {
      this.sendJson(res, 400, { error: "Invalid JSON" });
      return;
    }

    if (!message.from || !message.ciphertext || !message.signature) {
      this.sendJson(res, 400, { error: "Missing required fields: from, ciphertext, signature" });
      return;
    }

    // Verify sender signature against their on-chain pubkey
    let verified = false;
    try {
      const senderPubkey = await this.lookupPubkey(message.from);
      if (senderPubkey) {
        verified = await verifySignature(message.ciphertext, message.signature, senderPubkey);
      }
    } catch {
      // Signature verification failed — accept message but mark as unverified
    }

    // Decrypt the message
    let plaintext: string;
    try {
      plaintext = await eciesDecrypt(message.ciphertext, this.privateKeyHex);
    } catch (err) {
      this.sendJson(res, 400, { error: `Decryption failed: ${String(err)}` });
      return;
    }

    // Store the message
    const id = this.messageStore.append({
      from: message.from,
      to: this.agentAddress,
      body: plaintext,
      timestamp: message.timestamp ?? Date.now(),
      signature: message.signature,
    });

    // Notify callback
    if (this.onMessage) {
      await this.onMessage({ id, from: message.from, body: plaintext });
    }

    this.sendJson(res, 200, { received: true, id, verified });
  }

  /**
   * Look up a sender's compressed public key from the agent registry.
   */
  private async lookupPubkey(address: string): Promise<string | null> {
    const cached = this.pubkeyCache.get(address);
    if (cached) return cached;

    try {
      const url = `${this.restUrl}/clawchain/agent/v1/agent/${encodeURIComponent(address)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { pubkey?: string; registered?: boolean };
      if (data.pubkey && data.registered) {
        this.pubkeyCache.set(address, data.pubkey);
        return data.pubkey;
      }
    } catch {
      // Lookup failed
    }
    return null;
  }

  private sendJson(res: ServerResponse, status: number, data: Record<string, unknown>): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }
}
