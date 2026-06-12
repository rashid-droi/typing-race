<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchTrainingSessions, type TrainingSessionRow } from "../../lib/adminApi";
import { useAdminAuthStore } from "../../stores/adminAuth";

const admin = useAdminAuthStore();
const rows = ref<TrainingSessionRow[]>([]);
const error = ref<string | null>(null);
const selected = ref<TrainingSessionRow | null>(null);

async function load() {
  const t = admin.token;
  if (!t) return;
  error.value = null;
  try {
    rows.value = await fetchTrainingSessions(t, 80);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Load failed";
  }
}

onMounted(load);

function replayJson(s: TrainingSessionRow): string {
  return JSON.stringify(s.replay ?? [], null, 2);
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-slate-100">Training session analytics</h2>
        <p class="text-sm text-slate-500">Replay timeline JSON per session (ingested from player results).</p>
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
            <th class="px-4 py-3">User</th>
            <th class="px-4 py-3">Room</th>
            <th class="px-4 py-3 text-right">WPM</th>
            <th class="px-4 py-3 text-right">Dur (s)</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr v-for="s in rows" :key="s.id" class="text-slate-300 hover:bg-slate-800/40">
            <td class="px-4 py-2 font-mono text-xs text-slate-500">
              {{ new Date(s.ts * 1000).toLocaleString() }}
            </td>
            <td class="px-4 py-2">{{ s.user_label ?? "—" }}</td>
            <td class="px-4 py-2 font-mono text-xs">{{ s.room_id ?? "—" }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ s.final_wpm.toFixed(1) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ s.duration_s.toFixed(0) }}</td>
            <td class="px-4 py-2 text-right">
              <button
                type="button"
                class="text-violet-400 hover:underline"
                @click="selected = s"
              >
                Replay
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="p-6 text-sm text-slate-500">No sessions yet. Finish a race while signed in as admin to ingest.</p>
    </div>

    <Teleport to="body">
      <div
        v-if="selected"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        @click.self="selected = null"
      >
        <div class="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          <div class="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h3 class="text-sm font-semibold text-slate-100">Session replay data</h3>
            <button type="button" class="text-slate-400 hover:text-white" @click="selected = null">✕</button>
          </div>
          <div class="max-h-[60vh] overflow-auto p-4">
            <pre class="whitespace-pre-wrap break-all font-mono text-xs text-emerald-200/90">{{ replayJson(selected) }}</pre>
          </div>
          <div class="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
            WPM samples: {{ (selected.wpm_history ?? []).map((x) => x.toFixed(1)).join(", ") || "—" }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
