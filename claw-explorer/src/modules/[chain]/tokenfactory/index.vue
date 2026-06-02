<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { computed, onMounted, ref } from 'vue';
import type { FactoryDenom, SupplyResponse } from './types';

defineProps(['chain']);

const blockchain = useBlockchain();

const denoms = ref([] as FactoryDenom[]);
const loading = ref(true);
const error = ref('');

// Client-side filter by creator address (replaces the chain denoms_from_creator query,
// which the tokenfactory module does not expose — see the note below).
const creatorFilter = ref('');

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

/** Parse `factory/<creator>/<subdenom>` into its parts. */
function parseFactoryDenom(denom: string, amount: string): FactoryDenom {
  // denom = factory/<creator>/<subdenom>; subdenom may itself contain '/'.
  const rest = denom.slice('factory/'.length);
  const slash = rest.indexOf('/');
  const creator = slash >= 0 ? rest.slice(0, slash) : rest;
  const subdenom = slash >= 0 ? rest.slice(slash + 1) : '';
  return { denom, creator, subdenom, amount };
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // Tokenfactory denoms are minted into bank, so the canonical way to enumerate them is
    // the standard bank supply endpoint (the tokenfactory module ships no query server).
    const res = await fetchJson<SupplyResponse>(
      '/cosmos/bank/v1beta1/supply?pagination.limit=1000',
    );
    denoms.value = (res.supply || [])
      .filter((c) => c.denom.startsWith('factory/'))
      .map((c) => parseFactoryDenom(c.denom, c.amount));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

const filtered = computed(() => {
  const q = creatorFilter.value.trim().toLowerCase();
  if (!q) return denoms.value;
  return denoms.value.filter((d) => d.creator.toLowerCase().includes(q));
});

onMounted(() => {
  load();
});
</script>

<template>
  <div>
    <!-- Header -->
    <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <h2 class="card-title truncate w-full mb-2">Token Factory</h2>
      <p class="text-xs text-gray-500">
        Factory denoms (<code>factory/&lt;creator&gt;/&lt;subdenom&gt;</code>, including AI model
        tokens) are listed from bank supply. Admin / authority metadata is not shown — the
        chain's tokenfactory module exposes no query server.
      </p>
    </div>

    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load token factory denoms: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div
      v-if="loading"
      class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500"
    >
      Loading factory denoms...
    </div>

    <!-- Factory denoms -->
    <div v-else-if="!error" class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 class="card-title truncate">Factory Denoms ({{ filtered.length }})</h2>
        <input
          v-model="creatorFilter"
          type="text"
          placeholder="Filter by creator (claw1...)"
          class="input input-bordered input-sm text-sm w-full sm:w-72"
        />
      </div>

      <div class="overflow-x-auto">
        <table class="table table-compact w-full text-sm">
          <thead class="bg-base-200">
            <tr>
              <th class="text-right">#</th>
              <th>Denom</th>
              <th>Creator</th>
              <th>Subdenom</th>
              <th class="text-right">Supply</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, index) in filtered" :key="d.denom">
              <td class="text-right">{{ index + 1 }}</td>
              <td class="truncate max-w-xs font-mono text-xs">{{ d.denom }}</td>
              <td class="truncate max-w-[12rem] font-mono text-xs">{{ d.creator }}</td>
              <td class="truncate max-w-[10rem]">{{ d.subdenom }}</td>
              <td class="text-right">{{ d.amount }}</td>
            </tr>
            <tr v-if="filtered.length === 0">
              <td colspan="5" class="text-center text-gray-500 py-4">
                No factory denoms found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<route>
    {
      meta: {
        i18n: 'tokenfactory'
      }
    }
</route>
