<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { resolvePublicEventByCode, type PublicEventResolve } from "../lib/adminApi";
import { generateRoomId, isValidRoomId, joinUrlForRoom } from "../lib/roomId";
import { useGameStore } from "../stores/game";

type Mode = "host" | "join";

const router = useRouter();
const route = useRoute();
const game = useGameStore();

const mode = ref<Mode>("join");
const name = ref("");
const roomId = ref("");
const teamChoice = ref<0 | 1>(0);
const relayFirstPlayer = ref(false);
const busy = ref(false);
const formError = ref<string | null>(null);
const hostRoomReady = ref(false);
const copyHint = ref<string | null>(null);
const eventInfo = ref<PublicEventResolve | null>(null);
const eventLoading = ref(false);
const eventCode = ref("");

const joinLink = computed(() => joinUrlForRoom(roomId.value));

const canSubmit = computed(() => {
  if (!name.value.trim()) return false;
  if (!isValidRoomId(roomId.value)) return false;
  if (mode.value === "host" && !hostRoomReady.value) return false;
  return true;
});

function applyQueryRoom() {
  const q = route.query.room;
  if (typeof q === "string" && q.trim()) {
    roomId.value = q.trim();
    mode.value = "join";
    hostRoomReady.value = false;
  }
}

async function applyQueryEvent() {
  const q = route.query.event;
  if (typeof q !== "string" || !q.trim()) return;
  eventCode.value = q.trim().toUpperCase();
  eventLoading.value = true;
  formError.value = null;
  try {
    const resolved = await resolvePublicEventByCode(eventCode.value);
    eventInfo.value = resolved;
    roomId.value = resolved.room_id;
    mode.value = "join";
    hostRoomReady.value = false;
    if (resolved.relay_mode) {
      relayFirstPlayer.value = true;
    }
  } catch (e) {
    eventInfo.value = null;
    formError.value =
      e instanceof Error ? e.message : "Could not find event for that join code.";
  } finally {
    eventLoading.value = false;
  }
}

function switchMode(next: Mode) {
  mode.value = next;
  formError.value = null;
  copyHint.value = null;
  hostRoomReady.value = false;
  if (next === "host") {
    roomId.value = "";
  }
}

function onCreateRoom() {
  formError.value = null;
  copyHint.value = null;
  roomId.value = generateRoomId();
  hostRoomReady.value = true;
}

async function copyText(label: string, text: string) {
  if (!text) return;
  copyHint.value = null;
  try {
    await navigator.clipboard.writeText(text);
    copyHint.value = `${label} copied`;
  } catch {
    copyHint.value = `Could not copy — select and copy manually: ${text}`;
  }
}

async function onJoin() {
  formError.value = null;
  copyHint.value = null;
  if (!name.value.trim()) {
    formError.value = "Enter your display name.";
    return;
  }
  if (!isValidRoomId(roomId.value)) {
    formError.value = "Room ID: letters, numbers, underscore, hyphen only (1–64 chars).";
    return;
  }
  if (mode.value === "host" && !hostRoomReady.value) {
    formError.value = "Create a room first, then enter the lobby.";
    return;
  }

  busy.value = true;
  try {
    await game.connectAndJoin(roomId.value, name.value, {
      teamId: teamChoice.value,
      relay: mode.value === "host" ? relayFirstPlayer.value : undefined,
      host: mode.value === "host",
    });
    await router.push({ name: "lobby" });
  } catch (e) {
    formError.value = e instanceof Error ? e.message : "Could not join room";
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  applyQueryRoom();
  if (route.query.event) {
    await applyQueryEvent();
  }
});
</script>

<template>
  <div class="join-arena relative flex min-h-full flex-col items-center justify-center overflow-hidden px-4 py-10 sm:py-14">
    <!-- Background: track / night-race vibe -->
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(56,189,248,0.18),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(168,85,247,0.08),transparent_45%),radial-gradient(ellipse_60%_40%_at_0%_80%,rgba(251,191,36,0.06),transparent_40%)]"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,255,255,0.06)_2px,rgba(255,255,255,0.06)_4px)]"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl sm:left-0"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -right-24 bottom-1/4 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl sm:right-0"
      aria-hidden="true"
    />

    <div class="relative z-10 w-full max-w-lg space-y-8">
      <!-- Title stack -->
      <header class="text-center">
        <div class="relative inline-block">
          <h1
            class="bg-gradient-to-b from-white via-sky-100 to-sky-600/90 bg-clip-text text-4xl font-black tracking-tight text-transparent drop-shadow-[0_2px_24px_rgba(56,189,248,0.35)] sm:text-5xl"
          >
            Typing Race
          </h1>
          <span
            class="pointer-events-none absolute -bottom-1 left-1/2 h-1 w-[min(100%,12rem)] -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent"
            aria-hidden="true"
          />
        </div>
        <p
          class="mx-auto mt-4 max-w-md border border-slate-700/60 bg-slate-950/50 px-4 py-3 text-sm leading-relaxed text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          Host a room and share the ID, enter a join code from your event, or use a room link.
        </p>
        <div
          v-if="eventLoading"
          class="mx-auto mt-3 max-w-md text-sm text-slate-400"
        >
          Loading event…
        </div>
        <div
          v-else-if="eventInfo"
          class="mx-auto mt-3 max-w-md rounded-lg border border-violet-500/30 bg-violet-950/30 px-4 py-3 text-left text-sm"
        >
          <p class="font-medium text-violet-200">{{ eventInfo.name }}</p>
          <p v-if="eventInfo.description" class="mt-1 text-slate-400">{{ eventInfo.description }}</p>
          <p class="mt-2 font-mono text-xs text-slate-500">
            Code {{ eventInfo.join_code }} · Room {{ eventInfo.room_id }}
          </p>
        </div>
      </header>

      <!-- Mode selector: arcade tabs -->
      <div
        class="flex rounded-xl border-2 border-slate-700/80 bg-slate-950/70 p-1 shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_16px_48px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md"
        role="tablist"
        aria-label="Host or join"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'host'"
          class="relative flex-1 overflow-hidden rounded-lg py-3 text-sm font-bold uppercase tracking-wide transition duration-200"
          :class="
            mode === 'host'
              ? 'bg-gradient-to-b from-sky-500 to-sky-700 text-white shadow-[0_0_28px_rgba(56,189,248,0.45),inset_0_1px_0_rgba(255,255,255,0.25)]'
              : 'text-slate-500 hover:bg-slate-900/80 hover:text-slate-200'
          "
          @click="switchMode('host')"
        >
          Host a room
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'join'"
          class="relative flex-1 overflow-hidden rounded-lg py-3 text-sm font-bold uppercase tracking-wide transition duration-200"
          :class="
            mode === 'join'
              ? 'bg-gradient-to-b from-sky-500 to-sky-700 text-white shadow-[0_0_28px_rgba(56,189,248,0.45),inset_0_1px_0_rgba(255,255,255,0.25)]'
              : 'text-slate-500 hover:bg-slate-900/80 hover:text-slate-200'
          "
          @click="switchMode('join')"
        >
          Join a room
        </button>
      </div>

      <!-- Main HUD panel -->
      <form
        class="relative space-y-6 overflow-hidden rounded-2xl border-2 border-slate-600/90 bg-gradient-to-b from-slate-900/95 to-slate-950/98 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_64px_-16px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:p-8"
        @submit.prevent="onJoin"
      >
        <div
          class="pointer-events-none absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-cyan-400/50"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-cyan-400/50"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-violet-500/40"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-violet-500/40"
          aria-hidden="true"
        />

        <div v-if="mode === 'host'" class="space-y-4">
          <p class="text-xs leading-relaxed text-slate-400">
            Create a new room, share the ID or link with players, then enter the lobby as host.
          </p>
          <button
            type="button"
            class="group w-full rounded-xl border border-cyan-500/40 bg-gradient-to-b from-cyan-950/80 to-slate-950/90 py-3 text-sm font-bold text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)] transition hover:border-cyan-400/60 hover:from-cyan-900/70 hover:shadow-[0_0_32px_rgba(34,211,238,0.2)]"
            @click="onCreateRoom"
          >
            <span class="drop-shadow-sm">{{ hostRoomReady ? "Create another room ID" : "Create new room" }}</span>
          </button>

          <div
            v-if="hostRoomReady && roomId"
            class="rounded-xl border border-emerald-500/35 bg-gradient-to-br from-emerald-950/50 to-slate-950/80 p-4 shadow-[inset_0_0_32px_rgba(16,185,129,0.06),0_0_24px_rgba(16,185,129,0.08)]"
          >
            <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/90">
              Share with players
            </p>
            <p class="mt-2 break-all font-mono text-xl font-bold tracking-wide text-emerald-50 sm:text-2xl">
              {{ roomId }}
            </p>
            <p class="mt-2 text-xs text-slate-500">
              Others choose <span class="font-semibold text-slate-400">Join a room</span> and paste this ID.
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
                @click="copyText('Room ID', roomId)"
              >
                Copy room ID
              </button>
              <button
                v-if="joinLink"
                type="button"
                class="rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
                @click="copyText('Invite link', joinLink)"
              >
                Copy invite link
              </button>
            </div>
          </div>
        </div>

        <div v-else>
          <label
            class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500"
            for="room"
          >
            <span class="h-px flex-1 bg-gradient-to-r from-transparent to-slate-700" aria-hidden="true" />
            Room ID from host
            <span class="h-px flex-1 bg-gradient-to-l from-transparent to-slate-700" aria-hidden="true" />
          </label>
          <input
            id="room"
            v-model="roomId"
            type="text"
            autocomplete="off"
            maxlength="64"
            placeholder="e.g. race-k7m2xq"
            class="w-full rounded-xl border-2 border-slate-700 bg-slate-950/90 px-4 py-3 font-mono text-sm text-slate-100 shadow-inner placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          />
          <p class="mt-2 text-xs text-slate-500">
            Ask the host for the room ID or open their invite link.
          </p>
        </div>

        <div>
          <label
            class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500"
            for="name"
          >
            <span class="h-px flex-1 bg-gradient-to-r from-transparent to-slate-700" aria-hidden="true" />
            Display name
            <span class="h-px flex-1 bg-gradient-to-l from-transparent to-slate-700" aria-hidden="true" />
          </label>
          <input
            id="name"
            v-model="name"
            type="text"
            autocomplete="username"
            maxlength="48"
            placeholder="Your name"
            class="w-full rounded-xl border-2 border-slate-700 bg-slate-950/90 px-4 py-3 text-slate-100 shadow-inner placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          />
        </div>

        <fieldset class="rounded-xl border border-slate-700/80 bg-slate-950/40 p-4">
          <legend class="px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Team
          </legend>
          <div class="mt-1 grid grid-cols-2 gap-3">
            <label
              class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 py-5 transition duration-200 focus-within:ring-2 focus-within:ring-sky-400/50"
              :class="
                teamChoice === 0
                  ? 'border-cyan-400/70 bg-cyan-500/10 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.15)]'
                  : 'border-slate-700/80 bg-slate-900/30 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              "
            >
              <input v-model="teamChoice" type="radio" class="sr-only" :value="0" />
              <span class="text-lg font-black tracking-tight">Team A</span>
            </label>
            <label
              class="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 py-5 transition duration-200 focus-within:ring-2 focus-within:ring-sky-400/50"
              :class="
                teamChoice === 1
                  ? 'border-fuchsia-500/70 bg-fuchsia-500/10 text-fuchsia-50 shadow-[0_0_24px_rgba(217,70,239,0.15)]'
                  : 'border-slate-700/80 bg-slate-900/30 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              "
            >
              <input v-model="teamChoice" type="radio" class="sr-only" :value="1" />
              <span class="text-lg font-black tracking-tight">Team B</span>
            </label>
          </div>
          <p class="mt-3 text-center text-xs text-slate-500">
            If a team is fuller, you may still be placed for balance.
          </p>
        </fieldset>

        <label
          v-if="mode === 'host'"
          class="flex cursor-pointer items-start gap-4 rounded-xl border border-amber-500/25 bg-amber-950/20 p-4 transition hover:border-amber-500/40"
        >
          <input
            v-model="relayFirstPlayer"
            type="checkbox"
            class="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-600/60 bg-slate-950 text-amber-500 focus:ring-amber-500/40"
          />
          <span class="text-sm leading-snug text-slate-300">
            <span class="font-bold text-amber-100">Relay mode</span>
            — one typist per team at a time.
            <span class="mt-1 block text-xs text-slate-500">
              As host (first in the room), this applies to everyone in the room.
            </span>
          </span>
        </label>

        <p v-if="copyHint" class="text-center text-xs font-semibold text-emerald-400">{{ copyHint }}</p>
        <p v-if="formError" class="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
          {{ formError }}
        </p>

        <button
          type="submit"
          :disabled="busy || !canSubmit"
          class="relative w-full overflow-hidden rounded-xl bg-gradient-to-b from-sky-500 via-sky-600 to-sky-800 py-4 text-sm font-black uppercase tracking-[0.15em] text-white shadow-[0_0_40px_rgba(56,189,248,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] transition hover:from-sky-400 hover:via-sky-500 hover:shadow-[0_0_48px_rgba(56,189,248,0.45)] focus:outline-none focus:ring-2 focus:ring-amber-400/80 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
        >
          <span class="relative z-10 drop-shadow-md">
            <template v-if="busy">Connecting…</template>
            <template v-else-if="mode === 'host'">Enter lobby as host</template>
            <template v-else>Join room</template>
          </span>
        </button>
      </form>

      <p class="text-center">
        <RouterLink
          to="/admin/login"
          class="group inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 transition hover:border-violet-500/40 hover:text-violet-300"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-slate-600 transition group-hover:bg-violet-400" aria-hidden="true" />
          Company admin dashboard
        </RouterLink>
      </p>
    </div>
  </div>
</template>
