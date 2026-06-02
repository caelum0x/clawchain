<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { computed, onMounted, ref } from 'vue';
import type {
  InferenceJob,
  ModelRecord,
  ModelVersion,
  QueryInferenceJobsResponse,
  QueryModelResponse,
  QueryModelVersionsResponse,
} from './types';

const props = defineProps(['model_id', 'chain']);

const blockchain = useBlockchain();

// REST query paths verified against x/modelregistry/types/query.pb.gw.go
//   GET /clawchain/modelregistry/v1/model/{model_id}
//   GET /clawchain/modelregistry/v1/model/{model_id}/versions
//   GET /clawchain/modelregistry/v1/inference/jobs
const model = ref<ModelRecord | null>(null);
const versions = ref<ModelVersion[]>([]);
const jobs = ref<InferenceJob[]>([]);

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

async function loadModel() {
  loading.value = true;
  error.value = '';
  try {
    const id = props.model_id;
    const [m, ver, j] = await Promise.all([
      fetchJson<QueryModelResponse>(`/clawchain/modelregistry/v1/model/${id}`),
      fetchJson<QueryModelVersionsResponse>(`/clawchain/modelregistry/v1/model/${id}/versions`),
      fetchJson<QueryInferenceJobsResponse>('/clawchain/modelregistry/v1/inference/jobs'),
    ]);
    model.value = m.model ?? null;
    versions.value = ver.versions ?? [];
    // Jobs are filtered client-side to this model (no per-model jobs endpoint exists).
    jobs.value = (j.jobs ?? []).filter((job) => String(job.model_id) === String(id));
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

const jobsPathPrefix = computed(() => `/${props.chain}/modelregistry/job`);

onMounted(() => {
  loadModel();
});
</script>

<template>
  <div>
    <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <div class="flex items-center justify-between mb-4">
        <h2 class="card-title truncate">Model #{{ model_id }}</h2>
        <button class="btn btn-sm btn-primary" :disabled="loading" @click="loadModel()">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <div v-if="error" class="alert alert-error text-sm mb-4">
        <span>{{ error }}</span>
      </div>

      <div v-if="loading" class="py-10 text-center text-sm opacity-60">Loading…</div>

      <div v-else-if="!model" class="py-10 text-center text-sm opacity-60">Model not found</div>

      <table v-else class="table table-compact w-full text-sm">
        <tbody>
          <tr>
            <td class="font-medium w-48">Name</td>
            <td>{{ model.name }}</td>
          </tr>
          <tr>
            <td class="font-medium">Owner</td>
            <td><span class="truncate block" :title="model.owner">{{ model.owner }}</span></td>
          </tr>
          <tr>
            <td class="font-medium">Description</td>
            <td>{{ model.description }}</td>
          </tr>
          <tr>
            <td class="font-medium">Framework</td>
            <td>{{ model.framework }}</td>
          </tr>
          <tr>
            <td class="font-medium">Architecture</td>
            <td>{{ model.architecture }}</td>
          </tr>
          <tr>
            <td class="font-medium">Parameter Count</td>
            <td>{{ model.parameter_count }}</td>
          </tr>
          <tr>
            <td class="font-medium">License</td>
            <td>{{ model.license }}</td>
          </tr>
          <tr>
            <td class="font-medium">Tags</td>
            <td>{{ (model.tags || []).join(', ') }}</td>
          </tr>
          <tr>
            <td class="font-medium">Storage</td>
            <td>
              <span class="truncate block" :title="model.storage_uri">{{ model.storage_type }} — {{ model.storage_uri }}</span>
            </td>
          </tr>
          <tr>
            <td class="font-medium">Checksum (sha256)</td>
            <td><span class="truncate block" :title="model.checksum_sha256">{{ model.checksum_sha256 }}</span></td>
          </tr>
          <tr>
            <td class="font-medium">Size (bytes)</td>
            <td>{{ model.size_bytes }}</td>
          </tr>
          <tr>
            <td class="font-medium">Access Type</td>
            <td>{{ model.access_type }}</td>
          </tr>
          <tr>
            <td class="font-medium">Price / Query</td>
            <td>{{ model.price_per_query_uclaw }} uclaw</td>
          </tr>
          <tr>
            <td class="font-medium">Price One-Time</td>
            <td>{{ model.price_one_time_uclaw }} uclaw</td>
          </tr>
          <tr>
            <td class="font-medium">Subscription</td>
            <td>{{ model.price_subscription_uclaw }} uclaw / {{ model.subscription_period_blocks }} blocks</td>
          </tr>
          <tr>
            <td class="font-medium">Current Version</td>
            <td>{{ model.current_version }}</td>
          </tr>
          <tr>
            <td class="font-medium">Downloads</td>
            <td>{{ model.total_downloads }}</td>
          </tr>
          <tr>
            <td class="font-medium">Total Revenue</td>
            <td>{{ model.total_revenue }} uclaw</td>
          </tr>
          <tr>
            <td class="font-medium">Rating</td>
            <td>{{ model.rating }} ({{ model.rating_count }})</td>
          </tr>
          <tr>
            <td class="font-medium">Active</td>
            <td>
              <span class="badge" :class="model.active ? 'badge-success' : 'badge-ghost'">
                {{ model.active ? 'yes' : 'no' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Versions -->
    <div v-if="!loading && model" class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <h2 class="card-title mb-4">Versions ({{ versions.length }})</h2>
      <div class="overflow-x-auto">
        <table class="table table-compact w-full text-sm">
          <thead class="bg-base-200">
            <tr>
              <th>Version</th>
              <th>Storage URI</th>
              <th>Checksum</th>
              <th>Size (bytes)</th>
              <th>Changelog</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(v, index) in versions" :key="index">
              <td>{{ v.version }}</td>
              <td><span class="truncate max-w-[220px] block" :title="v.storage_uri">{{ v.storage_uri }}</span></td>
              <td><span class="truncate max-w-[160px] block" :title="v.checksum_sha256">{{ v.checksum_sha256 }}</span></td>
              <td>{{ v.size_bytes }}</td>
              <td><span class="truncate max-w-[220px] block" :title="v.changelog">{{ v.changelog }}</span></td>
            </tr>
            <tr v-if="versions.length === 0">
              <td colspan="5" class="text-center opacity-60 py-6">No versions</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Inference jobs for this model -->
    <div v-if="!loading && model" class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <h2 class="card-title mb-4">Inference Jobs ({{ jobs.length }})</h2>
      <div class="overflow-x-auto">
        <table class="table table-compact w-full text-sm">
          <thead class="bg-base-200">
            <tr>
              <th>Job ID</th>
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
                  :to="`${jobsPathPrefix}/${v.job_id}`"
                  class="text-primary hover:text-indigo-400"
                >
                  {{ v.job_id }}
                </RouterLink>
              </td>
              <td><span class="badge badge-outline">{{ v.status }}</span></td>
              <td><span class="truncate max-w-[160px] block" :title="v.requester">{{ v.requester }}</span></td>
              <td><span class="truncate max-w-[160px] block" :title="v.provider">{{ v.provider }}</span></td>
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
              <td colspan="6" class="text-center opacity-60 py-6">No inference jobs for this model</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
