<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { computed, onMounted, ref } from 'vue';
import type { MarketplaceParams, ParamsResponse, SkillRecord, SkillsResponse } from './types';

defineProps(['chain']);

const blockchain = useBlockchain();

const skills = ref([] as SkillRecord[]);
const params = ref(null as MarketplaceParams | null);

const loading = ref(true);
const error = ref('');

const BASE = '/clawchain/marketplace/v1';

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
    const [skillRes, paramRes] = await Promise.all([
      fetchJson<SkillsResponse>(`${BASE}/skills`),
      fetchJson<ParamsResponse>(`${BASE}/params`),
    ]);
    skills.value = skillRes.skills || [];
    params.value = paramRes.params || null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

const activeCount = computed(() => skills.value.filter((s) => s.active).length);

function formatPrice(s: SkillRecord): string {
  if (!s.price) return '-';
  return `${s.price} ${s.denom || ''}`.trim();
}

onMounted(() => {
  load();
});
</script>

<template>
  <div>
    <!-- Header / key stat cards -->
    <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <h2 class="card-title truncate w-full mb-4">Marketplace</h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Total Skills</div>
          <div class="text-lg font-semibold">{{ skills.length }}</div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Active Skills</div>
          <div class="text-lg font-semibold">{{ activeCount }}</div>
        </div>
        <div v-if="params" class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Max Skills Per Agent</div>
          <div class="text-lg font-semibold">{{ params.max_skills_per_agent }}</div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load marketplace data: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500">
      Loading marketplace data...
    </div>

    <template v-else-if="!error">
      <!-- Skills / Listings table -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Skills / Listings</h2>
        <div class="overflow-x-auto">
          <table class="table table-compact w-full text-sm">
            <thead class="bg-base-200">
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Owner</th>
                <th>Category</th>
                <th class="text-right">Price</th>
                <th class="text-right">Purchases</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, index) in skills" :key="index">
                <td>{{ s.id }}</td>
                <td class="font-medium">{{ s.name }}</td>
                <td class="truncate max-w-[200px]" :title="s.owner">{{ s.owner }}</td>
                <td>{{ s.category || '-' }}</td>
                <td class="text-right">{{ formatPrice(s) }}</td>
                <td class="text-right">{{ s.purchase_count }}</td>
                <td class="text-center">
                  <span
                    class="badge badge-sm"
                    :class="s.active ? 'badge-success' : 'badge-ghost'"
                  >
                    {{ s.active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
              </tr>
              <tr v-if="skills.length === 0">
                <td colspan="7" class="text-center text-gray-500 py-4">No skills listed</td>
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
        i18n: 'marketplace'
      }
    }
</route>
