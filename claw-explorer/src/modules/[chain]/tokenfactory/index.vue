<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type {
  ParamsResponse,
  DenomsFromCreatorResponse,
  DenomAuthorityMetadataResponse,
  TokenfactoryParams,
  DenomAuthorityMetadata,
} from './types';

defineProps(['chain']);

const blockchain = useBlockchain();

const params = ref(null as TokenfactoryParams | null);

const loading = ref(true);
const error = ref('');

// Lookup state: factory denoms created by a given creator address.
const creatorInput = ref('');
const creatorDenoms = ref([] as string[]);
const creatorLoading = ref(false);
const creatorError = ref('');
const creatorDone = ref(false);

// Lookup state: authority (admin) metadata for a given denom.
const denomInput = ref('');
const authority = ref(null as DenomAuthorityMetadata | null);
const authorityLoading = ref(false);
const authorityError = ref('');
const authorityDone = ref(false);

const BASE = '/osmosis/tokenfactory/v1beta1';

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
    const paramRes = await fetchJson<ParamsResponse>(`${BASE}/params`);
    params.value = paramRes.params || null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function lookupCreator() {
  const creator = creatorInput.value.trim();
  creatorError.value = '';
  creatorDenoms.value = [];
  creatorDone.value = false;
  if (!creator) {
    creatorError.value = 'Enter a creator address to look up.';
    return;
  }
  creatorLoading.value = true;
  try {
    const res = await fetchJson<DenomsFromCreatorResponse>(
      `${BASE}/denoms_from_creator/${creator}`,
    );
    creatorDenoms.value = res.denoms || [];
  } catch (e) {
    creatorError.value = e instanceof Error ? e.message : String(e);
  } finally {
    creatorLoading.value = false;
    creatorDone.value = true;
  }
}

async function lookupAuthority() {
  const denom = denomInput.value.trim();
  authorityError.value = '';
  authority.value = null;
  authorityDone.value = false;
  if (!denom) {
    authorityError.value = 'Enter a denom to look up.';
    return;
  }
  authorityLoading.value = true;
  try {
    const res = await fetchJson<DenomAuthorityMetadataResponse>(
      `${BASE}/denoms/${encodeURIComponent(denom)}/authority_metadata`,
    );
    authority.value = res.authority_metadata || null;
  } catch (e) {
    authorityError.value = e instanceof Error ? e.message : String(e);
  } finally {
    authorityLoading.value = false;
    authorityDone.value = true;
  }
}

onMounted(() => {
  load();
});
</script>

<template>
  <div>
    <!-- Header / module params -->
    <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <h2 class="card-title truncate w-full mb-4">Token Factory</h2>

      <div v-if="params">
        <h3 class="font-semibold text-sm mb-2">Denom Creation Fee</h3>
        <div
          v-if="params.denom_creation_fee && params.denom_creation_fee.length"
          class="flex flex-wrap gap-2"
        >
          <span
            v-for="(c, index) in params.denom_creation_fee"
            :key="index"
            class="badge badge-primary badge-lg"
          >{{ c.amount }} {{ c.denom }}</span>
        </div>
        <div v-else class="text-center text-gray-500 py-4 text-sm">
          No denom creation fee configured (denom creation is free)
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load token factory data: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500">
      Loading token factory data...
    </div>

    <template v-else-if="!error">
      <!-- Denoms by creator -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Denoms by Creator</h2>
        <div class="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            v-model="creatorInput"
            type="text"
            placeholder="Enter creator address (claw1...)"
            class="input input-bordered input-sm flex-1 text-sm"
            @keyup.enter="lookupCreator"
          />
          <button class="btn btn-primary btn-sm" :disabled="creatorLoading" @click="lookupCreator">
            {{ creatorLoading ? 'Looking up...' : 'Look up' }}
          </button>
        </div>

        <div v-if="creatorError" class="alert alert-error mb-2 text-sm">
          <span>{{ creatorError }}</span>
        </div>

        <template v-if="creatorDone && !creatorError">
          <div class="overflow-x-auto">
            <table class="table table-compact w-full text-sm">
              <thead class="bg-base-200">
                <tr>
                  <th class="text-right">#</th>
                  <th>Factory Denom</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(d, index) in creatorDenoms" :key="index">
                  <td class="text-right">{{ index + 1 }}</td>
                  <td class="truncate max-w-md">{{ d }}</td>
                </tr>
                <tr v-if="creatorDenoms.length === 0">
                  <td colspan="2" class="text-center text-gray-500 py-4">
                    No factory denoms created by this address
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>

      <!-- Denom authority (admin) lookup -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Denom Authority</h2>
        <div class="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            v-model="denomInput"
            type="text"
            placeholder="Enter denom (factory/claw1.../subdenom)"
            class="input input-bordered input-sm flex-1 text-sm"
            @keyup.enter="lookupAuthority"
          />
          <button class="btn btn-primary btn-sm" :disabled="authorityLoading" @click="lookupAuthority">
            {{ authorityLoading ? 'Looking up...' : 'Look up' }}
          </button>
        </div>

        <div v-if="authorityError" class="alert alert-error mb-2 text-sm">
          <span>{{ authorityError }}</span>
        </div>

        <template v-if="authorityDone && !authorityError">
          <div v-if="authority" class="grid grid-cols-1 gap-4">
            <div class="rounded-sm bg-base-200 px-4 py-3">
              <div class="text-xs text-gray-500">Admin</div>
              <div class="text-sm font-semibold break-all">
                {{ authority.admin || '(no admin)' }}
              </div>
            </div>
          </div>
          <div v-else class="text-center text-gray-500 py-4 text-sm">
            No authority metadata found for this denom.
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<route>
    {
      meta: {
        i18n: 'tokenfactory'
      }
    }
</route>
