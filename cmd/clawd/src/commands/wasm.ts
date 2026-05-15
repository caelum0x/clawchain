/**
 * `clawd wasm` subcommands — CosmWasm contract queries.
 */

import { loadClawdConfig } from "../lib/config.js";
import { table, shortAddr } from "../lib/format.js";

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function getRestUrl(): string {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  return (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// clawd wasm list-code
// ---------------------------------------------------------------------------

export type WasmListCodeOptions = {
  json?: boolean;
};

export async function runWasmListCode(opts: WasmListCodeOptions): Promise<void> {
  const restUrl = getRestUrl();
  const url = `${restUrl}/cosmwasm/wasm/v1/code`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query contract codes (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { code_infos?: any[] };
    const codes = data.code_infos ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ code_infos: codes }, null, 2) + "\n");
      return;
    }

    if (codes.length === 0) {
      console.log("No contract codes found.");
      return;
    }

    const headers = ["Code ID", "Creator", "Data Hash", "Instantiate Permission"];
    const rows = codes.map((c: any) => [
      String(c.code_id ?? ""),
      shortAddr(c.creator ?? ""),
      String(c.data_hash ?? "").slice(0, 16) + "...",
      String(c.instantiate_permission?.permission ?? c.instantiate_permission ?? "Everybody"),
    ]);

    console.log("Uploaded Contract Codes\n");
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query contract codes: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd wasm code-info <codeId>
// ---------------------------------------------------------------------------

export type WasmCodeInfoOptions = {
  codeId: string;
  json?: boolean;
};

export async function runWasmCodeInfo(opts: WasmCodeInfoOptions): Promise<void> {
  const restUrl = getRestUrl();
  const url = `${restUrl}/cosmwasm/wasm/v1/code/${encodeURIComponent(opts.codeId)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`Code ID ${opts.codeId} not found.`);
      } else {
        console.error(`Failed to query code info (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { code_info?: any };
    const info = data.code_info ?? data;

    if (opts.json) {
      process.stdout.write(JSON.stringify(info, null, 2) + "\n");
      return;
    }

    console.log(`Code #${info.code_id ?? opts.codeId}\n`);
    console.log(`  Creator:                ${info.creator ?? ""}`);
    console.log(`  Data Hash:              ${info.data_hash ?? ""}`);
    console.log(`  Instantiate Permission: ${info.instantiate_permission?.permission ?? info.instantiate_permission ?? "Everybody"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query code info: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd wasm list-contracts <codeId>
// ---------------------------------------------------------------------------

export type WasmListContractsOptions = {
  codeId: string;
  json?: boolean;
};

export async function runWasmListContracts(opts: WasmListContractsOptions): Promise<void> {
  const restUrl = getRestUrl();
  const url = `${restUrl}/cosmwasm/wasm/v1/code/${encodeURIComponent(opts.codeId)}/contracts`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query contracts for code ${opts.codeId} (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { contracts?: string[] };
    const contracts = data.contracts ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ contracts }, null, 2) + "\n");
      return;
    }

    if (contracts.length === 0) {
      console.log(`No contracts found for code ID ${opts.codeId}.`);
      return;
    }

    const headers = ["#", "Contract Address"];
    const rows = contracts.map((addr: string, i: number) => [
      String(i + 1),
      addr,
    ]);

    console.log(`Contracts for Code ID ${opts.codeId}\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query contracts: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd wasm contract <address>
// ---------------------------------------------------------------------------

export type WasmContractOptions = {
  address: string;
  json?: boolean;
};

export async function runWasmContract(opts: WasmContractOptions): Promise<void> {
  const restUrl = getRestUrl();
  const url = `${restUrl}/cosmwasm/wasm/v1/contract/${encodeURIComponent(opts.address)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`Contract ${opts.address} not found.`);
      } else {
        console.error(`Failed to query contract (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { contract_info?: any; address?: string };
    const info = data.contract_info ?? data;
    const address = data.address ?? opts.address;

    if (opts.json) {
      process.stdout.write(JSON.stringify({ address, ...info }, null, 2) + "\n");
      return;
    }

    console.log(`Contract ${address}\n`);
    console.log(`  Address:  ${address}`);
    console.log(`  Code ID:  ${info.code_id ?? ""}`);
    console.log(`  Creator:  ${info.creator ?? ""}`);
    console.log(`  Admin:    ${info.admin || "none"}`);
    console.log(`  Label:    ${info.label ?? ""}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query contract: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd wasm query <address> <queryJson>
// ---------------------------------------------------------------------------

export type WasmQueryOptions = {
  address: string;
  queryJson: string;
  json?: boolean;
};

export async function runWasmQuery(opts: WasmQueryOptions): Promise<void> {
  const restUrl = getRestUrl();

  // Encode the query JSON to base64 for the URL
  let base64Query: string;
  try {
    // Validate that it's valid JSON first
    JSON.parse(opts.queryJson);
    base64Query = Buffer.from(opts.queryJson).toString("base64");
  } catch {
    console.error("Invalid query JSON. Please provide a valid JSON string.");
    process.exit(1);
  }

  const url = `${restUrl}/cosmwasm/wasm/v1/contract/${encodeURIComponent(opts.address)}/smart/${base64Query}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`Contract ${opts.address} not found.`);
      } else {
        const body = await res.text().catch(() => "");
        console.error(`Smart query failed (HTTP ${res.status}): ${body}`);
      }
      return;
    }

    const data = (await res.json()) as { data?: any };
    const result = data.data ?? data;

    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }

    console.log("Query Result:\n");
    console.log(JSON.stringify(result, null, 2));
    console.log();
  } catch (err) {
    console.error(`Smart query failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd wasm history <address>
// ---------------------------------------------------------------------------

export type WasmHistoryOptions = {
  address: string;
  json?: boolean;
};

export async function runWasmHistory(opts: WasmHistoryOptions): Promise<void> {
  const restUrl = getRestUrl();
  const url = `${restUrl}/cosmwasm/wasm/v1/contract/${encodeURIComponent(opts.address)}/history`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`Contract ${opts.address} not found.`);
      } else {
        console.error(`Failed to query contract history (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { entries?: any[] };
    const entries = data.entries ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ entries }, null, 2) + "\n");
      return;
    }

    if (entries.length === 0) {
      console.log(`No history found for contract ${opts.address}.`);
      return;
    }

    const headers = ["Operation", "Code ID", "Message"];
    const rows = entries.map((e: any) => [
      String(e.operation ?? ""),
      String(e.code_id ?? ""),
      String(e.msg ? JSON.stringify(e.msg).slice(0, 60) : ""),
    ]);

    console.log(`Contract History: ${opts.address}\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query contract history: ${String(err)}`);
    process.exit(1);
  }
}
