import { verifySignature } from "./crypto.js";

export type ManifestSignatureEntry = {
  pubkey: string;
  signature: string;
};

export type ManifestVerificationResult = {
  ok: boolean;
  signerPubkey?: string;
  detail: string;
};

export function isPublicManifestSource(source?: string): boolean {
  if (!source || !/^https?:\/\//i.test(source)) return false;
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return false;
  }
}

export function shouldRequireSignedManifest(params: {
  source?: string;
  explicitRequire?: boolean;
}): boolean {
  if (params.explicitRequire === true) return true;
  if (process.env.CLAWD_REQUIRE_SIGNED_MANIFEST === "1") return true;
  return isPublicManifestSource(params.source);
}

export function parseTrustedManifestPubkeys(explicitCsv?: string): string[] {
  const fromEnv = process.env.CLAWD_MANIFEST_TRUSTED_PUBKEYS ?? "";
  const raw = explicitCsv && explicitCsv.trim().length > 0 ? explicitCsv : fromEnv;
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^[0-9a-fA-F]{66}$/.test(v));
}

export async function verifyManifestSignatures(params: {
  manifest: unknown;
  trustedPubkeys: string[];
}): Promise<ManifestVerificationResult> {
  const manifest = params.manifest as Record<string, unknown>;
  const signatures = extractSignatureEntries(manifest);
  if (signatures.length === 0) {
    return {
      ok: false,
      detail: "manifest has no signatures[] entries",
    };
  }
  if (params.trustedPubkeys.length === 0) {
    return {
      ok: false,
      detail: "no trusted manifest pubkeys configured (set --manifest-trusted-pubkeys or CLAWD_MANIFEST_TRUSTED_PUBKEYS)",
    };
  }

  const trustedSet = new Set(params.trustedPubkeys.map((k) => k.toLowerCase()));
  const payload = canonicalManifestSigningPayload(manifest);

  for (const entry of signatures) {
    const pubkey = entry.pubkey.toLowerCase();
    if (!trustedSet.has(pubkey)) continue;
    const verified = await verifySignature(payload, entry.signature, entry.pubkey);
    if (verified) {
      return {
        ok: true,
        signerPubkey: entry.pubkey,
        detail: "signature verified with trusted pubkey",
      };
    }
  }

  return {
    ok: false,
    detail: "no signature verified against trusted pubkeys",
  };
}

function extractSignatureEntries(manifest: Record<string, unknown>): ManifestSignatureEntry[] {
  const signatures = manifest.signatures;
  if (!Array.isArray(signatures)) return [];
  return signatures
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const pubkey = String((entry as Record<string, unknown>).pubkey ?? "").trim();
      const signature = String((entry as Record<string, unknown>).signature ?? "").trim();
      if (!/^[0-9a-fA-F]{66}$/.test(pubkey)) return null;
      if (!/^[0-9a-fA-F]{128}$/.test(signature)) return null;
      return { pubkey, signature };
    })
    .filter((v): v is ManifestSignatureEntry => v !== null);
}

function canonicalManifestSigningPayload(manifest: Record<string, unknown>): string {
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(manifest)) {
    if (key === "signatures") continue;
    filtered[key] = manifest[key];
  }
  return canonicalJson(filtered);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  return "null";
}
