<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type { SkillAnalytics, SkillRecord, SkillResponse } from './types';

const props = defineProps(['skill_id', 'chain']);

const blockchain = useBlockchain();

const skill = ref(null as SkillRecord | null);
const analytics = ref(null as SkillAnalytics | null);

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
    const skillRes = await fetchJson<SkillResponse>(`${BASE}/skill/${props.skill_id}`);
    skill.value = skillRes.skill || null;
    // Best-effort analytics; do not fail the page if it is unavailable.
    try {
      analytics.value = await fetchJson<SkillAnalytics>(`${BASE}/skills/analytics/${props.skill_id}`);
    } catch {
      analytics.value = null;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

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
    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load skill: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500">
      Loading skill details...
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!error && !skill"
      class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500"
    >
      Skill not found
    </div>

    <template v-else-if="skill">
      <!-- Header card -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title flex flex-col md:!justify-between md:!flex-row mb-2">
          <p class="truncate w-full">#{{ skill.id }} {{ skill.name }}</p>
          <div
            class="badge badge-ghost"
            :class="skill.active ? 'badge-success' : 'badge-ghost'"
          >
            {{ skill.active ? 'Active' : 'Inactive' }}
          </div>
        </h2>
        <p v-if="skill.description" class="text-sm text-gray-500 whitespace-pre-line">
          {{ skill.description }}
        </p>
      </div>

      <!-- Key stat cards -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="rounded-sm bg-base-200 px-4 py-3">
            <div class="text-xs text-gray-500">Price</div>
            <div class="text-lg font-semibold">{{ formatPrice(skill) }}</div>
          </div>
          <div class="rounded-sm bg-base-200 px-4 py-3">
            <div class="text-xs text-gray-500">Purchases</div>
            <div class="text-lg font-semibold">{{ skill.purchase_count }}</div>
          </div>
          <div class="rounded-sm bg-base-200 px-4 py-3">
            <div class="text-xs text-gray-500">Total Revenue</div>
            <div class="text-lg font-semibold">{{ skill.total_revenue || '-' }}</div>
          </div>
          <div class="rounded-sm bg-base-200 px-4 py-3">
            <div class="text-xs text-gray-500">Category</div>
            <div class="text-lg font-semibold">{{ skill.category || '-' }}</div>
          </div>
        </div>
      </div>

      <!-- Detail table -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Details</h2>
        <div class="overflow-x-auto">
          <table class="table table-compact w-full text-sm">
            <tbody>
              <tr>
                <td class="text-gray-500 w-1/3">ID</td>
                <td>{{ skill.id }}</td>
              </tr>
              <tr>
                <td class="text-gray-500">Name</td>
                <td class="font-medium">{{ skill.name }}</td>
              </tr>
              <tr>
                <td class="text-gray-500">Owner</td>
                <td class="break-all">{{ skill.owner }}</td>
              </tr>
              <tr>
                <td class="text-gray-500">Category</td>
                <td>{{ skill.category || '-' }}</td>
              </tr>
              <tr>
                <td class="text-gray-500">Version</td>
                <td>{{ skill.version || '-' }}</td>
              </tr>
              <tr>
                <td class="text-gray-500">Price</td>
                <td>{{ formatPrice(skill) }}</td>
              </tr>
              <tr>
                <td class="text-gray-500">Purchases</td>
                <td>{{ skill.purchase_count }}</td>
              </tr>
              <tr>
                <td class="text-gray-500">Total Revenue</td>
                <td>{{ skill.total_revenue || '-' }}</td>
              </tr>
              <tr>
                <td class="text-gray-500">Status</td>
                <td>
                  <span class="badge badge-sm" :class="skill.active ? 'badge-success' : 'badge-ghost'">
                    {{ skill.active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
              </tr>
              <tr v-if="skill.tags && skill.tags.length">
                <td class="text-gray-500">Tags</td>
                <td>
                  <span v-for="(t, i) in skill.tags" :key="i" class="badge badge-ghost badge-sm mr-1">{{ t }}</span>
                </td>
              </tr>
              <tr v-if="skill.dependencies && skill.dependencies.length">
                <td class="text-gray-500">Dependencies</td>
                <td>
                  <span v-for="(d, i) in skill.dependencies" :key="i" class="badge badge-ghost badge-sm mr-1">{{
                    d
                  }}</span>
                </td>
              </tr>
              <tr>
                <td class="text-gray-500">Block Height</td>
                <td>{{ skill.block_height || '-' }}</td>
              </tr>
              <tr>
                <td class="text-gray-500">Timestamp</td>
                <td>{{ skill.timestamp || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Analytics -->
      <div v-if="analytics" class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Analytics</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div class="rounded-sm bg-base-200 px-4 py-3">
            <div class="text-xs text-gray-500">Purchases</div>
            <div class="text-lg font-semibold">{{ analytics.purchase_count }}</div>
          </div>
          <div class="rounded-sm bg-base-200 px-4 py-3">
            <div class="text-xs text-gray-500">Total Revenue</div>
            <div class="text-lg font-semibold">{{ analytics.total_revenue || '-' }}</div>
          </div>
          <div class="rounded-sm bg-base-200 px-4 py-3">
            <div class="text-xs text-gray-500">Version</div>
            <div class="text-lg font-semibold">{{ analytics.version || '-' }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<route>
  {
    meta: {
    }
  }
</route>
