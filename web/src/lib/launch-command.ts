/**
 * Pure builders for the "Launch a Model Token" wizard.
 *
 * The web app never signs wasm-store / tokenfactory txs in the browser; instead
 * this module derives the exact `clawd` commands a user runs from the CLI/SDK to
 * actually launch a model token and (optionally) deploy its ModelVault.
 *
 * Subdenom normalization mirrors `normalizeModelTokenSubdenom` in
 * cmd/clawd/src/commands/model-token.ts so the previewed denom matches what the
 * CLI will mint.
 */

/** Maximum tokenfactory subdenom length enforced by the CLI. */
export const MAX_SUBDENOM_LEN = 128;

export interface LaunchModelInput {
  /** Model slug or OpenRouter model ID, e.g. "anthropic/claude-opus-4.8". */
  model: string;
  /** Optional explicit tokenfactory subdenom; defaults to normalized model. */
  symbol?: string;
  /** Initial supply to mint (base units, positive integer). */
  supply: string;
  /** Optional model registry display name. */
  name?: string;
  /** Optional model registry description. */
  description?: string;
  /** Reserve / base denom used for the bonding curve + DEX pair. */
  reserveDenom: string;
  /** Optional Astroport factory contract to create a TOKEN/CLAW pair. */
  dexFactory?: string;
  /** Optional reserve-denom amount to seed into the DEX pool. */
  baseAmount?: string;
  /** Optional model-token amount to seed into the DEX pool. */
  modelAmount?: string;
  /** Whether to also emit a `model-vault deploy` command. */
  deployVault: boolean;
  /** ModelVault swap fee in basis points (only used when deployVault). */
  feeBps?: string;
  /** Optional reserve amount to seed the vault bonding curve after instantiate. */
  seedReserve?: string;
  /** Optional model-token inventory to seed the vault after instantiate. */
  seedInventory?: string;
}

export interface LaunchPreview {
  /** Normalized tokenfactory subdenom (lowercase alnum + _ + /). */
  subdenom: string;
  /** Full factory denom, with a placeholder issuer when address is unknown. */
  denom: string;
  /** ModelVault instantiate label preview. */
  vaultLabel: string;
}

/** Issuer placeholder shown when no wallet is connected. */
export const ISSUER_PLACEHOLDER = "<issuer>";

/**
 * Normalize a model id / symbol into a tokenfactory subdenom.
 * Mirrors normalizeModelTokenSubdenom in the clawd CLI.
 */
export function normalizeSubdenom(model: string, symbol?: string): string {
  const raw = (symbol ?? model).trim().toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9/_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_/]+|[_/]+$/g, "");
  if (!normalized) {
    throw new Error("Model id or symbol cannot be empty.");
  }
  if (normalized.length > MAX_SUBDENOM_LEN) {
    throw new Error(`Subdenom must be ${MAX_SUBDENOM_LEN} characters or fewer.`);
  }
  return normalized;
}

function requirePositiveInteger(label: string, value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!/^[0-9]+$/.test(v) || BigInt(v) <= 0n) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return v;
}

function requireNonNegativeInteger(label: string, value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!/^[0-9]+$/.test(v)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return v;
}

/** Quote a flag value for the shell only when it contains whitespace. */
function quote(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/**
 * Derive the previewed denom + vault label without throwing on partial input
 * (used for live UI hints). Returns null when the model id is not yet valid.
 */
export function previewLaunch(input: LaunchModelInput, issuer?: string | null): LaunchPreview | null {
  let subdenom: string;
  try {
    subdenom = normalizeSubdenom(input.model, input.symbol);
  } catch {
    return null;
  }
  const owner = issuer?.trim() || ISSUER_PLACEHOLDER;
  return {
    subdenom,
    denom: `factory/${owner}/${subdenom}`,
    vaultLabel: `model-vault-${subdenom}`,
  };
}

/**
 * Build the exact `clawd model-token issue` command (and, when requested, a
 * follow-up `clawd model-vault deploy` command). Validates required + numeric
 * fields and throws a user-friendly error on bad input.
 */
export function buildLaunchCommand(input: LaunchModelInput): string {
  const model = input.model.trim();
  if (!model) {
    throw new Error("Enter a model id or OpenRouter model ID.");
  }
  // Validate subdenom early so the error surfaces before flag assembly.
  const subdenom = normalizeSubdenom(input.model, input.symbol);
  const supply = requirePositiveInteger("Supply", input.supply);

  const issue: string[] = ["clawd model-token issue", `--model ${quote(model)}`, `--supply ${supply}`];

  if (input.symbol?.trim()) {
    issue.push(`--symbol ${quote(input.symbol.trim())}`);
  }
  if (input.name?.trim()) {
    issue.push(`--name ${quote(input.name.trim())}`);
  }
  if (input.description?.trim()) {
    issue.push(`--description ${quote(input.description.trim())}`);
  }

  const reserveDenom = input.reserveDenom.trim();
  if (!reserveDenom) {
    throw new Error("Reserve denom cannot be empty.");
  }

  if (input.dexFactory?.trim()) {
    issue.push(`--dex-factory ${quote(input.dexFactory.trim())}`);
    issue.push(`--base-denom ${quote(reserveDenom)}`);
    if (input.baseAmount?.trim()) {
      issue.push(`--base-amount ${requirePositiveInteger("DEX reserve seed", input.baseAmount)}`);
    }
    if (input.modelAmount?.trim()) {
      issue.push(`--model-amount ${requirePositiveInteger("DEX model seed", input.modelAmount)}`);
    }
  }

  const lines = [issue.join(" \\\n  ")];

  if (input.deployVault) {
    lines.push(buildVaultDeployCommand({ ...input, subdenom, reserveDenom }));
  }

  return lines.join("\n\n");
}

/** Build the standalone `clawd model-vault deploy` command for the launched denom. */
function buildVaultDeployCommand(args: {
  subdenom: string;
  reserveDenom: string;
  feeBps?: string;
  seedReserve?: string;
  seedInventory?: string;
}): string {
  // The vault references the minted factory denom; issuer is resolved at run time
  // by the CLI signer, so we use the placeholder in the previewed command.
  const denom = `factory/${ISSUER_PLACEHOLDER}/${args.subdenom}`;
  const deploy: string[] = [
    "clawd model-vault deploy",
    `--model-denom ${quote(denom)}`,
    `--reserve-denom ${quote(args.reserveDenom)}`,
    `--label model-vault-${args.subdenom}`,
  ];

  if (args.feeBps?.trim()) {
    deploy.push(`--fee-bps ${requireNonNegativeInteger("Fee bps", args.feeBps)}`);
  }
  if (args.seedReserve?.trim()) {
    deploy.push(`--seed-reserve ${requirePositiveInteger("Vault reserve seed", args.seedReserve)}`);
  }
  if (args.seedInventory?.trim()) {
    deploy.push(`--seed-inventory ${requirePositiveInteger("Vault inventory seed", args.seedInventory)}`);
  }

  return deploy.join(" \\\n  ");
}
