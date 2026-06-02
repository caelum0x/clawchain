<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type {
  ParamsResponse,
  PrivacyParams,
  TreeStatsResponse,
  MerkleRootResponse,
  NullifierExistsResponse,
} from './types';

defineProps(['chain']);

const blockchain = useBlockchain();

const params = ref(null as PrivacyParams | null);
const stats = ref(null as TreeStatsResponse | null);
const merkleRoot = ref('');

const loading = ref(true);
const error = ref('');

// Nullifier lookup state
const nullifierInput = ref('');
const nullifierResult = ref(null as boolean | null);
const nullifierLoading = ref(false);
const nullifierError = ref('');

const BASE = '/clawchain/privacy/v1';

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
    const [statsRes, rootRes, paramRes] = await Promise.all([
      fetchJson<TreeStatsResponse>(`${BASE}/tree_stats`),
      fetchJson<MerkleRootResponse>(`${BASE}/merkle_root`),
      fetchJson<ParamsResponse>(`${BASE}/params`),
    ]);
    stats.value = statsRes || null;
    merkleRoot.value = rootRes?.root || '';
    params.value = paramRes.params || null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function lookupNullifier() {
  const value = nullifierInput.value.trim();
  if (!value) {
    return;
  }
  nullifierLoading.value = true;
  nullifierError.value = '';
  nullifierResult.value = null;
  try {
    const res = await fetchJson<NullifierExistsResponse>(
      `${BASE}/nullifier_exists/${encodeURIComponent(value)}`,
    );
    nullifierResult.value = !!res.exists;
  } catch (e) {
    nullifierError.value = e instanceof Error ? e.message : String(e);
  } finally {
    nullifierLoading.value = false;
  }
}

onMounted(() => {
  load();
});
</script>

<template>
  <div>
    <!-- Header / tree stats + params stat cards -->
    <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <h2 class="card-title truncate w-full mb-4">Privacy</h2>

      <div
        v-if="stats || params"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Commitment Count</div>
          <div class="text-lg font-semibold">{{ stats?.leaf_count ?? '-' }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Tree Depth</div>
          <div class="text-lg font-semibold">{{ stats?.tree_depth ?? '-' }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Max Privacy Tx Per Block</div>
          <div class="text-lg font-semibold">
            {{ params?.max_privacy_tx_per_block ?? '-' }}
          </div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Current Root</div>
          <div class="text-sm font-mono break-all">
            {{ stats?.current_root || merkleRoot || '-' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load privacy data: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div
      v-if="loading"
      class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500"
    >
      Loading privacy data...
    </div>

    <template v-else-if="!error">
      <!-- Merkle Root -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Current Merkle Root</h2>
        <div
          v-if="merkleRoot"
          class="rounded-sm bg-base-200 px-4 py-3 text-sm font-mono break-all"
        >
          {{ merkleRoot }}
        </div>
        <div v-else class="text-center text-gray-500 py-4 text-sm">
          No merkle root reported
        </div>
      </div>

      <!-- Nullifier lookup -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Nullifier Lookup</h2>
        <div class="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            v-model="nullifierInput"
            type="text"
            placeholder="Enter nullifier"
            class="input input-bordered input-sm flex-1 font-mono"
            @keyup.enter="lookupNullifier"
          />
          <button
            class="btn btn-primary btn-sm"
            :disabled="nullifierLoading || !nullifierInput.trim()"
            @click="lookupNullifier"
          >
            Lookup
          </button>
        </div>

        <div v-if="nullifierLoading" class="text-sm text-gray-500">
          Looking up nullifier...
        </div>
        <div v-else-if="nullifierError" class="alert alert-error text-sm">
          <span>Lookup failed: {{ nullifierError }}</span>
        </div>
        <div v-else-if="nullifierResult !== null" class="text-sm">
          <span
            class="badge badge-lg"
            :class="nullifierResult ? 'badge-error' : 'badge-success'"
          >
            {{ nullifierResult ? 'Spent (exists)' : 'Unspent (not found)' }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<route>
    {
      meta: {
        i18n: 'privacy'
      }
    }
</route>
