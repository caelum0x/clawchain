import { createHash } from "node:crypto";

const ADJECTIVES = [
  "scarlet",
  "crimson",
  "coral",
  "amber",
  "azure",
  "jade",
  "onyx",
  "phantom",
  "swift",
  "bold",
  "quiet",
  "bright",
  "iron",
  "copper",
  "silver",
  "golden",
  "lunar",
  "solar",
  "arctic",
  "tropic",
  "deep",
  "wild",
  "frost",
  "storm",
  "drift",
  "salt",
  "tide",
] as const;

const NOUNS = [
  "claw",
  "pinch",
  "shell",
  "reef",
  "wave",
  "tide",
  "mantis",
  "lobster",
  "crab",
  "shrimp",
  "prawn",
  "krill",
  "barnacle",
  "coral",
  "pearl",
  "anchor",
  "helm",
  "beacon",
  "harbor",
  "current",
  "shoal",
  "urchin",
  "kelp",
  "anemone",
  "nautilus",
  "drifter",
] as const;

/**
 * Generate a deterministic crustacean-themed slug from a device ID.
 * Uses first 4 bytes of SHA-256 hash to pick adjective + noun.
 */
export function generateDeviceSlug(deviceId: string): string {
  const hash = createHash("sha256").update(deviceId).digest();
  const adjIndex = ((hash[0] << 8) | hash[1]) % ADJECTIVES.length;
  const nounIndex = ((hash[2] << 8) | hash[3]) % NOUNS.length;
  return `${ADJECTIVES[adjIndex]}-${NOUNS[nounIndex]}`;
}

/**
 * Resolve a unique slug, appending `-2`, `-3`, etc. on collision.
 */
export function resolveUniqueSlug(deviceId: string, existingSlugs: Set<string>): string {
  const base = generateDeviceSlug(deviceId);
  if (!existingSlugs.has(base)) {
    return base;
  }
  let suffix = 2;
  while (existingSlugs.has(`${base}-${suffix}`)) {
    suffix++;
  }
  return `${base}-${suffix}`;
}
