/**
 * Token faucet HTTP server.
 *
 * Provides a simple faucet for testnet onboarding. Rate-limited to
 * one request per address per 24 hours.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type FaucetServerOptions = {
  /** Port to listen on (default: 8888). */
  port?: number;
  /** Drip amount in base denom units (default: 10000000 = 10 CLAW). */
  dripAmount?: string;
  /** Denomination (default: "uclaw"). */
  denom?: string;
  /** Function to send tokens. Returns the tx hash. */
  sendTokens: (recipient: string, amount: string, denom: string) => Promise<string>;
  /** Function to get the faucet's own balance. */
  getBalance: () => Promise<string>;
  /** Faucet's own address for display. */
  faucetAddress: string;
  /** Optional path for persisted cooldown state. */
  cooldownStorePath?: string;
};

const DEFAULT_PORT = 8888;
const DEFAULT_DRIP = "10000000"; // 10 CLAW
const DEFAULT_DENOM = "uclaw";
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_BODY_BYTES = 4 * 1024;
const DEFAULT_COOLDOWN_STORE_PATH = join(homedir(), ".clawd", "faucet-cooldowns.json");

export class FaucetServer {
  private server: Server | null = null;
  private readonly port: number;
  private readonly dripAmount: string;
  private readonly denom: string;
  private readonly sendTokens: FaucetServerOptions["sendTokens"];
  private readonly getBalance: FaucetServerOptions["getBalance"];
  private readonly faucetAddress: string;
  private readonly cooldownStorePath: string;
  private persistQueue: Promise<void> = Promise.resolve();

  /** In-memory cooldown records keyed by `addr:<bech32>` / `ip:<client-ip>`. */
  private readonly cooldowns = new Map<string, number>();

  constructor(options: FaucetServerOptions) {
    this.port = options.port ?? DEFAULT_PORT;
    this.dripAmount = options.dripAmount ?? DEFAULT_DRIP;
    this.denom = options.denom ?? DEFAULT_DENOM;
    this.sendTokens = options.sendTokens;
    this.getBalance = options.getBalance;
    this.faucetAddress = options.faucetAddress;
    this.cooldownStorePath = options.cooldownStorePath ?? DEFAULT_COOLDOWN_STORE_PATH;
  }

  /**
   * Start the faucet HTTP server.
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.loadCooldowns()
        .catch((err) => {
          console.warn(`Warning: failed to load faucet cooldown state: ${String(err)}`);
        })
        .finally(() => {
          this.server = createServer((req, res) => {
            this.handleRequest(req, res).catch((err) => {
              this.sendJson(res, 500, { error: String(err) });
            });
          });

          this.server.on("error", reject);
          this.server.listen(this.port, () => {
            console.log(`Faucet server listening on port ${this.port}`);
            console.log(`  Drip amount: ${this.dripAmount} ${this.denom}`);
            console.log(`  Cooldown store: ${this.cooldownStorePath}`);
            resolve();
          });
        });
    });
  }

  /**
   * Stop the faucet HTTP server.
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
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    // Basic hardening headers for public HTTP exposure.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);

    if (
      (url.pathname === "/faucet/request" || url.pathname === "/send") &&
      req.method === "POST"
    ) {
      await this.handleFaucetRequest(req, res, url.pathname);
    } else if (
      (url.pathname === "/faucet/status" || url.pathname === "/status") &&
      req.method === "GET"
    ) {
      await this.handleFaucetStatus(res);
    } else {
      this.sendJson(res, 404, { error: "Not found" });
    }
  }

  private async handleFaucetRequest(
    req: IncomingMessage,
    res: ServerResponse,
    routePath: string,
  ): Promise<void> {
    const clientIp = this.getClientIp(req);
    let body = "";
    try {
      body = await this.readBody(req);
    } catch (err) {
      if (String(err).includes("Request body too large")) {
        this.sendJson(res, 413, { error: "Request body too large" });
        return;
      }
      throw err;
    }

    let parsed: { address?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      this.sendJson(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const address = parsed.address;
    if (!address || typeof address !== "string") {
      this.sendJson(res, 400, { error: "Missing 'address' field" });
      return;
    }

    // Basic bech32 validation
    if (!address.match(/^[a-z]+1[a-z0-9]{38,}$/)) {
      this.sendJson(res, 400, { error: "Invalid bech32 address format" });
      return;
    }

    const addrKey = `addr:${address}`;
    const ipKey = `ip:${clientIp}`;
    const addrRetryAfterSec = this.getRetryAfterSeconds(addrKey);
    if (addrRetryAfterSec > 0) {
      res.setHeader("Retry-After", String(addrRetryAfterSec));
      const retryAfterMin = Math.ceil(addrRetryAfterSec / 60);
      console.warn(`[faucet] rate_limited addr=${address} ip=${clientIp} retry_min=${retryAfterMin}`);
      this.sendJson(res, 429, {
        error: "Rate limited. One request per address per 24 hours.",
        retryAfterMinutes: retryAfterMin,
      });
      return;
    }

    const ipRetryAfterSec = this.getRetryAfterSeconds(ipKey);
    if (ipRetryAfterSec > 0) {
      res.setHeader("Retry-After", String(ipRetryAfterSec));
      const retryAfterMin = Math.ceil(ipRetryAfterSec / 60);
      console.warn(`[faucet] rate_limited ip=${clientIp} addr=${address} retry_min=${retryAfterMin}`);
      this.sendJson(res, 429, {
        error: "Rate limited. One request per IP per 24 hours.",
        retryAfterMinutes: retryAfterMin,
      });
      return;
    }

    try {
      const txHash = await this.sendTokens(address, this.dripAmount, this.denom);
      const now = Date.now();
      this.cooldowns.set(addrKey, now);
      this.cooldowns.set(ipKey, now);
      this.persistCooldowns();
      console.log(`[faucet] sent route=${routePath} ip=${clientIp} to=${address} tx=${txHash}`);
      this.sendJson(res, 200, {
        txHash,
        amount: this.dripAmount,
        denom: this.denom,
        message: "Tokens sent!",
      });
    } catch (err) {
      this.sendJson(res, 500, { error: `Faucet send failed: ${String(err)}` });
    }
  }

  private async handleFaucetStatus(res: ServerResponse): Promise<void> {
    try {
      const balance = await this.getBalance();
      this.sendJson(res, 200, {
        address: this.faucetAddress,
        balance,
        denom: this.denom,
        dripAmount: this.dripAmount,
        rateLimitHours: 24,
      });
    } catch (err) {
      this.sendJson(res, 500, { error: `Failed to get faucet status: ${String(err)}` });
    }
  }

  private sendJson(res: ServerResponse, status: number, data: Record<string, unknown>): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      req.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          reject(new Error("Request body too large"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }

  private getClientIp(req: IncomingMessage): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim() !== "") {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      const first = forwarded[0]?.split(",")[0]?.trim();
      if (first) return first;
    }
    const remote = req.socket.remoteAddress?.trim() ?? "unknown";
    return remote.startsWith("::ffff:") ? remote.slice(7) : remote;
  }

  private getRetryAfterSeconds(key: string): number {
    const last = this.cooldowns.get(key);
    if (!last) return 0;
    const remaining = RATE_LIMIT_MS - (Date.now() - last);
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / 1000);
  }

  private async loadCooldowns(): Promise<void> {
    try {
      const raw = await readFile(this.cooldownStorePath, "utf8");
      const parsed = JSON.parse(raw) as { records?: Record<string, number> };
      const now = Date.now();
      const records = parsed.records ?? {};
      for (const [key, value] of Object.entries(records)) {
        if (typeof value !== "number") continue;
        if (now - value >= RATE_LIMIT_MS) continue;
        this.cooldowns.set(key, value);
      }
    } catch {
      // first startup or invalid file: continue with empty cooldown set
    }
  }

  private persistCooldowns(): void {
    this.persistQueue = this.persistQueue.then(async () => {
      const now = Date.now();
      const records: Record<string, number> = {};
      for (const [key, value] of this.cooldowns.entries()) {
        if (now - value >= RATE_LIMIT_MS) {
          this.cooldowns.delete(key);
          continue;
        }
        records[key] = value;
      }

      await mkdir(dirname(this.cooldownStorePath), { recursive: true });
      await writeFile(
        this.cooldownStorePath,
        JSON.stringify({ updatedAt: new Date(now).toISOString(), records }, null, 2),
      );
    }).catch((err) => {
      console.warn(`Warning: failed to persist faucet cooldown state: ${String(err)}`);
    });
  }
}
