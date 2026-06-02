<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type {
  LiveAgentsResponse,
  ParamsResponse,
  LiveAgentEntry,
  AgentParams,
} from './types';

defineProps(['chain']);

const blockchain = useBlockchain();

const agents = ref([] as LiveAgentEntry[]);
const params = ref(null as AgentParams | null);

const loading = ref(true);
const error = ref('');

const BASE = '/clawchain/agent/v1';

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
    const [liveRes, paramRes] = await Promise.all([
      fetchJson<LiveAgentsResponse>(`${BASE}/live`),
      fetchJson<ParamsResponse>(`${BASE}/params`),
    ]);
    agents.value = liveRes.agents || [];
    params.value = paramRes.params || null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
});
</script>

<template>
  <div>
    <!-- Header / key params stat cards -->
    <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <h2 class="card-title truncate w-full mb-4">Agents</h2>

      <div v-if="params" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Min Agent Deposit (uclaw)</div>
          <div class="text-lg font-semibold">{{ params.min_agent_deposit_uclaw ?? '0' }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Max Heartbeat Gap (blocks)</div>
          <div class="text-lg font-semibold">{{ params.max_heartbeat_gap_blocks ?? '0' }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Min Heartbeat Interval (blocks)</div>
          <div class="text-lg font-semibold">{{ params.min_heartbeat_interval_blocks ?? '0' }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Max Actions / Block</div>
          <div class="text-lg font-semibold">{{ params.max_actions_per_block ?? '0' }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Max Intents / Block</div>
          <div class="text-lg font-semibold">{{ params.max_intents_per_block ?? '0' }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Max Tasks / Block</div>
          <div class="text-lg font-semibold">{{ params.max_tasks_per_block ?? '0' }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Min Task Budget (uclaw)</div>
          <div class="text-lg font-semibold">{{ params.min_task_budget_uclaw ?? '0' }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Reward Pool Fraction (bps)</div>
          <div class="text-lg font-semibold">{{ params.agent_reward_pool_fraction_bps ?? '0' }}</div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load agent data: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500">
      Loading agent data...
    </div>

    <template v-else-if="!error">
      <!-- Live Agents table -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Live Agents</h2>
        <div class="overflow-x-auto">
          <table class="table table-compact w-full text-sm">
            <thead class="bg-base-200">
              <tr>
                <th>Address</th>
                <th>Name</th>
                <th>Endpoint</th>
                <th class="text-right">Last Heartbeat Height</th>
                <th class="text-right">Heartbeats</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, index) in agents" :key="index">
                <td class="truncate max-w-xs">{{ a.address }}</td>
                <td>{{ a.name || '-' }}</td>
                <td class="truncate max-w-xs">{{ a.endpoint || a.liveness?.endpoint || '-' }}</td>
                <td class="text-right">{{ a.liveness?.last_heartbeat_height ?? '-' }}</td>
                <td class="text-right">{{ a.liveness?.heartbeat_count ?? '-' }}</td>
              </tr>
              <tr v-if="agents.length === 0">
                <td colspan="5" class="text-center text-gray-500 py-4">No live agents</td>
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
        i18n: 'agent'
      }
    }
</route>
