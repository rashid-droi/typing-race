<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchEvents, type AdminEventRow } from "../../lib/adminApi";
import { useAdminAuthStore } from "../../stores/adminAuth";

const admin = useAdminAuthStore();
const rows = ref<AdminEventRow[]>([]);
const error = ref<string | null>(null);

async function load() {
  const t = admin.token;
  if (!t) return;
  error.value = null;
  try {
    rows.value = await fetchEvents(t, 200);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Load failed";
  }
}

onMounted(load);

function metaPreview(m: Record<string, unknown> | undefined): string {
  const obj = m && typeof m === "object" ? m : {};
  try {
    const s = JSON.stringify(obj);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "";
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-slate-100">Audit log</h2>
        <p class="text-sm text-slate-500">Logins, session ingest, and system events from the admin API.</p>
      </div>
      <button
        type="button"
        class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        @click="load"
      >
        Refresh
      </button>
    </div>
    <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>

    <div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-800 bg-slate-950/80 text-xs uppercase text-slate-500">
          <tr>
            <th class="px-4 py-3">Time</th>
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Actor</th>
            <th class="px-4 py-3">Meta</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr v-for="ev in rows" :key="ev.id" class="text-slate-300">
            <td class="px-4 py-2 align-top font-mono text-xs text-slate-500">
              {{ new Date(ev.ts * 1000).toLocaleString() }}
            </td>
            <td class="px-4 py-2 align-top font-mono text-xs text-violet-300">{{ ev.type }}</td>
            <td class="px-4 py-2 align-top">{{ ev.actor }}</td>
            <td class="px-4 py-2 align-top font-mono text-xs text-slate-500">{{ metaPreview(ev.meta) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="p-6 text-sm text-slate-500">No events recorded yet.</p>
    </div>
  </div>
</template>
