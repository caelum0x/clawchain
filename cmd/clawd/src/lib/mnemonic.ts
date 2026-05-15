/**
 * BIP-39 mnemonic generation, encryption (AES-256-GCM), and storage.
 */

import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { CLAWD_MNEMONIC_PATH } from "./paths.js";

// We use a key derived from a password via scrypt. For simplicity in this
// CLI context the "password" is a fixed machine-local key derived from the
// file path itself. Users who want stronger protection can set CLAWD_KEY env.

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;
const KEY_LEN = 32;

/**
 * Generate a 24-word BIP-39 mnemonic using @cosmjs/crypto.
 */
export async function generateMnemonic(): Promise<string> {
  // Dynamic import to avoid bundling issues
  const { Bip39 } = await import("@cosmjs/crypto");
  const mnemonic = Bip39.encode(randomBytes(32));
  return mnemonic.toString();
}

/**
 * Encrypt and save a mnemonic to the default path.
 */
export function saveMnemonic(mnemonic: string, password?: string): void {
  const key = deriveKey(password);
  const iv = randomBytes(IV_LEN);
  const salt = randomBytes(SALT_LEN);

  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(mnemonic, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: salt (16) + iv (12) + tag (16) + ciphertext
  const payload = Buffer.concat([salt, iv, tag, encrypted]);

  mkdirSync(dirname(CLAWD_MNEMONIC_PATH), { recursive: true });
  writeFileSync(CLAWD_MNEMONIC_PATH, payload);
}

/**
 * Load and decrypt the mnemonic from the default path.
 * Returns null if the file doesn't exist.
 */
export function loadMnemonic(password?: string): string | null {
  if (!existsSync(CLAWD_MNEMONIC_PATH)) {
    return null;
  }

  const payload = readFileSync(CLAWD_MNEMONIC_PATH);
  if (payload.length < SALT_LEN + IV_LEN + TAG_LEN + 1) {
    throw new Error("Mnemonic file is corrupted (too short).");
  }

  const key = deriveKey(password);
  const iv = payload.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = payload.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = payload.subarray(SALT_LEN + IV_LEN + TAG_LEN);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch {
    throw new Error("Failed to decrypt mnemonic. Wrong password or corrupted file.");
  }
}

/**
 * Check whether a saved mnemonic file exists.
 */
export function mnemonicFileExists(): boolean {
  return existsSync(CLAWD_MNEMONIC_PATH);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function deriveKey(password?: string): Buffer {
  const secret = password ?? process.env.CLAWD_KEY ?? "clawd-default-key";
  return scryptSync(secret, "clawd-salt", KEY_LEN);
}
