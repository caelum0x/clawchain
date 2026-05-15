import { loadClawdConfig } from "../lib/config.js";
import { evaluateProviderLifecycle } from "../lib/provider-lifecycle.js";

export async function runProviderStatus(opts: { out?: string } = {}): Promise<void> {
  const lifecycle = await evaluateProviderLifecycle();
  const config = loadClawdConfig();
  const out = opts.out === "json" ? "json" : "pretty";

  if (out === "json") {
    process.stdout.write(
      JSON.stringify(
        {
          chainId: lifecycle.chainId || config.chainId,
          agentAddress: lifecycle.agentAddress,
          ready: lifecycle.ready,
          blockers: lifecycle.blockers,
          registration: lifecycle.registration,
          heartbeat: lifecycle.heartbeat,
          recovery: lifecycle.recovery,
          rewards: lifecycle.rewards,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("Provider Status\n");
  console.log(`  Chain ID:      ${lifecycle.chainId || config.chainId}`);
  console.log(`  Agent:         ${lifecycle.agentAddress ?? "(not configured)"}`);
  console.log(`  Ready:         ${lifecycle.ready}`);
  console.log(`  Registration:  ${lifecycle.registration.ok} (${lifecycle.registration.detail})`);
  console.log(`  Heartbeat:     ${lifecycle.heartbeat.ok} (${lifecycle.heartbeat.detail})`);
  console.log(`  Recovery:      ${lifecycle.recovery.ok} (${lifecycle.recovery.detail})`);
  console.log(`  Rewards:       ${lifecycle.rewards.ok} (${lifecycle.rewards.detail})`);
  console.log(`  Reward total:  ${lifecycle.rewards.agentRewardsUclaw ?? "unknown"} uclaw`);
  console.log(`  Staking lines: ${lifecycle.rewards.stakingRewards.length}`);
  if (lifecycle.blockers.length > 0) {
    console.log(`  Blockers:      ${lifecycle.blockers.join(" | ")}`);
  }
  console.log();
}
