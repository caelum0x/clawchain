/**
 * ECIES encryption for agent-to-agent messaging.
 *
 * Uses secp256k1 ECDH for key agreement and AES-256-GCM for symmetric
 * encryption. Wire format:
 *   [33-byte ephemeral compressed pubkey][12-byte IV][ciphertext][16-byte GCM tag]
 */

import { createCipheriv, createDecipheriv, createECDH, createHmac, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// secp256k1 helpers via @cosmjs/crypto
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext message for a recipient identified by their
 * compressed secp256k1 public key (33 bytes hex).
 *
 * Returns a base64-encoded ciphertext blob.
 */
export async function eciesEncrypt(
  plaintext: string,
  recipientPubkeyHex: string,
): Promise<string> {
  // Generate ephemeral keypair using Node.js ECDH
  const ecdh = createECDH("secp256k1");
  ecdh.generateKeys();
  const compressedEphemeral = ecdh.getPublicKey(undefined, "compressed");

  // ECDH: shared secret
  const recipientPubkey = Buffer.from(recipientPubkeyHex, "hex");
  const sharedPoint = ecdh.computeSecret(recipientPubkey);

  // Derive AES key from shared secret via HMAC-SHA256
  const aesKey = createHmac("sha256", Buffer.from("clawchain-ecies"))
    .update(sharedPoint)
    .digest();

  // AES-256-GCM encrypt
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Wire format: ephemeralPubkey (33) + iv (12) + ciphertext + tag (16)
  const result = Buffer.concat([
    Buffer.from(compressedEphemeral),
    iv,
    ciphertext,
    tag,
  ]);

  return result.toString("base64");
}

/**
 * Decrypt an ECIES ciphertext using the recipient's private key (32 bytes hex).
 */
export async function eciesDecrypt(
  ciphertextBase64: string,
  privateKeyHex: string,
): Promise<string> {
  const buf = Buffer.from(ciphertextBase64, "base64");

  // Parse wire format
  const ephemeralPubkey = buf.subarray(0, 33);
  const iv = buf.subarray(33, 45);
  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(45, buf.length - 16);

  // ECDH: shared secret using Node.js ECDH with the recipient's private key
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(Buffer.from(privateKeyHex, "hex"));
  const sharedPoint = ecdh.computeSecret(ephemeralPubkey);

  // Derive AES key
  const aesKey = createHmac("sha256", Buffer.from("clawchain-ecies"))
    .update(sharedPoint)
    .digest();

  // AES-256-GCM decrypt
  const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf-8");
}

/**
 * Sign arbitrary data with a secp256k1 private key.
 * Returns a hex-encoded signature.
 */
export async function signMessage(
  data: string,
  privateKeyHex: string,
): Promise<string> {
  const { Secp256k1, sha256 } = await import("@cosmjs/crypto");

  const hash = sha256(new TextEncoder().encode(data));
  const privateKey = Buffer.from(privateKeyHex, "hex");
  const signature = await Secp256k1.createSignature(hash, privateKey);

  // Return r + s as hex
  return Buffer.from([...signature.r(32), ...signature.s(32)]).toString("hex");
}

/**
 * Verify a secp256k1 signature.
 */
export async function verifySignature(
  data: string,
  signatureHex: string,
  pubkeyHex: string,
): Promise<boolean> {
  const { Secp256k1, sha256, ExtendedSecp256k1Signature } = await import("@cosmjs/crypto");

  const hash = sha256(new TextEncoder().encode(data));
  const sigBytes = Buffer.from(signatureHex, "hex");
  const r = sigBytes.subarray(0, 32);
  const s = sigBytes.subarray(32, 64);
  const pubkey = Buffer.from(pubkeyHex, "hex");

  try {
    const signature = new ExtendedSecp256k1Signature(r, s, 0);
    return await Secp256k1.verifySignature(signature, hash, pubkey);
  } catch {
    // Try recovery param 1
    try {
      const signature = new ExtendedSecp256k1Signature(r, s, 1);
      return await Secp256k1.verifySignature(signature, hash, pubkey);
    } catch {
      return false;
    }
  }
}
