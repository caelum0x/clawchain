<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type {
  ExchangeRatesResponse,
  ActivesResponse,
  ParamsResponse,
  OracleDecCoin,
  OracleParams,
} from './types';

defineProps(['chain']);

const blockchain = useBlockchain();

const rates = ref([] as OracleDecCoin[]);
const actives = ref([] as string[]);
const params = ref(null as OracleParams | null);

const loading = ref(true);
const error = ref('');

const BASE = '/clawchain/oracle/v1beta1';

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
    const [rateRes, activeRes, paramRes] = await Promise.all([
      fetchJson<ExchangeRatesResponse>(`${BASE}/denoms/exchange_rates`),
      fetchJson<ActivesResponse>(`${BASE}/denoms/actives`),
      fetchJson<ParamsResponse>(`${BASE}/params`),
    ]);
    rates.value = rateRes.exchange_rates || [];
    actives.value = activeRes.actives || [];
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
      <h2 class="card-title truncate w-full mb-4">Oracle</h2>

      <div v-if="params" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Vote Period</div>
          <div class="text-lg font-semibold">{{ params.vote_period }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Vote Threshold</div>
          <div class="text-lg font-semibold">{{ params.vote_threshold }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Reward Band</div>
          <div class="text-lg font-semibold">{{ params.reward_band }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Reward Distribution Window</div>
          <div class="text-lg font-semibold">{{ params.reward_distribution_window }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Slash Fraction</div>
          <div class="text-lg font-semibold">{{ params.slash_fraction }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Slash Window</div>
          <div class="text-lg font-semibold">{{ params.slash_window }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Min Valid Per Window</div>
          <div class="text-lg font-semibold">{{ params.min_valid_per_window }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Whitelisted Denoms</div>
          <div class="text-lg font-semibold">{{ params.whitelist?.length ?? 0 }}</div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load oracle data: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500">
      Loading oracle data...
    </div>

    <template v-else-if="!error">
      <!-- Exchange Rates table -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Exchange Rates</h2>
        <div class="overflow-x-auto">
          <table class="table table-compact w-full text-sm">
            <thead class="bg-base-200">
              <tr>
                <th>Denom</th>
                <th class="text-right">Exchange Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(v, index) in rates" :key="index">
                <td>{{ v.denom }}</td>
                <td class="text-right">{{ v.amount }}</td>
              </tr>
              <tr v-if="rates.length === 0">
                <td colspan="2" class="text-center text-gray-500 py-4">No exchange rates reported</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Active Denoms -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Active Denoms</h2>
        <div v-if="actives.length" class="flex flex-wrap gap-2">
          <span v-for="(d, index) in actives" :key="index" class="badge badge-primary badge-lg">{{ d }}</span>
        </div>
        <div v-else class="text-center text-gray-500 py-4 text-sm">No active denoms</div>
      </div>
    </template>
  </div>
</template>

<route>
    {
      meta: {
        i18n: 'oracle'
      }
    }
</route>
