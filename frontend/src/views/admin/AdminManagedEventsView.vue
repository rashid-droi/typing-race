<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { fetchManagedEvents, type ManagedEventRow } from "../../lib/adminApi";
import { useAdminAuthStore } from "../../stores/adminAuth";

const admin = useAdminAuthStore();
const rows = ref<ManagedEventRow[]>([]);
const error = ref<string | null>(null);

async function load() {
  const t = admin.token;
  if (!t) return;
  error.value = null;
  try {
    rows.value = await fetchManagedEvents(t, 100);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Load failed";
  }
}

onMounted(load);

function statusClass(status: string): string {
  if (status === "lobby_open" || status === "in_progress") return "text-emerald-400";
  if (status === "cancelled" || status === "archived") return "text-slate-500";
  return "text-violet-300";
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-slate-100">Typing events</h2>
        <p class="text-sm text-slate-500">
          Scheduled races with join codes, room IDs, and player links.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          @click="load"
        >
          Refresh
        </button>
        <RouterLink
          :to="{ name: 'admin-event-new' }"
          class="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
        >
          Create event
        </RouterLink>
      </div>
    </div>
    <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>

    <div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-800 bg-slate-950/80 text-xs uppercase text-slate-500">
          <tr>
            <th class="px-4 py-3">Event</th>
            <th class="hidden px-4 py-3 sm:table-cell">Join code</th>
            <th class="hidden px-4 py-3 md:table-cell">Room</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3" />
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr v-for="ev in rows" :key="ev.id" class="text-slate-300">
            <td class="px-4 py-3 align-top">
              <p class="font-medium text-slate-100">{{ ev.name }}</p>
              <p class="mt-0.5 font-mono text-xs text-slate-500 sm:hidden">{{ ev.join_code }}</p>
            </td>
            <td class="hidden px-4 py-3 align-top font-mono text-xs text-violet-300 sm:table-cell">
              {{ ev.join_code }}
            </td>
            <td class="hidden px-4 py-3 align-top font-mono text-xs text-slate-500 md:table-cell">
              {{ ev.room_id }}
            </td>
            <td class="px-4 py-3 align-top">
              <span class="text-xs font-medium uppercase" :class="statusClass(ev.status)">
                {{ ev.status.replace("_", " ") }}
              </span>
            </td>
            <td class="px-4 py-3 align-top text-right">
              <RouterLink
                :to="{ name: 'admin-event-control', params: { id: ev.id } }"
                class="text-xs text-violet-300 hover:text-violet-200"
              >
                Control →
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="p-8 text-center text-sm text-slate-500">
        No events yet.
        <RouterLink :to="{ name: 'admin-event-new' }" class="text-violet-300 hover:underline">
          Create your first event
        </RouterLink>
      </p>
    </div>
  </div>
</template>
