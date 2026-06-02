<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type {
  ActiveTab,
  InferenceJob,
  InferenceProvider,
  ModelRecord,
  QueryInferenceJobsResponse,
  QueryInferenceProvidersResponse,
  QueryModelsResponse,
} from './types';

const props = defineProps(['chain']);

const blockchain = useBlockchain();

// REST query paths verified against x/modelregistry/types/query.pb.gw.go
const MODELS_PATH = '/clawchain/modelregistry/v1/models';
const JOBS_PATH = '/clawchain/modelregistry/v1/inference/jobs';
const PROVIDERS_PATH = '/clawchain/modelregistry/v1/inference/providers';

const activeTab = ref<ActiveTab>('models');

const models = ref<ModelRecord[]>([]);
const jobs = ref<InferenceJob[]>([]);
const providers = ref<InferenceProvider[]>([]);

const loading = ref(true);
const error = ref('');

function restBase(): string {
  // The blockchain store exposes the selected REST endpoint address.
  return blockchain.endpoint?.address || '';
}

async function fetchJson<T>(path: string): Promise<T> {
  const base = restBase();
  if (!base) throw new Error('No REST endpoint configured for this chain');
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    const [m, j, p] = await Promise.all([
      fetchJson<QueryModelsResponse>(MODELS_PATH),
      fetchJson<QueryInferenceJobsResponse>(JOBS_PATH),
      fetchJson<QueryInferenceProvidersResponse>(PROVIDERS_PATH),
    ]);
    models.value = m.models ?? [];
    jobs.value = j.jobs ?? [];
    providers.value = p.providers ?? [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadAll();
});
</script>

<template>
  <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
    <div class="flex items-center justify-between mb-4">
      <h2 class="card-title truncate">AI Model Registry</h2>
      <button class="btn btn-sm btn-primary" :disabled="loading" @click="loadAll()">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>

    <div class="tabs tabs-boxed mb-4 inline-flex">
      <a
        class="tab"
        :class="{ 'tab-active': activeTab === 'models' }"
        @click="activeTab = 'models'"
      >
        Models ({{ models.length }})
      </a>
      <a
        class="tab"
        :class="{ 'tab-active': activeTab === 'jobs' }"
        @click="activeTab = 'jobs'"
      >
        Inference Jobs ({{ jobs.length }})
      </a>
      <a
        class="tab"
        :class="{ 'tab-active': activeTab === 'providers' }"
        @click="activeTab = 'providers'"
      >
        Providers ({{ providers.length }})
      </a>
    </div>

    <div v-if="error" class="alert alert-error text-sm mb-4">
      <span>{{ error }}</span>
    </div>

    <div v-if="loading" class="py-10 text-center text-sm opacity-60">Loading…</div>

    <!-- Models -->
    <div v-else-if="activeTab === 'models'" class="overflow-x-auto">
      <table class="table table-compact w-full text-sm">
        <thead class="bg-base-200">
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Framework</th>
            <th>Storage URI</th>
            <th>Rating</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(v, index) in models" :key="index">
            <td>
              <RouterLink
                :to="`/${props.chain}/modelregistry/${v.id}`"
                class="text-primary hover:text-indigo-400"
              >
                {{ v.id }}
              </RouterLink>
            </td>
            <td>{{ v.name }}</td>
            <td>{{ v.framework }}</td>
            <td>
              <span class="truncate max-w-[260px] block" :title="v.storage_uri">{{ v.storage_uri }}</span>
            </td>
            <td>{{ v.rating }} ({{ v.rating_count }})</td>
            <td>
              <span class="badge" :class="v.active ? 'badge-success' : 'badge-ghost'">
                {{ v.active ? 'yes' : 'no' }}
              </span>
            </td>
          </tr>
          <tr v-if="models.length === 0">
            <td colspan="6" class="text-center opacity-60 py-6">No models registered</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Inference Jobs -->
    <div v-else-if="activeTab === 'jobs'" class="overflow-x-auto">
      <table class="table table-compact w-full text-sm">
        <thead class="bg-base-200">
          <tr>
            <th>Job ID</th>
            <th>Model ID</th>
            <th>Status</th>
            <th>Requester</th>
            <th>Provider</th>
            <th>Attested</th>
            <th>Disputed</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(v, index) in jobs" :key="index">
            <td>
              <RouterLink
                :to="`/${props.chain}/modelregistry/job/${v.job_id}`"
                class="text-primary hover:text-indigo-400"
              >
                {{ v.job_id }}
              </RouterLink>
            </td>
            <td>{{ v.model_id }}</td>
            <td>
              <span class="badge badge-outline">{{ v.status }}</span>
            </td>
            <td>
              <span class="truncate max-w-[160px] block" :title="v.requester">{{ v.requester }}</span>
            </td>
            <td>
              <span class="truncate max-w-[160px] block" :title="v.provider">{{ v.provider }}</span>
            </td>
            <td>
              <span class="badge" :class="v.attestation_hash ? 'badge-success' : 'badge-ghost'">
                {{ v.attestation_hash ? 'yes' : 'no' }}
              </span>
            </td>
            <td>
              <span class="badge" :class="v.disputed ? 'badge-error' : 'badge-ghost'">
                {{ v.disputed ? 'yes' : 'no' }}
              </span>
            </td>
          </tr>
          <tr v-if="jobs.length === 0">
            <td colspan="7" class="text-center opacity-60 py-6">No inference jobs</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Providers -->
    <div v-else class="overflow-x-auto">
      <table class="table table-compact w-full text-sm">
        <thead class="bg-base-200">
          <tr>
            <th>Address</th>
            <th>Model IDs</th>
            <th>Max Concurrent</th>
            <th>Active Jobs</th>
            <th>Online</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(v, index) in providers" :key="index">
            <td>
              <span class="truncate max-w-[220px] block" :title="v.address">{{ v.address }}</span>
            </td>
            <td>{{ (v.model_ids || []).join(', ') }}</td>
            <td>{{ v.max_concurrent }}</td>
            <td>{{ v.active_jobs }}</td>
            <td>
              <span class="badge" :class="v.is_online ? 'badge-success' : 'badge-ghost'">
                {{ v.is_online ? 'online' : 'offline' }}
              </span>
            </td>
          </tr>
          <tr v-if="providers.length === 0">
            <td colspan="5" class="text-center opacity-60 py-6">No providers registered</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<route>
    {
      meta: {
        i18n: 'modelregistry'
      }
    }
</route>
