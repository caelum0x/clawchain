/**
 * `clawd install-node` — install/manage local node auto-start.
 *
 * - Updates clawd config for node binary/home + auto-start.
 * - Optionally builds `clawchaind` from current repo.
 * - Installs a per-user service:
 *   - Linux: systemd --user
 *   - macOS: launchd LaunchAgent
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadClawdConfig, writeClawdConfig } from "../lib/config.js";
import { CLAWCHAIN_HOME } from "../lib/paths.js";

export type InstallNodeOptions = {
  binaryPath?: string;
  nodeHome?: string;
  serviceName?: string;
  buildLocal?: boolean;
  noService?: boolean;
  startNow?: boolean;
};

export async function runInstallNode(options: InstallNodeOptions): Promise<void> {
  const cfg = loadClawdConfig();

  if (options.buildLocal) {
    buildLocalBinary();
  }

  const binaryPath =
    options.binaryPath ??
    cfg.nodeBinaryPath ??
    findBinary("clawchaind") ??
    "clawchaind";

  const nodeHome = options.nodeHome ?? cfg.nodeHome ?? CLAWCHAIN_HOME;
  const serviceName = sanitizeServiceName(options.serviceName ?? "clawd-node");
  const startNow = options.startNow !== false;

  cfg.nodeBinaryPath = binaryPath;
  cfg.nodeHome = nodeHome;
  cfg.nodeAutoStart = true;
  writeClawdConfig(cfg);

  console.log("Node runtime config updated:");
  console.log(`  binary: ${binaryPath}`);
  console.log(`  home:   ${nodeHome}`);
  console.log(`  auto:   true`);

  if (options.noService) {
    console.log("\nService install skipped (--no-service).");
    console.log(`Manual start: ${binaryPath} start --home ${nodeHome}`);
    return;
  }

  if (process.platform === "linux") {
    installLinuxUserService({ binaryPath, nodeHome, serviceName, startNow });
    return;
  }
  if (process.platform === "darwin") {
    installMacLaunchAgent({ binaryPath, nodeHome, serviceName, startNow });
    return;
  }

  console.log("\nAuto-service install is not supported on this OS.");
  console.log(`Manual start: ${binaryPath} start --home ${nodeHome}`);
}

function buildLocalBinary(): void {
  console.log("Building local clawchaind binary...");
  try {
    execFileSync("go", ["install", "./cmd/clawchaind"], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: { ...process.env },
    });
  } catch (err) {
    console.error(`Failed to build local clawchaind: ${String(err)}`);
    process.exit(1);
  }
}

function findBinary(name: string): string | null {
  try {
    const out = execFileSync("which", [name], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

function sanitizeServiceName(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_.-]/g, "-");
  return cleaned || "clawd-node";
}

function installLinuxUserService(params: {
  binaryPath: string;
  nodeHome: string;
  serviceName: string;
  startNow: boolean;
}): void {
  const { binaryPath, nodeHome, serviceName, startNow } = params;
  const serviceDir = join(homedir(), ".config", "systemd", "user");
  const logDir = join(homedir(), ".clawd", "logs");
  mkdirSync(serviceDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });

  const unitPath = join(serviceDir, `${serviceName}.service`);
  const stdoutLog = join(logDir, `${serviceName}.out.log`);
  const stderrLog = join(logDir, `${serviceName}.err.log`);
  const unit = [
    "[Unit]",
    "Description=clawd chain node",
    "After=network-online.target",
    "Wants=network-online.target",
    "StartLimitIntervalSec=300",
    "StartLimitBurst=10",
    "",
    "[Service]",
    "Type=simple",
    `WorkingDirectory=${nodeHome}`,
    `Environment=HOME=${homedir()}`,
    `ExecStart=${binaryPath} start --home ${nodeHome}`,
    "Restart=on-failure",
    "RestartSec=5",
    "TimeoutStopSec=30",
    "KillSignal=SIGINT",
    "LimitNOFILE=65535",
    `StandardOutput=append:${stdoutLog}`,
    `StandardError=append:${stderrLog}`,
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");

  writeFileSync(unitPath, unit);
  console.log(`\nInstalled systemd user unit: ${unitPath}`);

  runSafe(["systemctl", "--user", "daemon-reload"]);
  runSafe(["systemctl", "--user", "enable", `${serviceName}.service`]);
  if (startNow) {
    runSafe(["systemctl", "--user", "restart", `${serviceName}.service`]);
  }

  console.log("Linux service commands:");
  console.log(`  systemctl --user status ${serviceName}.service`);
  console.log(`  systemctl --user restart ${serviceName}.service`);
  console.log(`  journalctl --user -u ${serviceName}.service -f`);
  console.log(`  tail -f ${stdoutLog}`);
  console.log(`  tail -f ${stderrLog}`);
}

function installMacLaunchAgent(params: {
  binaryPath: string;
  nodeHome: string;
  serviceName: string;
  startNow: boolean;
}): void {
  const { binaryPath, nodeHome, serviceName, startNow } = params;
  const label = `ai.clawd.${serviceName}`;
  const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
  const logDir = join(homedir(), "Library", "Logs");
  mkdirSync(launchAgentsDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });

  const plistPath = join(launchAgentsDir, `${label}.plist`);
  const stdoutLog = join(logDir, `${label}.out.log`);
  const stderrLog = join(logDir, `${label}.err.log`);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${binaryPath}</string>
      <string>start</string>
      <string>--home</string>
      <string>${nodeHome}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key>
      <false/>
      <key>Crashed</key>
      <true/>
    </dict>
    <key>SoftResourceLimits</key>
    <dict>
      <key>NumberOfFiles</key>
      <integer>65535</integer>
    </dict>
    <key>HardResourceLimits</key>
    <dict>
      <key>NumberOfFiles</key>
      <integer>65535</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${stdoutLog}</string>
    <key>StandardErrorPath</key>
    <string>${stderrLog}</string>
  </dict>
</plist>
`;
  writeFileSync(plistPath, plist);
  console.log(`\nInstalled launch agent: ${plistPath}`);

  runSafe(["launchctl", "unload", plistPath], true);
  if (startNow) {
    runSafe(["launchctl", "load", plistPath]);
  }

  console.log("macOS service commands:");
  console.log(`  launchctl list | grep ${label}`);
  console.log(`  tail -f ${stdoutLog}`);
  console.log(`  tail -f ${stderrLog}`);
}

function runSafe(argv: string[], allowFailure = false): void {
  try {
    execFileSync(argv[0], argv.slice(1), {
      stdio: "inherit",
      env: { ...process.env },
    });
  } catch (err) {
    if (allowFailure) return;
    console.warn(`Warning: command failed: ${argv.join(" ")} (${String(err)})`);
  }
}
