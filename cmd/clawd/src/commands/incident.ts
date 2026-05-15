import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadClawdConfig, writeClawdConfig, type IncidentModeState } from "../lib/config.js";
import { configurePeers } from "../lib/peers.js";
import { CLAWCHAIN_HOME } from "../lib/paths.js";

export function runIncidentEnter(options: {
  reason?: string;
  noPeerIsolation?: boolean;
  dryRun?: boolean;
}): void {
  const cfg = loadClawdConfig();
  if (cfg.incidentMode?.active) {
    console.log("Incident mode is already active.");
    printIncident(cfg.incidentMode, "pretty");
    return;
  }

  const nodeHome = cfg.nodeHome || CLAWCHAIN_HOME;
  const nodeCfgPath = join(nodeHome, "config", "config.toml");
  const isolatePeers = options.noPeerIsolation !== true;
  const previousSeeds = cfg.seeds;
  const previousPersistentPeers = cfg.persistentPeers;

  if (!options.dryRun && isolatePeers && existsSync(nodeCfgPath)) {
    try {
      configurePeers({
        seeds: "",
        persistentPeers: "",
        nodeHome,
      });
    } catch (err) {
      console.warn(`Warning: failed to patch peer config.toml during incident isolation: ${String(err)}`);
    }
  }

  const incident: IncidentModeState = {
    active: true,
    enteredAt: new Date().toISOString(),
    reason: options.reason?.trim() || "operator-triggered",
    isolation: {
      peersIsolated: isolatePeers,
      previousSeeds,
      previousPersistentPeers,
    },
  };

  if (!options.dryRun) {
    cfg.incidentMode = incident;
    if (isolatePeers) {
      cfg.seeds = "";
      cfg.persistentPeers = "";
    }
    writeClawdConfig(cfg);
  }

  console.log("Incident mode entered.");
  if (options.dryRun) {
    console.log("  dry_run: true");
  }
  printIncident(incident, "pretty");
}

export function runIncidentStatus(options: { out?: string } = {}): void {
  const cfg = loadClawdConfig();
  printIncident(cfg.incidentMode ?? { active: false }, options.out === "json" ? "json" : "pretty");
}

export function runIncidentExit(options: {
  restorePeers?: boolean;
  dryRun?: boolean;
}): void {
  const cfg = loadClawdConfig();
  const state = cfg.incidentMode;
  if (!state?.active) {
    console.log("Incident mode is not active.");
    return;
  }

  const restorePeers = options.restorePeers !== false;
  const nodeHome = cfg.nodeHome || CLAWCHAIN_HOME;
  const nodeCfgPath = join(nodeHome, "config", "config.toml");

  if (restorePeers && state.isolation?.peersIsolated) {
    const seeds = state.isolation.previousSeeds ?? "";
    const persistentPeers = state.isolation.previousPersistentPeers ?? "";

    if (!options.dryRun && existsSync(nodeCfgPath)) {
      try {
        configurePeers({
          seeds,
          persistentPeers,
          nodeHome,
        });
      } catch (err) {
        console.warn(`Warning: failed to patch peer config.toml during incident recovery: ${String(err)}`);
      }
    }

    if (!options.dryRun) {
      cfg.seeds = seeds;
      cfg.persistentPeers = persistentPeers;
    }
  }

  const nextState: IncidentModeState = {
    ...state,
    active: false,
    recoveredAt: new Date().toISOString(),
  };

  if (!options.dryRun) {
    cfg.incidentMode = nextState;
    writeClawdConfig(cfg);
  }

  console.log("Incident mode exited.");
  if (options.dryRun) {
    console.log("  dry_run: true");
  }
  printIncident(nextState, "pretty");
}

function printIncident(state: IncidentModeState, out: "pretty" | "json"): void {
  if (out === "json") {
    console.log(JSON.stringify(state, null, 2));
    return;
  }
  console.log(`  active: ${state.active}`);
  if (state.enteredAt) console.log(`  entered_at: ${state.enteredAt}`);
  if (state.recoveredAt) console.log(`  recovered_at: ${state.recoveredAt}`);
  if (state.reason) console.log(`  reason: ${state.reason}`);
  if (state.isolation) {
    console.log(`  peers_isolated: ${state.isolation.peersIsolated}`);
    console.log(`  previous_seeds: ${state.isolation.previousSeeds ?? ""}`);
    console.log(`  previous_persistent_peers: ${state.isolation.previousPersistentPeers ?? ""}`);
  }
}
