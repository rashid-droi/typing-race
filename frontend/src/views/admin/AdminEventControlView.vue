<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  apiUrl,
  fetchManagedEvent,
  fetchManagedEventQrBlob,
  updateManagedEventStatus,
  type ManagedEventRow,
  type ManagedEventStatus,
} from "../../lib/adminApi";
import { useAdminAuthStore } from "../../stores/adminAuth";

const route = useRoute();
const admin = useAdminAuthStore();

const event = ref<ManagedEventRow | null>(null);
const error = ref<string | null>(null);
const copyHint = ref<string | null>(null);
const qrObjectUrl = ref<string | null>(null);
const statusBusy = ref(false);

const eventId = () => String(route.params.id ?? "");

async function load() {
  const t = admin.token;
  if (!t) return;
  error.value = null;
  try {
    event.value = await fetchManagedEvent(t, eventId());
    await loadQr(t);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Load failed";
  }
}

async function loadQr(token: string) {
  if (qrObjectUrl.value) {
    URL.revokeObjectURL(qrObjectUrl.value);
    qrObjectUrl.value = null;
  }
  try {
    const blob = await fetchManagedEventQrBlob(token, eventId());
    qrObjectUrl.value = URL.createObjectURL(blob);
  } catch {
    /* optional */
  }
}

async function setStatus(status: ManagedEventStatus) {
  const t = admin.token;
  if (!t) return;
  statusBusy.value = true;
  error.value = null;
  try {
    event.value = await updateManagedEventStatus(t, eventId(), status);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Update failed";
  } finally {
    statusBusy.value = false;
  }
}

async function copyText(label: string, text: string) {
  copyHint.value = null;
  try {
    await navigator.clipboard.writeText(text);
    copyHint.value = `${label} copied`;
  } catch {
    copyHint.value = `Copy manually: ${text}`;
  }
}

onMounted(load);
onBeforeUnmount(() => {
  if (qrObjectUrl.value) URL.revokeObjectURL(qrObjectUrl.value);
});
</script>

<template>
  <div v-if="event" class="mx-auto max-w-3xl space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-wide text-slate-500">Event control</p>
        <h2 class="text-xl font-semibold text-slate-100">{{ event.name }}</h2>
        <p class="mt-1 text-sm text-slate-500">{{ event.description || "No description" }}</p>
      </div>
      <span
        class="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium uppercase text-violet-300"
      >
        {{ event.status.replace("_", " ") }}
      </span>
    </div>

    <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>
    <p v-if="copyHint" class="text-sm text-emerald-400">{{ copyHint }}</p>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 class="text-sm font-medium text-slate-200">Join</h3>
        <div>
          <p class="text-xs text-slate-500">Join code</p>
          <p class="font-mono text-2xl font-semibold tracking-wider text-violet-300">
            {{ event.join_code }}
          </p>
        </div>
        <div>
          <p class="text-xs text-slate-500">Player link</p>
          <p class="break-all font-mono text-xs text-slate-300">{{ event.join_url }}</p>
          <button
            type="button"
            class="mt-2 text-xs text-violet-300 hover:underline"
            @click="copyText('Link', event.join_url)"
          >
            Copy link
          </button>
        </div>
        <div>
          <p class="text-xs text-slate-500">Room ID (direct)</p>
          <p class="font-mono text-sm text-slate-300">{{ event.room_id }}</p>
          <button
            type="button"
            class="mt-1 text-xs text-violet-300 hover:underline"
            @click="copyText('Room URL', event.room_url)"
          >
            Copy room URL
          </button>
        </div>
      </div>

      <div class="flex flex-col items-center rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 class="mb-3 self-start text-sm font-medium text-slate-200">QR code</h3>
        <img
          v-if="qrObjectUrl"
          :src="qrObjectUrl"
          alt="Join QR code"
          class="h-44 w-44 rounded-lg bg-white p-2"
        />
        <p v-else class="text-sm text-slate-500">QR unavailable</p>
        <a
          v-if="event"
          :href="apiUrl(`/api/v1/admin/managed-events/${event.id}/qr.png`)"
          class="mt-3 text-xs text-slate-500"
          target="_blank"
          rel="noopener"
        >
          Open PNG (requires login)
        </a>
      </div>
    </div>

    <div class="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h3 class="text-sm font-medium text-slate-200">Game settings</h3>
      <ul class="mt-2 space-y-1 text-sm text-slate-400">
        <li>Race length: {{ event.text_line_count }} line(s)</li>
        <li>Relay mode: {{ event.relay_mode ? "Yes" : "No" }}</li>
        <li>Max players: {{ event.max_players }}</li>
      </ul>
      <p class="mt-3 text-xs text-slate-500">
        Host controls (start, pause, finish) run in the player app lobby and game screen for room
        <span class="font-mono text-slate-400">{{ event.room_id }}</span>.
      </p>
    </div>

    <div class="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h3 class="mb-3 text-sm font-medium text-slate-200">Event status</h3>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in ['lobby_open', 'in_progress', 'finished', 'archived', 'cancelled'] as const"
          :key="s"
          type="button"
          :disabled="statusBusy || event.status === s"
          class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs uppercase text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          @click="setStatus(s)"
        >
          {{ s.replace("_", " ") }}
        </button>
      </div>
    </div>
  </div>
  <p v-else-if="error" class="text-sm text-rose-400">{{ error }}</p>
  <p v-else class="text-sm text-slate-500">Loading…</p>
</template>
