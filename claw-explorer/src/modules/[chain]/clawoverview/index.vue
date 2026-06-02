<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type {
  ActivesResponse,
  InferenceJobsResponse,
  InferenceProvidersResponse,
  LiveAgentsResponse,
  ModelsResponse,
  ProposalsResponse,
  SkillsResponse,
  TreeStatsResponse,
} from './types';

const props = defineProps(['chain']);

const blockchain = useBlockchain();

// REST query paths verified against the per-module explorer tabs (rounds 1-4).
const MODELS_PATH = '/clawchain/modelregistry/v1/models';
const JOBS_PATH = '/clawchain/modelregistry/v1/inference/jobs';
const PROVIDERS_PATH = '/clawchain/modelregistry/v1/inference/providers';
const AGENTS_LIVE_PATH = '/clawchain/agent/v1/live';
const SKILLS_PATH = '/clawchain/marketplace/v1/skills';
const ORACLE_ACTIVES_PATH = '/clawchain/oracle/v1beta1/denoms/actives';
const PRIVACY_TREE_STATS_PATH = '/clawchain/privacy/v1/tree_stats';
const PROPOSALS_PATH = '/clawchain/governance/v1/proposals';

// Headline stats. `value` is null until loaded (or if the endpoint is missing),
// in which case the card renders a dash. Refs are replaced immutably.
const models = ref<number | null>(null);
const jobs = ref<number | null>(null);
const providers = ref<number | null>(null);
const agents = ref<number | null>(null);
const skills = ref<number | null>(null);
const oracleDenoms = ref<number | null>(null);
const privacyLeaves = ref<number | null>(null);
const proposals = ref<number | null>(null);

const loading = ref(true);

function restBase(): string {
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

// Run a single best-effort stat fetch. Any failure resolves to null so one
// down endpoint cannot break the whole grid.
async function safe<T>(
  path: string,
  pick: (data: T) => number,
): Promise<number | null> {
  try {
    const data = await fetchJson<T>(path);
    return pick(data);
  } catch {
    return null;
  }
}

async function load() {
  loading.value = true;
  const [
    modelsCount,
    jobsCount,
    providersCount,
    agentsCount,
    skillsCount,
    oracleCount,
    leaves,
    proposalsCount,
  ] = await Promise.all([
    safe<ModelsResponse>(MODELS_PATH, (d) => d.models?.length ?? 0),
    safe<InferenceJobsResponse>(JOBS_PATH, (d) => d.jobs?.length ?? 0),
    safe<InferenceProvidersResponse>(PROVIDERS_PATH, (d) => d.providers?.length ?? 0),
    safe<LiveAgentsResponse>(AGENTS_LIVE_PATH, (d) => d.agents?.length ?? 0),
    safe<SkillsResponse>(SKILLS_PATH, (d) => d.skills?.length ?? 0),
    safe<ActivesResponse>(ORACLE_ACTIVES_PATH, (d) => d.actives?.length ?? 0),
    safe<TreeStatsResponse>(PRIVACY_TREE_STATS_PATH, (d) => Number(d.leaf_count ?? 0)),
    safe<ProposalsResponse>(PROPOSALS_PATH, (d) => d.proposals?.length ?? 0),
  ]);

  models.value = modelsCount;
  jobs.value = jobsCount;
  providers.value = providersCount;
  agents.value = agentsCount;
  skills.value = skillsCount;
  oracleDenoms.value = oracleCount;
  privacyLeaves.value = leaves;
  proposals.value = proposalsCount;
  loading.value = false;
}

function fmt(value: number | null): string {
  return value === null ? '—' : value.toLocaleString();
}

onMounted(() => {
  load();
});
</script>

<template>
  <div>
    <!-- Header -->
    <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
      <h2 class="card-title truncate w-full mb-1">ClawChain Modules</h2>
      <p class="text-sm text-gray-500">
        Headline stats across the custom ClawChain modules. Select a card to open its tab.
      </p>
    </div>

    <!-- Loading skeleton -->
    <div
      v-if="loading"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <div
        v-for="n in 8"
        :key="n"
        class="bg-base-100 px-4 py-5 rounded shadow animate-pulse"
      >
        <div class="h-3 w-24 bg-base-300 rounded mb-3"></div>
        <div class="h-7 w-16 bg-base-300 rounded mb-3"></div>
        <div class="h-3 w-32 bg-base-200 rounded"></div>
      </div>
    </div>

    <!-- Stat-card grid -->
    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <RouterLink
        :to="`/${props.chain}/modelregistry`"
        class="bg-base-100 px-4 py-5 rounded shadow hover:shadow-lg transition-shadow block"
      >
        <div class="text-xs text-gray-500">AI Models</div>
        <div class="text-2xl font-semibold">{{ fmt(models) }}</div>
        <div class="text-xs text-gray-500 mt-1">Registered model tokens</div>
      </RouterLink>

      <RouterLink
        :to="`/${props.chain}/modelregistry`"
        class="bg-base-100 px-4 py-5 rounded shadow hover:shadow-lg transition-shadow block"
      >
        <div class="text-xs text-gray-500">Inference Jobs</div>
        <div class="text-2xl font-semibold">{{ fmt(jobs) }}</div>
        <div class="text-xs text-gray-500 mt-1">Submitted inference jobs</div>
      </RouterLink>

      <RouterLink
        :to="`/${props.chain}/modelregistry`"
        class="bg-base-100 px-4 py-5 rounded shadow hover:shadow-lg transition-shadow block"
      >
        <div class="text-xs text-gray-500">Inference Providers</div>
        <div class="text-2xl font-semibold">{{ fmt(providers) }}</div>
        <div class="text-xs text-gray-500 mt-1">Registered providers</div>
      </RouterLink>

      <RouterLink
        :to="`/${props.chain}/agent`"
        class="bg-base-100 px-4 py-5 rounded shadow hover:shadow-lg transition-shadow block"
      >
        <div class="text-xs text-gray-500">Agents</div>
        <div class="text-2xl font-semibold">{{ fmt(agents) }}</div>
        <div class="text-xs text-gray-500 mt-1">Live agents</div>
      </RouterLink>

      <RouterLink
        :to="`/${props.chain}/marketplace`"
        class="bg-base-100 px-4 py-5 rounded shadow hover:shadow-lg transition-shadow block"
      >
        <div class="text-xs text-gray-500">Marketplace</div>
        <div class="text-2xl font-semibold">{{ fmt(skills) }}</div>
        <div class="text-xs text-gray-500 mt-1">Listed skills</div>
      </RouterLink>

      <RouterLink
        :to="`/${props.chain}/oracle`"
        class="bg-base-100 px-4 py-5 rounded shadow hover:shadow-lg transition-shadow block"
      >
        <div class="text-xs text-gray-500">Oracle</div>
        <div class="text-2xl font-semibold">{{ fmt(oracleDenoms) }}</div>
        <div class="text-xs text-gray-500 mt-1">Active denoms</div>
      </RouterLink>

      <RouterLink
        :to="`/${props.chain}/privacy`"
        class="bg-base-100 px-4 py-5 rounded shadow hover:shadow-lg transition-shadow block"
      >
        <div class="text-xs text-gray-500">Privacy</div>
        <div class="text-2xl font-semibold">{{ fmt(privacyLeaves) }}</div>
        <div class="text-xs text-gray-500 mt-1">Merkle tree leaves</div>
      </RouterLink>

      <RouterLink
        :to="`/${props.chain}/clawgov`"
        class="bg-base-100 px-4 py-5 rounded shadow hover:shadow-lg transition-shadow block"
      >
        <div class="text-xs text-gray-500">Parameter Governance</div>
        <div class="text-2xl font-semibold">{{ fmt(proposals) }}</div>
        <div class="text-xs text-gray-500 mt-1">Governance proposals</div>
      </RouterLink>
    </div>
  </div>
</template>

<route>
    {
      meta: {
        i18n: 'clawoverview'
      }
    }
</route>
