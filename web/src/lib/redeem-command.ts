/**
 * Build the exact `clawd model-token redeem` command for the web "Redeem for
 * Inference" page. Mirrors `launch-command.ts`: validate + shell-quote, then
 * assemble the flag string. The browser never signs — it only previews the
 * command a holder runs from a host with their signer mnemonic.
 *
 * The redeem path burns the model token (tokenfactory MsgBurn) and opens a
 * modelregistry inference job (MsgSubmitInferenceJob) in one tx; a provider
 * serves it, and the holder reads the completed job's output.
 *
 * CLI flags (see cmd/clawd/src/main.ts `model-token redeem`):
 *   --model-id <id>   (required) on-chain modelregistry model ID
 *   --amount <n>      (required) model-token amount to burn
 *   --input <prompt>  (required) prompt/input for the inference job
 *   --denom <denom>   (optional) full tokenfactory denom to burn
 */

export interface RedeemCommandInput {
  /** on-chain modelregistry model ID */
  modelId: string;
  /** model-token amount to burn */
  amount: string;
  /** prompt / input for the inference job */
  input: string;
  /** full tokenfactory denom to burn, e.g. `factory/<issuer>/<subdenom>` */
  denom?: string;
}

/** Shell-quote a value the same way `launch-command.ts` does. */
function quote(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function requirePositiveInteger(label: string, value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || !/^\d+$/.test(trimmed) || trimmed === "0") {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return trimmed;
}

/**
 * Build the exact `clawd model-token redeem` command. Validates required +
 * numeric fields and throws a user-friendly error on bad input.
 */
export function buildRedeemCommand(input: RedeemCommandInput): string {
  const modelId = requirePositiveInteger("Model ID", input.modelId);
  const amount = requirePositiveInteger("Amount", input.amount);

  const prompt = (input.input ?? "").trim();
  if (!prompt) {
    throw new Error("Enter a prompt for the inference job.");
  }

  const parts: string[] = [
    "clawd model-token redeem",
    `--model-id ${modelId}`,
    `--amount ${amount}`,
  ];

  const denom = input.denom?.trim();
  if (denom) {
    parts.push(`--denom ${quote(denom)}`);
  }

  // --input last so the (often long) prompt sits at the end of the command.
  parts.push(`--input ${quote(prompt)}`);

  return parts.join(" ");
}
