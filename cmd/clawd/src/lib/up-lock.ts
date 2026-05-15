import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { CLAWD_HOME } from "./paths.js";

const LOCK_PATH = join(CLAWD_HOME, "runtime-up.lock");
const STALE_MS = 30 * 60 * 1000;

type LockPayload = {
  pid: number;
  startedAt: number;
  command: string;
};

export function acquireUpLockOrExit(command = "clawd up"): () => void {
  mkdirSync(dirname(LOCK_PATH), { recursive: true });
  const now = Date.now();
  const payload: LockPayload = { pid: process.pid, startedAt: now, command };

  try {
    writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    return () => releaseLock();
  } catch {
    const existing = readLockPayload();
    if (!existing) {
      forceRemoveLock();
      try {
        writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2) + "\n", {
          encoding: "utf8",
          flag: "wx",
        });
        return () => releaseLock();
      } catch {
        // fall through to failure message
      }
    }
    if (existing && isLikelyStale(existing, now)) {
      forceRemoveLock();
      try {
        writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2) + "\n", {
          encoding: "utf8",
          flag: "wx",
        });
        return () => releaseLock();
      } catch {
        // fall through to failure message
      }
    }

    const detail = existing
      ? `lock held by pid=${existing.pid} (${existing.command}) started ${new Date(existing.startedAt).toISOString()}`
      : "lock file exists and could not be parsed";
    console.error(
      `Another runtime bootstrap appears to be running. ${detail}\n` +
        `If this is stale, remove: ${LOCK_PATH}`,
    );
    process.exit(1);
  }
}

function readLockPayload(): LockPayload | null {
  try {
    const raw = readFileSync(LOCK_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LockPayload>;
    if (
      typeof parsed.pid === "number" &&
      typeof parsed.startedAt === "number" &&
      typeof parsed.command === "string"
    ) {
      return parsed as LockPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function isLikelyStale(payload: LockPayload, now: number): boolean {
  if (now - payload.startedAt > STALE_MS) return true;
  try {
    process.kill(payload.pid, 0);
    return false;
  } catch {
    return true;
  }
}

function forceRemoveLock() {
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    // ignore
  }
}

function releaseLock() {
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    // ignore
  }
}
