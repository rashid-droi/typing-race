<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { postAdminEvent, postTrainingSession } from "../lib/adminApi";
import { useAdminAuthStore } from "../stores/adminAuth";
import { useGameStore } from "../stores/game";

const router = useRouter();
const route = useRoute();
const game = useGameStore();
const admin = useAdminAuthStore();

const ingestDone = ref(false);

const rows = computed(() =>
  [...game.finalStandings].sort((a, b) => a.rank - b.rank)
);

const teamRows = computed(() =>
  [...game.finalTeams].sort((a, b) => {
    const ra = a.rank ?? 999;
    const rb = b.rank ?? 999;
    if (ra !== rb) return ra - rb;
    return b.score - a.score;
  })
);

onMounted(async () => {
  if (ingestDone.value) return;
  await admin.hydrateFromStorage();
  const token = admin.token;
  if (!token || !game.finalStandings.length) return;
  const me = game.finalStandings.find((p) => p.id === game.playerId);
  if (!me) return;
  const n = 10;
  const target = me.wpm;
  const wpm_history = Array.from({ length: n }, (_, i) =>
    Math.round(((target * (i + 1)) / n) * 10) / 10
  );
  const duration_s = Math.min(180, Math.max(20, game.paragraph.length / 4.2));
  const replay = wpm_history.map((w, i) => ({
    t: Math.round(((duration_s * i) / Math.max(1, n - 1)) * 10) / 10,
    progress: Math.min(1, (i + 1) / n),
    wpm: w,
    label: i === n - 1 ? "finish" : "sample",
  }));
  try {
    await postTrainingSession(token, {
      room_id: game.roomId,
      user_label: me.name,
      team_id: me.team_id,
      final_wpm: me.wpm,
      accuracy: me.accuracy,
      progress: me.progress,
      duration_s,
      wpm_history,
      replay,
    });
    await postAdminEvent(token, "training.results_ingested", {
      room_id: game.roomId,
      wpm: me.wpm,
    });
    ingestDone.value = true;
  } catch {
    /* optional analytics — ignore failures */
  }
});

/** Same-room rematch: host triggers WS restart; everyone follows `race_started` to `/game`. */
function playAgainSameRoom(): void {
  game.sendGameRestart();
}

function leaveRoomAndJoin(): void {
  game.sendLeave();
  game.resetSession();
  void router.replace({ name: "join" });
}

watch(
  () => game.raceStarted,
  (started) => {
    if (!started) return;
    if (route.name === "results") {
      void router.replace({ name: "game" });
    }
  }
);
</script>

<template>
  <div class="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-12">
    <header class="mb-8 text-center">
      <p class="text-xs font-medium uppercase tracking-widest text-slate-500">Results</p>
      <h1 class="mt-1 text-3xl font-bold text-slate-100">Race finished</h1>
      <p class="mt-2 text-sm text-slate-400">Room <span class="font-mono text-sky-400">{{ game.roomId }}</span></p>
    </header>

    <section v-if="teamRows.length" class="mb-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
      <h2 class="border-b border-slate-800 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
        Team standings
      </h2>
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-800 bg-slate-950/60 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-2">#</th>
            <th class="px-4 py-2">Team</th>
            <th class="px-4 py-2 text-right">Avg prog</th>
            <th class="px-4 py-2 text-right">TW</th>
            <th class="px-4 py-2 text-right">CS</th>
            <th class="px-4 py-2 text-right">CE</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr
            v-for="t in teamRows"
            :key="t.id"
            :class="t.id === game.teamId ? 'bg-sky-950/20' : ''"
          >
            <td class="px-4 py-2.5 font-mono text-slate-400">{{ t.rank ?? "—" }}</td>
            <td class="px-4 py-2.5 font-medium text-slate-200">
              {{ t.name }}
              <span v-if="t.id === game.teamId" class="ml-2 text-xs text-sky-400">(yours)</span>
            </td>
            <td class="px-4 py-2.5 text-right tabular-nums text-slate-300">{{ (t.score * 100).toFixed(1) }}%</td>
            <td class="px-4 py-2.5 text-right tabular-nums text-slate-400">{{ t.teamwork_score.toFixed(0) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums text-slate-400">{{ t.consistency_score.toFixed(0) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums text-slate-400">{{ t.communication_efficiency_score.toFixed(0) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
        TW = teamwork, CS = consistency, CE = communication efficiency (relay-aware).
      </p>
    </section>

    <div class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
      <h2 class="border-b border-slate-800 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200">
        Individual standings
      </h2>
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-800 bg-slate-950/60 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-3">#</th>
            <th class="px-4 py-3">Player</th>
            <th class="px-4 py-3 text-right">Team</th>
            <th class="px-4 py-3 text-right">WPM</th>
            <th class="px-4 py-3 text-right">Acc</th>
            <th class="px-4 py-3 text-right">Prog</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr
            v-for="p in rows"
            :key="p.id"
            :class="p.id === game.playerId ? 'bg-sky-950/25' : ''"
          >
            <td class="px-4 py-3 font-mono text-slate-400">{{ p.rank }}</td>
            <td class="px-4 py-3 font-medium text-slate-200">
              {{ p.name }}
              <span v-if="p.id === game.playerId" class="ml-2 text-xs text-sky-400">(you)</span>
            </td>
            <td class="px-4 py-3 text-right text-slate-400">T{{ p.team_id + 1 }}</td>
            <td class="px-4 py-3 text-right tabular-nums text-slate-300">{{ p.wpm.toFixed(1) }}</td>
            <td class="px-4 py-3 text-right tabular-nums text-slate-300">{{ (p.accuracy * 100).toFixed(1) }}%</td>
            <td class="px-4 py-3 text-right tabular-nums text-slate-300">{{ (p.progress * 100).toFixed(0) }}%</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
      <button
        v-if="game.me?.is_host"
        type="button"
        class="min-h-[48px] flex-1 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:from-sky-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[220px] sm:flex-none"
        :disabled="game.rematchLoading || !game.isSocketOpen"
        @click="playAgainSameRoom"
      >
        <span v-if="game.rematchLoading" class="inline-flex items-center justify-center gap-2">
          <span
            class="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
          Restarting…
        </span>
        <span v-else>Play again — same room</span>
      </button>
      <p
        v-else
        class="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-center text-sm text-slate-400 sm:min-w-[220px]"
      >
        Waiting for host to start a rematch…
      </p>
      <button
        type="button"
        class="min-h-[48px] flex-1 rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 sm:min-w-[180px] sm:flex-none"
        @click="leaveRoomAndJoin"
      >
        Leave room
      </button>
    </div>
    <p v-if="game.lastError === 'restart_rejected'" class="mt-3 text-center text-xs text-rose-400">
      Could not restart — only the host can rematch, or a restart is already in progress.
    </p>
  </div>
</template>
