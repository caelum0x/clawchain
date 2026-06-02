<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type {
  ParamsResponse,
  TopAgentsResponse,
  ReputationResponse,
  EndorsementsResponse,
  ReputationParams,
  ReputationRecord,
  Endorsement,
} from './types';

defineProps(['chain']);

const blockchain = useBlockchain();

const params = ref(null as ReputationParams | null);
const agents = ref([] as ReputationRecord[]);

const loading = ref(true);
const error = ref('');

// Lookup state for a single agent address.
const lookupAddress = ref('');
const lookupRecord = ref(null as ReputationRecord | null);
const lookupFound = ref(false);
const lookupEndorsements = ref([] as Endorsement[]);
const lookupLoading = ref(false);
const lookupError = ref('');
const lookupDone = ref(false);

const BASE = '/clawchain/reputation/v1';

function restBase(): string {
  return blockchain.endpoint?.address || '';
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${restBase()}${path}`);
  if (!res.ok) {
    throw new Error(`${path} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const paramRes = await fetchJson<ParamsResponse>(`${BASE}/params`);
    params.value = paramRes.params || null;
    // top_agents is a best-effort leaderboard; tolerate its absence.
    try {
      const topRes = await fetchJson<TopAgentsResponse>(`${BASE}/top_agents?limit=50`);
      agents.value = topRes.agents || [];
    } catch {
      agents.value = [];
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function lookup() {
  const addr = lookupAddress.value.trim();
  lookupError.value = '';
  lookupRecord.value = null;
  lookupEndorsements.value = [];
  lookupFound.value = false;
  lookupDone.value = false;
  if (!addr) {
    lookupError.value = 'Enter an agent address to look up.';
    return;
  }
  lookupLoading.value = true;
  try {
    const [repRes, endRes] = await Promise.all([
      fetchJson<ReputationResponse>(`${BASE}/reputation/${addr}`),
      fetchJson<EndorsementsResponse>(`${BASE}/endorsements/${addr}`),
    ]);
    lookupRecord.value = repRes.reputation || null;
    lookupFound.value = !!repRes.found;
    lookupEndorsements.value = endRes.endorsements || [];
  } catch (e) {
    lookupError.value = e instanceof Error ? e.message : String(e);
  } finally {
    lookupLoading.value = false;
    lookupDone.value = true;
  }
}

function bpsToPct(bps: string): string {
  const n = Number(bps);
  if (!Number.isFinite(n)) return '-';
  return `${(n / 100).toFixed(2)}%`;
}

onMounted(() => {
  load();
});
</script>

<template>
  <div>
    <!-- Header / module params -->
    <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <h2 class="card-title truncate w-full mb-4">Reputation</h2>

      <div v-if="params" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Max Comment Length</div>
          <div class="text-lg font-semibold">{{ params.max_comment_length }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Heartbeat Penalty (bps)</div>
          <div class="text-lg font-semibold">{{ params.heartbeat_penalty_bps }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Heartbeat Recovery (bps)</div>
          <div class="text-lg font-semibold">{{ params.heartbeat_recovery_bps }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Task SLA On-Time Reward (bps)</div>
          <div class="text-lg font-semibold">{{ params.task_sla_on_time_reward_bps }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Task SLA Late Penalty (bps)</div>
          <div class="text-lg font-semibold">{{ params.task_sla_late_penalty_bps }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Task SLA Lateness Step (blocks)</div>
          <div class="text-lg font-semibold">{{ params.task_sla_lateness_step_blocks }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Decay Rate (bps)</div>
          <div class="text-lg font-semibold">{{ params.decay_rate_bps }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Decay Interval (blocks)</div>
          <div class="text-lg font-semibold">{{ params.decay_interval_blocks }}</div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load reputation data: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500">
      Loading reputation data...
    </div>

    <template v-else-if="!error">
      <!-- Agent lookup -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Agent Lookup</h2>
        <div class="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            v-model="lookupAddress"
            type="text"
            placeholder="Enter agent address (claw1...)"
            class="input input-bordered input-sm flex-1 text-sm"
            @keyup.enter="lookup"
          />
          <button class="btn btn-primary btn-sm" :disabled="lookupLoading" @click="lookup">
            {{ lookupLoading ? 'Looking up...' : 'Look up' }}
          </button>
        </div>

        <div v-if="lookupError" class="alert alert-error mb-2 text-sm">
          <span>{{ lookupError }}</span>
        </div>

        <template v-if="lookupDone && !lookupError">
          <div
            v-if="!lookupFound"
            class="text-center text-gray-500 py-4 text-sm"
          >
            No reputation record found for this address.
          </div>

          <div v-else-if="lookupRecord">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div class="rounded-sm bg-base-200 px-4 py-3">
                <div class="text-xs text-gray-500">Avg Rating Score</div>
                <div class="text-lg font-semibold">{{ bpsToPct(lookupRecord.avg_rating_bps) }}</div>
              </div>
              <div class="rounded-sm bg-base-200 px-4 py-3">
                <div class="text-xs text-gray-500">Uptime Score</div>
                <div class="text-lg font-semibold">{{ bpsToPct(lookupRecord.uptime_score_bps) }}</div>
              </div>
              <div class="rounded-sm bg-base-200 px-4 py-3">
                <div class="text-xs text-gray-500">Total Ratings</div>
                <div class="text-lg font-semibold">{{ lookupRecord.total_ratings }}</div>
              </div>
              <div class="rounded-sm bg-base-200 px-4 py-3">
                <div class="text-xs text-gray-500">Endorsements</div>
                <div class="text-lg font-semibold">{{ lookupRecord.endorsements }}</div>
              </div>
              <div class="rounded-sm bg-base-200 px-4 py-3">
                <div class="text-xs text-gray-500">Intents Created</div>
                <div class="text-lg font-semibold">{{ lookupRecord.intents_created }}</div>
              </div>
              <div class="rounded-sm bg-base-200 px-4 py-3">
                <div class="text-xs text-gray-500">Intents Completed</div>
                <div class="text-lg font-semibold">{{ lookupRecord.intents_completed }}</div>
              </div>
              <div class="rounded-sm bg-base-200 px-4 py-3">
                <div class="text-xs text-gray-500">Skill Purchases</div>
                <div class="text-lg font-semibold">{{ lookupRecord.skill_purchases }}</div>
              </div>
              <div class="rounded-sm bg-base-200 px-4 py-3">
                <div class="text-xs text-gray-500">Last Updated (height)</div>
                <div class="text-lg font-semibold">{{ lookupRecord.last_updated }}</div>
              </div>
            </div>

            <!-- Endorsements for the looked-up agent -->
            <h3 class="font-semibold text-sm mb-2">Endorsements</h3>
            <div class="overflow-x-auto">
              <table class="table table-compact w-full text-sm">
                <thead class="bg-base-200">
                  <tr>
                    <th>ID</th>
                    <th>Endorser</th>
                    <th>Reason</th>
                    <th class="text-right">Block Height</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(e, index) in lookupEndorsements" :key="index">
                    <td>{{ e.id }}</td>
                    <td class="truncate max-w-xs">{{ e.endorser }}</td>
                    <td>{{ e.reason }}</td>
                    <td class="text-right">{{ e.block_height }}</td>
                  </tr>
                  <tr v-if="lookupEndorsements.length === 0">
                    <td colspan="4" class="text-center text-gray-500 py-4">No endorsements</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>

      <!-- Top agents leaderboard -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Top Agents</h2>
        <div class="overflow-x-auto">
          <table class="table table-compact w-full text-sm">
            <thead class="bg-base-200">
              <tr>
                <th>Agent</th>
                <th class="text-right">Avg Rating</th>
                <th class="text-right">Uptime</th>
                <th class="text-right">Total Ratings</th>
                <th class="text-right">Endorsements</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, index) in agents" :key="index">
                <td class="truncate max-w-xs">{{ a.agent_address }}</td>
                <td class="text-right">{{ bpsToPct(a.avg_rating_bps) }}</td>
                <td class="text-right">{{ bpsToPct(a.uptime_score_bps) }}</td>
                <td class="text-right">{{ a.total_ratings }}</td>
                <td class="text-right">{{ a.endorsements }}</td>
              </tr>
              <tr v-if="agents.length === 0">
                <td colspan="5" class="text-center text-gray-500 py-4">No ranked agents available</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<route>
    {
      meta: {
        i18n: 'reputation'
      }
    }
</route>
