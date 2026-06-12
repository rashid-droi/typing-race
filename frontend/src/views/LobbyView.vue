<script setup lang="ts">
import { computed, watch, ref } from "vue";
import { useRouter } from "vue-router";
import { joinUrlForRoom } from "../lib/roomId";
import { TEXT_LINE_COUNT_OPTIONS, useGameStore } from "../stores/game";

const router = useRouter();
const game = useGameStore();

const copyHint = ref<string | null>(null);
const startError = ref<string | null>(null);

const sortedPlayers = computed(() =>
  [...game.players].sort((a, b) => a.rank - b.rank)
);

const inviteLink = computed(() => joinUrlForRoom(game.roomId));

const raceLengthLabel = computed(() => {
  const n = game.roomSettings.textLineCount;
  return n === 1 ? "Race length: 1 line" : `Race length: ${n} lines`;
});

function lineCountOptionLabel(n: number): string {
  return n === 1 ? "1 line" : `${n} lines`;
}

function onTextLineCountChange(ev: Event) {
  const el = ev.target as HTMLSelectElement;
  const n = Number(el.value);
  if (!Number.isFinite(n)) return;
  game.sendRoomTextLineCount(n);
}

async function copyText(label: string, text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyHint.value = `${label} copied`;
  } catch {
    copyHint.value = "Copy failed — select the room ID above manually.";
  }
}

watch(
  () => game.raceStarted,
  (started) => {
    if (!started) return;
    void router.replace({ name: "game" });
  },
  { immediate: true }
);

function onStartGame() {
  startError.value = null;
  if (!game.startRace()) {
    startError.value = game.lastError ?? "Could not start the game.";
  }
}

watch(
  () => game.lastError,
  (err) => {
    if (err === "start_rejected") {
      startError.value = "Could not start — make sure you are the host and the backend was restarted.";
    }
  }
);
</script>

<template>
  <div class="mx-auto flex min-h-full max-w-3xl flex-col px-4 py-10">
    <header class="mb-8 text-center">
      <p class="text-xs font-medium uppercase tracking-widest text-slate-500">Lobby</p>
      <h1 class="mt-1 text-2xl font-semibold text-slate-100">Room <span class="font-mono text-sky-400">{{ game.roomId }}</span></h1>
      <p class="mt-3 text-xs text-slate-500">Share this room ID so others can join</p>
      <div class="mt-2 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          @click="copyText('Room ID', game.roomId)"
        >
          Copy room ID
        </button>
        <button
          v-if="inviteLink"
          type="button"
          class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          @click="copyText('Invite link', inviteLink)"
        >
          Copy invite link
        </button>
      </div>
      <p v-if="copyHint" class="mt-2 text-xs text-emerald-400/90">{{ copyHint }}</p>

      <div
        class="mx-auto mt-6 w-full max-w-md rounded-xl border border-violet-500/25 bg-gradient-to-b from-violet-950/40 to-slate-950/60 p-4 shadow-lg shadow-violet-950/20"
      >
        <p class="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300/90">
          Room setup
        </p>
        <label
          for="race-line-count"
          class="mt-3 block text-center text-xs font-medium text-slate-300"
        >
          {{ raceLengthLabel }}
        </label>
        <div class="relative mt-2">
          <select
            id="race-line-count"
            class="block w-full appearance-none rounded-lg border border-slate-600/80 bg-slate-950/90 py-2.5 pl-3 pr-10 text-sm font-medium text-slate-100 shadow-inner outline-none ring-violet-500/40 transition focus:border-violet-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
            :disabled="!game.isHost || game.raceStarted || game.roomSettingsSyncing"
            :value="game.roomSettings.textLineCount"
            aria-describedby="race-line-hint"
            @change="onTextLineCountChange"
          >
            <option
              v-for="n in TEXT_LINE_COUNT_OPTIONS"
              :key="n"
              :value="n"
            >
              {{ lineCountOptionLabel(n) }}
            </option>
          </select>
          <span
            class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400"
            aria-hidden="true"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
        <p id="race-line-hint" class="mt-2 text-center text-[11px] text-slate-500">
          <template v-if="game.isHost">
            Shorter races for warm-up; longer for endurance. Everyone sees this live.
          </template>
          <template v-else>
            Only the host can change race length. Your screen updates when they do.
          </template>
        </p>
        <p
          v-if="game.isHost && game.roomSettingsSyncing"
          class="mt-2 text-center text-xs text-amber-200/90"
        >
          Syncing…
        </p>
      </div>

      <p class="mt-6 text-sm text-slate-400">Get ready — host starts the race</p>
      <div class="mt-2 flex flex-wrap justify-center gap-3">
        <button
          v-if="game.isHost && !game.raceStarted"
          type="button"
          class="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          @click="onStartGame"
        >
          Start game
        </button>
        <p
          v-else-if="!game.raceStarted"
          class="text-sm text-slate-400"
        >
          Waiting for host to start…
        </p>
        <p
          v-else
          class="text-sm text-emerald-300/90"
        >
          Starting race…
        </p>
      </div>
      <p v-if="startError" class="mt-2 text-xs text-rose-400">{{ startError }}</p>
      <p
        v-if="game.gamePaused && !game.raceStarted"
        class="mt-4 space-y-3 rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-center text-sm text-amber-100/90"
        role="status"
      >
        <span class="block">The host has paused the room before the race starts.</span>
        <button
          v-if="game.isHost"
          type="button"
          class="rounded-lg border border-emerald-600/60 bg-emerald-950/50 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/60"
          @click="game.sendHostResume()"
        >
          Resume room
        </button>
      </p>
    </header>

    <section class="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 class="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">Players</h2>
      <ul v-if="sortedPlayers.length" class="divide-y divide-slate-800">
        <li
          v-for="p in sortedPlayers"
          :key="p.id"
          class="flex items-center justify-between py-3 first:pt-0"
        >
          <span class="font-medium text-slate-200">{{ p.name }}</span>
          <span
            v-if="p.id === game.playerId"
            class="rounded-full bg-sky-950 px-2 py-0.5 text-xs text-sky-300"
          >You</span>
          <span v-else class="text-xs text-slate-500">Waiting</span>
        </li>
      </ul>
      <p v-else class="text-sm text-slate-500">Waiting for leaderboard…</p>
    </section>

    <p class="mt-8 text-center text-xs text-slate-600">
      Friends join from the home page with <span class="font-mono text-slate-500">Join a room</span> and your room ID.
    </p>
  </div>
</template>
