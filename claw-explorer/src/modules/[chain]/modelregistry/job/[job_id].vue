<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { computed, onMounted, ref } from 'vue';
import type { InferenceJob, QueryInferenceJobResponse } from '../types';

const props = defineProps(['job_id', 'chain']);

const blockchain = useBlockchain();

// REST query path verified against x/modelregistry/types/query.pb.gw.go
//   GET /clawchain/modelregistry/v1/inference/job/{job_id}
const job = ref<InferenceJob | null>(null);

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

async function loadJob() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetchJson<QueryInferenceJobResponse>(
      `/clawchain/modelregistry/v1/inference/job/${props.job_id}`
    );
    job.value = res.job ?? null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

const modelLink = computed(() =>
  job.value ? `/${props.chain}/modelregistry/${job.value.model_id}` : ''
);

onMounted(() => {
  loadJob();
});
</script>

<template>
  <div>
    <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <div class="flex items-center justify-between mb-4">
        <h2 class="card-title truncate">Inference Job #{{ job_id }}</h2>
        <button class="btn btn-sm btn-primary" :disabled="loading" @click="loadJob()">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <div v-if="error" class="alert alert-error text-sm mb-4">
        <span>{{ error }}</span>
      </div>

      <div v-if="loading" class="py-10 text-center text-sm opacity-60">Loading…</div>

      <div v-else-if="!job" class="py-10 text-center text-sm opacity-60">Job not found</div>

      <table v-else class="table table-compact w-full text-sm">
        <tbody>
          <tr>
            <td class="font-medium w-48">Status</td>
            <td><span class="badge badge-outline">{{ job.status }}</span></td>
          </tr>
          <tr>
            <td class="font-medium">Model</td>
            <td>
              <RouterLink :to="modelLink" class="text-primary hover:text-indigo-400">
                #{{ job.model_id }}
              </RouterLink>
              <span class="opacity-60"> (version {{ job.model_version }})</span>
            </td>
          </tr>
          <tr>
            <td class="font-medium">Requester</td>
            <td><span class="truncate block" :title="job.requester">{{ job.requester }}</span></td>
          </tr>
          <tr>
            <td class="font-medium">Provider</td>
            <td><span class="truncate block" :title="job.provider">{{ job.provider }}</span></td>
          </tr>
          <tr>
            <td class="font-medium">Payment</td>
            <td>{{ job.payment }} uclaw</td>
          </tr>
          <tr>
            <td class="font-medium">Max Tokens</td>
            <td>{{ job.max_tokens }}</td>
          </tr>
          <tr>
            <td class="font-medium">Temperature</td>
            <td>{{ job.temperature }}</td>
          </tr>
          <tr>
            <td class="font-medium">Gas Used</td>
            <td>{{ job.gas_used }}</td>
          </tr>
          <tr>
            <td class="font-medium">Created At</td>
            <td>{{ job.created_at }}</td>
          </tr>
          <tr>
            <td class="font-medium">Started At</td>
            <td>{{ job.started_at }}</td>
          </tr>
          <tr>
            <td class="font-medium">Completed At</td>
            <td>{{ job.completed_at }}</td>
          </tr>
          <tr>
            <td class="font-medium">Timeout Block</td>
            <td>{{ job.timeout_block }}</td>
          </tr>
          <tr v-if="job.error_msg">
            <td class="font-medium">Error</td>
            <td class="text-error">{{ job.error_msg }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Input / Output -->
    <div v-if="!loading && job" class="grid gap-4 mb-4 lg:!!grid-cols-2 auto-rows-max">
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded shadow">
        <h2 class="card-title mb-2">Input</h2>
        <pre class="text-sm whitespace-pre-wrap break-words bg-base-200 rounded p-3">{{ job.input || '—' }}</pre>
      </div>
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded shadow">
        <h2 class="card-title mb-2">Output</h2>
        <pre class="text-sm whitespace-pre-wrap break-words bg-base-200 rounded p-3">{{ job.output || '—' }}</pre>
      </div>
    </div>

    <!-- P4 settlement state -->
    <div v-if="!loading && job" class="grid gap-4 mb-4 lg:!!grid-cols-2 auto-rows-max">
      <!-- Attested card -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded shadow">
        <div class="flex items-center justify-between mb-2">
          <h2 class="card-title">Usage Attestation</h2>
          <span class="badge" :class="job.attestation_hash ? 'badge-success' : 'badge-ghost'">
            {{ job.attestation_hash ? 'Attested' : 'Not attested' }}
          </span>
        </div>
        <table class="table table-compact w-full text-sm">
          <tbody>
            <tr>
              <td class="font-medium w-48">Attestation Hash</td>
              <td><span class="truncate block" :title="job.attestation_hash">{{ job.attestation_hash || '—' }}</span></td>
            </tr>
            <tr>
              <td class="font-medium">Attested Output Tokens</td>
              <td>{{ job.attested_output_tokens || '—' }}</td>
            </tr>
            <tr>
              <td class="font-medium">Attested At</td>
              <td>{{ job.attested_at || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Disputed card -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded shadow">
        <div class="flex items-center justify-between mb-2">
          <h2 class="card-title">Dispute</h2>
          <span class="badge" :class="job.disputed ? 'badge-error' : 'badge-ghost'">
            {{ job.disputed ? 'Disputed' : 'No dispute' }}
          </span>
        </div>
        <table class="table table-compact w-full text-sm">
          <tbody>
            <tr>
              <td class="font-medium w-48">Disputed</td>
              <td>
                <span class="badge" :class="job.disputed ? 'badge-error' : 'badge-ghost'">
                  {{ job.disputed ? 'yes' : 'no' }}
                </span>
              </td>
            </tr>
            <tr>
              <td class="font-medium">Dispute Reason</td>
              <td>{{ job.dispute_reason || '—' }}</td>
            </tr>
            <tr>
              <td class="font-medium">Disputed At</td>
              <td>{{ job.disputed_at || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
