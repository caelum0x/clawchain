<script lang="ts" setup>
import { useBlockchain } from '@/stores';
import { onMounted, ref } from 'vue';
import type {
  ParamsResponse,
  MessagingParams,
  MessagesResponse,
  ConversationResponse,
  MessageEntry,
} from './types';

defineProps(['chain']);

const blockchain = useBlockchain();

const params = ref(null as MessagingParams | null);

const loading = ref(true);
const error = ref('');

// Inbox lookup (messages by address) state
const addressInput = ref('');
const inbox = ref([] as MessageEntry[]);
const inboxQueried = ref(false);
const inboxLoading = ref(false);
const inboxError = ref('');

// Conversation lookup (messages between two addresses) state
const convAInput = ref('');
const convBInput = ref('');
const conversation = ref([] as MessageEntry[]);
const convQueried = ref(false);
const convLoading = ref(false);
const convError = ref('');

const BASE = '/clawchain/messaging/v1';

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

async function lookupInbox() {
  const value = addressInput.value.trim();
  if (!value) {
    return;
  }
  inboxLoading.value = true;
  inboxError.value = '';
  inbox.value = [];
  inboxQueried.value = false;
  try {
    const res = await fetchJson<MessagesResponse>(
      `${BASE}/messages/${encodeURIComponent(value)}`,
    );
    inbox.value = res.messages || [];
    inboxQueried.value = true;
  } catch (e) {
    inboxError.value = e instanceof Error ? e.message : String(e);
  } finally {
    inboxLoading.value = false;
  }
}

async function lookupConversation() {
  const a = convAInput.value.trim();
  const b = convBInput.value.trim();
  if (!a || !b) {
    return;
  }
  convLoading.value = true;
  convError.value = '';
  conversation.value = [];
  convQueried.value = false;
  try {
    const res = await fetchJson<ConversationResponse>(
      `${BASE}/conversation/${encodeURIComponent(a)}/${encodeURIComponent(b)}`,
    );
    conversation.value = res.messages || [];
    convQueried.value = true;
  } catch (e) {
    convError.value = e instanceof Error ? e.message : String(e);
  } finally {
    convLoading.value = false;
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
      <h2 class="card-title truncate w-full mb-4">Messaging</h2>

      <div
        v-if="params"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Max Message Size (bytes)</div>
          <div class="text-lg font-semibold">
            {{ params.max_message_size ?? '-' }}
          </div>
        </div>
        <div class="rounded-sm bg-base-200 px-4 py-3">
          <div class="text-xs text-gray-500">Message TTL (blocks)</div>
          <div class="text-lg font-semibold">
            {{ params.message_ttl_blocks ?? '-' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error" class="alert alert-error mb-4 text-sm">
      <span>Failed to load messaging data: {{ error }}</span>
    </div>

    <!-- Loading state -->
    <div
      v-if="loading"
      class="bg-base-100 px-4 py-6 rounded mb-4 shadow text-center text-sm text-gray-500"
    >
      Loading messaging data...
    </div>

    <template v-else-if="!error">
      <!-- Inbox lookup (messages by address) -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Messages by Address</h2>
        <div class="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            v-model="addressInput"
            type="text"
            placeholder="Enter address (claw1...)"
            class="input input-bordered input-sm flex-1 font-mono"
            @keyup.enter="lookupInbox"
          />
          <button
            class="btn btn-primary btn-sm"
            :disabled="inboxLoading || !addressInput.trim()"
            @click="lookupInbox"
          >
            Lookup
          </button>
        </div>

        <div v-if="inboxLoading" class="text-sm text-gray-500">
          Loading messages...
        </div>
        <div v-else-if="inboxError" class="alert alert-error text-sm">
          <span>Lookup failed: {{ inboxError }}</span>
        </div>
        <div v-else-if="inboxQueried" class="overflow-x-auto">
          <table class="table table-compact w-full text-sm">
            <thead class="bg-base-200">
              <tr>
                <th>ID</th>
                <th>Sender</th>
                <th>Recipient</th>
                <th class="text-right">Block</th>
                <th class="text-center">Ack</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(m, index) in inbox" :key="index">
                <td>{{ m.id }}</td>
                <td class="font-mono truncate max-w-xs">{{ m.sender }}</td>
                <td class="font-mono truncate max-w-xs">{{ m.recipient }}</td>
                <td class="text-right">{{ m.block_height }}</td>
                <td class="text-center">
                  <span
                    class="badge badge-sm"
                    :class="m.acknowledged ? 'badge-success' : 'badge-ghost'"
                  >
                    {{ m.acknowledged ? 'Yes' : 'No' }}
                  </span>
                </td>
              </tr>
              <tr v-if="inbox.length === 0">
                <td colspan="5" class="text-center text-gray-500 py-4">
                  No messages for this address
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Conversation lookup (messages between two addresses) -->
      <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow">
        <h2 class="card-title truncate w-full mb-4">Conversation</h2>
        <div class="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            v-model="convAInput"
            type="text"
            placeholder="Address A (claw1...)"
            class="input input-bordered input-sm flex-1 font-mono"
            @keyup.enter="lookupConversation"
          />
          <input
            v-model="convBInput"
            type="text"
            placeholder="Address B (claw1...)"
            class="input input-bordered input-sm flex-1 font-mono"
            @keyup.enter="lookupConversation"
          />
          <button
            class="btn btn-primary btn-sm"
            :disabled="convLoading || !convAInput.trim() || !convBInput.trim()"
            @click="lookupConversation"
          >
            Lookup
          </button>
        </div>

        <div v-if="convLoading" class="text-sm text-gray-500">
          Loading conversation...
        </div>
        <div v-else-if="convError" class="alert alert-error text-sm">
          <span>Lookup failed: {{ convError }}</span>
        </div>
        <div v-else-if="convQueried" class="overflow-x-auto">
          <table class="table table-compact w-full text-sm">
            <thead class="bg-base-200">
              <tr>
                <th>ID</th>
                <th>Sender</th>
                <th>Recipient</th>
                <th class="text-right">Block</th>
                <th class="text-center">Ack</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(m, index) in conversation" :key="index">
                <td>{{ m.id }}</td>
                <td class="font-mono truncate max-w-xs">{{ m.sender }}</td>
                <td class="font-mono truncate max-w-xs">{{ m.recipient }}</td>
                <td class="text-right">{{ m.block_height }}</td>
                <td class="text-center">
                  <span
                    class="badge badge-sm"
                    :class="m.acknowledged ? 'badge-success' : 'badge-ghost'"
                  >
                    {{ m.acknowledged ? 'Yes' : 'No' }}
                  </span>
                </td>
              </tr>
              <tr v-if="conversation.length === 0">
                <td colspan="5" class="text-center text-gray-500 py-4">
                  No messages between these addresses
                </td>
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
        i18n: 'messaging'
      }
    }
</route>
