<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type {
  Proposal,
  GovParams,
  ProposalsResponse,
  ParamsResponse,
} from './types';

const props = defineProps(['chain']);

const blockchain = useBlockchain();

const proposals = ref([] as Proposal[]);
const params = ref(null as GovParams | null);

const loading = ref(true);
const error = ref('');

const BASE = '/clawchain/governance/v1';

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

function statusBadge(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('pass') || s.includes('executed')) return 'badge-success';
  if (s.includes('reject') || s.includes('fail') || s.includes('veto')) return 'badge-error';
  if (s.includes('vot') || s.includes('active') || s.includes('pending')) return 'badge-info';
  return 'badge-ghost';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [propRes, paramRes] = await Promise.all([
      fetchJson<ProposalsResponse>(`${BASE}/proposals`),
      fetchJson<ParamsResponse>(`${BASE}/params`),
    ]);
    proposals.value = propRes.proposals || [];
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
      <h2 class="card-title truncate w-full mb-4">Parameter Governance</h2>

      <div v-if="params" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Voting Period (blocks)</div>
          <div class="text-lg font-semibold">{{ params.voting_period_blocks }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Min Deposit (uclaw)</div>
          <div class="text-lg font-semibold">{{ params.min_deposit_uclaw }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Quorum (bps)</div>
          <div class="text-lg font-semibold">{{ params.quorum_bps }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Threshold (bps)</div>
          <div class="text-lg font-semibold">{{ params.threshold_bps }}</div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load governance data: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500">
      Loading governance data...
    </div>

    <template v-else-if="!error">
      <!-- Proposals table -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Parameter Change Proposals</h2>
        <div class="overflow-x-auto">
          <table class="table table-compact w-full text-sm">
            <thead class="bg-base-200">
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Param Change</th>
                <th>Status</th>
                <th class="text-right">Yes</th>
                <th class="text-right">No</th>
                <th class="text-right">Abstain</th>
                <th class="text-right">Veto</th>
                <th class="text-right">Voting End</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in proposals" :key="p.proposal_id">
                <td>
                  <RouterLink
                    :to="`/${props.chain}/clawgov/${p.proposal_id}`"
                    class="text-primary dark:invert"
                  >
                    {{ p.proposal_id }}
                  </RouterLink>
                </td>
                <td>
                  <div class="font-semibold">{{ p.title }}</div>
                  <div class="text-xs text-gray-500 truncate max-w-xs">{{ p.description }}</div>
                </td>
                <td>
                  <div class="text-xs">
                    <span class="font-mono">{{ p.module }}.{{ p.param_key }}</span>
                  </div>
                  <div class="text-xs text-gray-500 truncate max-w-xs">→ {{ p.proposed_value }}</div>
                </td>
                <td>
                  <span class="badge" :class="statusBadge(p.status)">{{ p.status }}</span>
                </td>
                <td class="text-right">{{ p.yes_votes }}</td>
                <td class="text-right">{{ p.no_votes }}</td>
                <td class="text-right">{{ p.abstain_votes }}</td>
                <td class="text-right">{{ p.veto_votes }}</td>
                <td class="text-right">{{ p.voting_end_block }}</td>
              </tr>
              <tr v-if="proposals.length === 0">
                <td colspan="9" class="text-center text-gray-500 py-4">No proposals submitted</td>
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
        i18n: 'clawgov'
      }
    }
</route>
