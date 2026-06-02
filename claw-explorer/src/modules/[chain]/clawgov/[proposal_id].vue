<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type {
  Proposal,
  Vote,
  ProposalResponse,
  VotesResponse,
} from './types';

const props = defineProps(['proposal_id', 'chain']);

const blockchain = useBlockchain();

const proposal = ref(null as Proposal | null);
const votes = ref([] as Vote[]);

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

function optionBadge(option: string): string {
  const o = (option || '').toLowerCase();
  if (o.includes('yes')) return 'badge-success';
  if (o.includes('veto')) return 'badge-error';
  if (o.includes('no')) return 'badge-error';
  if (o.includes('abstain')) return 'badge-warning';
  return 'badge-ghost';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const id = props.proposal_id;
    const [propRes, voteRes] = await Promise.all([
      fetchJson<ProposalResponse>(`${BASE}/proposal/${id}`),
      fetchJson<VotesResponse>(`${BASE}/proposal/${id}/votes`),
    ]);
    proposal.value = propRes.proposal || null;
    votes.value = voteRes.votes || [];
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
    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load proposal: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500">
      Loading proposal...
    </div>

    <template v-else-if="!error">
      <!-- Empty state -->
      <div
        v-if="!proposal"
        class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500"
      >
        Proposal #{{ proposal_id }} not found
      </div>

      <template v-else>
        <!-- Proposal detail card -->
        <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
          <h2 class="card-title flex flex-col md:!justify-between md:!flex-row mb-2">
            <p class="truncate w-full">{{ proposal.proposal_id }}. {{ proposal.title }}</p>
            <span class="badge" :class="statusBadge(proposal.status)">{{ proposal.status }}</span>
          </h2>
          <p v-if="proposal.description" class="text-sm text-gray-500 mb-4">
            {{ proposal.description }}
          </p>

          <div class="overflow-x-auto">
            <table class="table w-full text-sm">
              <tbody>
                <tr>
                  <td class="text-gray-500 w-1/3">Parameter</td>
                  <td><span class="font-mono">{{ proposal.module }}.{{ proposal.param_key }}</span></td>
                </tr>
                <tr>
                  <td class="text-gray-500">Proposed Value</td>
                  <td><span class="font-mono break-all">{{ proposal.proposed_value }}</span></td>
                </tr>
                <tr>
                  <td class="text-gray-500">Proposer</td>
                  <td class="font-mono break-all">{{ proposal.proposer }}</td>
                </tr>
                <tr>
                  <td class="text-gray-500">Deposit</td>
                  <td>{{ proposal.deposit }}</td>
                </tr>
                <tr>
                  <td class="text-gray-500">Status</td>
                  <td><span class="badge" :class="statusBadge(proposal.status)">{{ proposal.status }}</span></td>
                </tr>
                <tr>
                  <td class="text-gray-500">Voting End Block</td>
                  <td>{{ proposal.voting_end_block }}</td>
                </tr>
                <tr v-if="proposal.execution_height && proposal.execution_height !== '0'">
                  <td class="text-gray-500">Execution Height</td>
                  <td>{{ proposal.execution_height }}</td>
                </tr>
                <tr v-if="proposal.execution_error">
                  <td class="text-gray-500">Execution Error</td>
                  <td class="text-error">{{ proposal.execution_error }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tally stat cards -->
        <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
          <h2 class="card-title truncate w-full mb-4">Tally</h2>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="rounded-sm bg-base-200 px-4 py-3">
              <div class="text-xs text-gray-500">Yes</div>
              <div class="text-lg font-semibold text-success">{{ proposal.yes_votes }}</div>
            </div>
            <div class="rounded-sm bg-base-200 px-4 py-3">
              <div class="text-xs text-gray-500">No</div>
              <div class="text-lg font-semibold text-error">{{ proposal.no_votes }}</div>
            </div>
            <div class="rounded-sm bg-base-200 px-4 py-3">
              <div class="text-xs text-gray-500">Abstain</div>
              <div class="text-lg font-semibold text-warning">{{ proposal.abstain_votes }}</div>
            </div>
            <div class="rounded-sm bg-base-200 px-4 py-3">
              <div class="text-xs text-gray-500">Veto</div>
              <div class="text-lg font-semibold text-error">{{ proposal.veto_votes }}</div>
            </div>
          </div>
        </div>

        <!-- Votes table -->
        <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
          <h2 class="card-title truncate w-full mb-4">Votes</h2>
          <div class="overflow-x-auto">
            <table class="table table-compact w-full text-sm">
              <thead class="bg-base-200">
                <tr>
                  <th>Voter</th>
                  <th>Option</th>
                  <th class="text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(v, index) in votes" :key="index">
                  <td class="font-mono break-all">{{ v.voter }}</td>
                  <td><span class="badge" :class="optionBadge(v.option)">{{ v.option }}</span></td>
                  <td class="text-right">{{ v.weight }}</td>
                </tr>
                <tr v-if="votes.length === 0">
                  <td colspan="3" class="text-center text-gray-500 py-4">No votes cast</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<route>
    {
      meta: {
      }
    }
</route>
