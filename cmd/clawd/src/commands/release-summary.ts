import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

type ReleaseEvidence = {
  generated_at_utc?: string;
  overall_status?: string;
  inputs?: {
    manifest?: string;
    host?: string;
  };
  gates?: Record<string, string>;
};

export async function runReleaseSummary(opts: {
  json?: boolean;
  failedOnly?: boolean;
} = {}): Promise<void> {
  const evidencePath = "artifacts/release-evidence.json";
  if (!existsSync(evidencePath)) {
    throw new Error(`missing ${evidencePath}; run: make release-evidence-pack`);
  }

  const raw = await readFile(evidencePath, "utf8");
  const parsed = JSON.parse(raw) as ReleaseEvidence;
  const gates = parsed.gates ?? {};
  const gateEntries = Object.entries(gates).sort((a, b) => a[0].localeCompare(b[0]));
  const filtered = opts.failedOnly
    ? gateEntries.filter(([, status]) => status !== "passed" && status !== "not_recorded")
    : gateEntries;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          generated_at_utc: parsed.generated_at_utc ?? null,
          overall_status: parsed.overall_status ?? "unknown",
          inputs: parsed.inputs ?? {},
          gates: Object.fromEntries(filtered),
        },
        null,
        2,
      ) + "\n",
    );
    if ((parsed.overall_status ?? "") !== "passed") {
      process.exitCode = 1;
    }
    return;
  }

  console.log("clawd release-summary\n");
  console.log(`  Evidence: ${evidencePath}`);
  console.log(`  Generated: ${parsed.generated_at_utc ?? "unknown"}`);
  console.log(`  Overall: ${parsed.overall_status ?? "unknown"}`);
  if (parsed.inputs?.manifest) console.log(`  Manifest: ${parsed.inputs.manifest}`);
  if (parsed.inputs?.host) console.log(`  Host:     ${parsed.inputs.host}`);
  console.log("");

  if (filtered.length === 0) {
    console.log("No gates to display.");
  } else {
    for (const [name, status] of filtered) {
      console.log(`- ${name}: ${status}`);
    }
  }

  if ((parsed.overall_status ?? "") !== "passed") {
    process.exitCode = 1;
  }
}
