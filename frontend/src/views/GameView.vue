<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import RacingTrackScene from "../components/RacingTrackScene.vue";
import { RACE_CAPTURE_INPUT_ID, useRaceTypingCapture } from "../composables/useRaceTypingCapture";
import { useGameStore } from "../stores/game";

const router = useRouter();
const game = useGameStore();

const inputRef = ref<HTMLTextAreaElement | null>(null);
const paragraphDisplayRef = ref<HTMLElement | null>(null);
/** Min-height of progress mirror so it matches the “Type this” paragraph box. */
const progressMirrorMinPx = ref(0);

let paragraphResizeObserver: ResizeObserver | null = null;

function measureParagraphBox(): void {
  void nextTick(() => {
    const el = paragraphDisplayRef.value;
    progressMirrorMinPx.value = el ? Math.ceil(el.getBoundingClientRect().height) : 0;
  });
}
const finishedNav = ref(false);
const gameActive = computed(() => !finishedNav.value && !game.raceFinishedByHost);

/** Brief 3D track celebration before navigating to results. */
const trackCelebration = ref(false);
/** Incremented on each wrong key so `RacingTrackScene` can flash the warning sign. */
const wrongKeyTrackSignal = ref(0);

/** Index of expected character where a wrong key was just pressed (brief red highlight). */
const wrongFlashIndex = ref<number | null>(null);
/** Horizontal shake on typo (CSS animation). */
const wrongShake = ref(false);
let wrongFlashClearTimer: ReturnType<typeof setTimeout> | null = null;

function clearWrongFlashTimer(): void {
  if (wrongFlashClearTimer != null) {
    clearTimeout(wrongFlashClearTimer);
    wrongFlashClearTimer = null;
  }
}

function playTypingErrorBeep(): void {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 185;
    gain.gain.value = 0.035;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
    osc.onended = () => {
      void ctx.close().catch(() => undefined);
    };
  } catch {
    /* autoplay policy / no audio */
  }
}

function triggerWrongFeedback(atIndex: number): void {
  wrongFlashIndex.value = atIndex;
  wrongShake.value = true;
  wrongKeyTrackSignal.value += 1;
  window.setTimeout(() => {
    wrongShake.value = false;
  }, 400);
  clearWrongFlashTimer();
  wrongFlashClearTimer = window.setTimeout(() => {
    wrongFlashIndex.value = null;
    wrongFlashClearTimer = null;
  }, 450);
  playTypingErrorBeep();
}

const chars = computed(() => [...game.paragraph]);

const typedLen = computed(() => game.me?.typed_chars ?? 0);

/** Mirror server progress so the input matches the “Type this” paragraph. */
const typedText = computed(() => game.paragraph.slice(0, typedLen.value));
const remainingText = computed(() => game.paragraph.slice(typedLen.value));

const connected = computed(
  () => game.isSocketOpen || game.connectionState === "open"
);

const isRelayTurn = computed(() => {
  if (!game.relayMode) return true;
  if (game.me?.relay_active) return true;
  const tid = String(game.me?.team_id ?? game.teamId);
  const active = game.relayState?.active_player_by_team?.[tid];
  if (active === game.playerId) return true;
  return false;
});

const typingAllowed = computed(() => {
  if (!connected.value || !game.playerId) return false;
  if (game.gamePaused || game.raceFinishedByHost) return false;
  return isRelayTurn.value;
});

const inputPlaceholder = computed(() => {
  if (typingStatus.value) return typingStatus.value;
  if (!remainingText.value.length) return "Paragraph complete";
  if (!typedText.value.length) return "Start typing — keys work anywhere on this page";
  return `Next: ${remainingText.value.slice(0, 40)}${remainingText.value.length > 40 ? "…" : ""}`;
});

/** Explains why typing is blocked — only shown when typingAllowed is false. */
const typingStatus = computed(() => {
  if (!game.playerId) return null;

  if (connected.value) {
    if (game.raceFinishedByHost) {
      return "Race ended by host — heading to results…";
    }
    if (game.gamePaused) {
      return "Game paused by host.";
    }
    if (game.relayMode && !isRelayTurn.value) {
      return "Relay mode: it is not your turn yet. Wait for your teammate or for them to pass.";
    }
    return null;
  }

  if (game.connectionState === "connecting") {
    return "Connecting to the room…";
  }

  if (game.lastError) {
    return `Disconnected (${game.lastError}). Return home and join the room again.`;
  }

  return "Disconnected from the game server. Ensure the API is running (cd backend && npm run dev), then rejoin from the home page.";
});

const roomCodeCopyHint = ref<string | null>(null);
let roomCopyClearTimer: ReturnType<typeof setTimeout> | null = null;

function clearRoomCopyTimer(): void {
  if (roomCopyClearTimer != null) {
    clearTimeout(roomCopyClearTimer);
    roomCopyClearTimer = null;
  }
}

async function copyRoomCode(): Promise<void> {
  const id = game.roomId.trim();
  if (!id) return;
  roomCodeCopyHint.value = null;
  try {
    await navigator.clipboard.writeText(id);
    roomCodeCopyHint.value = "Copied";
  } catch {
    roomCodeCopyHint.value = "Copy failed — select the code";
  }
  clearRoomCopyTimer();
  roomCopyClearTimer = window.setTimeout(() => {
    roomCodeCopyHint.value = null;
    roomCopyClearTimer = null;
  }, 2200);
}

function spanClass(i: number): string {
  if (wrongFlashIndex.value === i) {
    return "rounded-sm bg-rose-500/35 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.45)] transition-colors duration-150";
  }
  if (i < typedLen.value) {
    return "text-emerald-300/95";
  }
  if (i === typedLen.value) {
    return "border-b-2 border-sky-400 bg-sky-950/50 text-slate-100";
  }
  return "text-slate-500";
}

function processRaceKeydown(e: KeyboardEvent): void {
  if (e.isComposing) return;
  if (e.key === "Tab") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!typingAllowed.value) {
    e.preventDefault();
    return;
  }
  if (e.key === "Backspace") {
    e.preventDefault();
    game.sendKeyBackspace();
    return;
  }
  if (e.key.length === 1) {
    e.preventDefault();
    const p = game.paragraph;
    const idx = typedLen.value;
    if (idx < p.length && e.key !== p[idx]) {
      triggerWrongFeedback(idx);
    }
    game.sendKeyChar(e.key);
    return;
  }
}

const { scheduleRefocus, onCaptureBlur, onPointerDownCapture } = useRaceTypingCapture({
  inputRef,
  active: gameActive,
  onRaceKeydown: processRaceKeydown,
});

watch(connected, (open) => {
  if (open) scheduleRefocus();
});

watch(typingAllowed, (allowed, wasAllowed) => {
  if (allowed && !wasAllowed) scheduleRefocus();
});

watch(
  () => game.raceStarted,
  (started, wasStarted) => {
    if (started && wasStarted === false) scheduleRefocus();
  }
);

watch(typedLen, () => {
  void nextTick(() => {
    const el = inputRef.value;
    if (!el || document.activeElement !== el) return;
    const end = typedText.value.length;
    el.setSelectionRange(end, end);
  });
});

watch([chars, () => game.paragraph], () => measureParagraphBox(), { flush: "post" });

onMounted(() => {
  measureParagraphBox();
  const el = paragraphDisplayRef.value;
  if (el && typeof ResizeObserver !== "undefined") {
    paragraphResizeObserver = new ResizeObserver(() => measureParagraphBox());
    paragraphResizeObserver.observe(el);
  }
  window.addEventListener("resize", measureParagraphBox);
});

onBeforeUnmount(() => {
  paragraphResizeObserver?.disconnect();
  paragraphResizeObserver = null;
  window.removeEventListener("resize", measureParagraphBox);
  clearWrongFlashTimer();
  clearRoomCopyTimer();
});

watch(
  () => game.players.find((p) => p.id === game.playerId)?.progress,
  (p) => {
    if (finishedNav.value || game.raceFinishedByHost) return;
    if (p != null && p >= 1) {
      finishedNav.value = true;
      trackCelebration.value = true;
      game.captureFinalStandings();
      window.setTimeout(() => {
        void router.replace({ name: "results" });
      }, 2600);
    }
  }
);

const showFinishRaceModal = ref(false);

watch(
  () => game.raceFinishedByHost,
  (v) => {
    if (v && game.finalStandings.length > 0) {
      void router.replace({ name: "results" });
    }
  }
);

function confirmFinishRaceFromModal(): void {
  showFinishRaceModal.value = false;
  game.sendHostFinishRace();
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <section class="shrink-0 border-b border-slate-800 bg-slate-900/40">
      <div class="mx-auto max-w-6xl px-4 pt-4">
        <p class="text-center text-sm font-medium text-slate-300">Live race track</p>
        <p class="mt-0.5 text-center text-xs text-slate-500">
          <span class="text-amber-300/90">Gold ring &amp; beacon</span> = your car · others use random colors with a team tint · chase camera follows you
        </p>
        <div
          v-if="game.roomId"
          class="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row sm:flex-wrap sm:gap-3"
        >
          <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Room code</span>
          <code
            class="max-w-full select-all break-all rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-center font-mono text-sm font-semibold tracking-wide text-sky-200 sm:text-base"
            :title="game.roomId"
          >{{ game.roomId }}</code>
          <button
            type="button"
            class="shrink-0 rounded-lg border border-sky-600/50 bg-sky-950/60 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:border-sky-500 hover:bg-sky-900/70"
            @click="copyRoomCode"
          >
            Copy room code
          </button>
          <span v-if="roomCodeCopyHint" class="text-xs text-emerald-400/90">{{ roomCodeCopyHint }}</span>
        </div>
      </div>
      <div class="mx-auto w-full max-w-6xl px-4 pb-4 pt-3">
        <div
          class="h-[clamp(220px,38vh,480px)] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner"
          @pointerdown="onPointerDownCapture"
        >
          <RacingTrackScene
            :players="game.players"
            :my-player-id="game.playerId"
            :celebrate="trackCelebration"
            :wrong-key-signal="wrongKeyTrackSignal"
            compact
          />
        </div>
      </div>
    </section>

    <div class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 lg:flex-row lg:gap-6">
      <div
        class="flex min-h-0 flex-1 flex-col gap-4 lg:pr-2"
        :class="{ 'animate-shake': wrongShake }"
      >
        <section
          class="cursor-text rounded-xl border border-slate-800 bg-slate-900/40 p-4 lg:p-6"
          role="presentation"
          @pointerdown="onPointerDownCapture"
        >
          <p class="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Type this</p>
          <p
            id="race-paragraph-display"
            ref="paragraphDisplayRef"
            class="select-none font-mono text-lg leading-relaxed tracking-wide md:text-xl"
            aria-hidden="true"
          >
            <span v-for="(ch, i) in chars" :key="i" :class="spanClass(i)">{{ ch }}</span>
          </p>
        </section>

        <section
          class="cursor-text rounded-xl border border-slate-800 bg-slate-900/40 p-4 lg:p-6"
          role="presentation"
          @pointerdown="onPointerDownCapture"
        >
          <label class="mb-3 block text-xs font-medium uppercase tracking-wide text-slate-500" :for="RACE_CAPTURE_INPUT_ID">
            Your progress (synced with Type this)
          </label>
          <textarea
            :id="RACE_CAPTURE_INPUT_ID"
            ref="inputRef"
            :value="typedText"
            readonly
            rows="1"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            inputmode="text"
            enterkeyhint="done"
            aria-label="Race typing input"
            aria-describedby="race-paragraph-hint"
            class="box-border m-0 w-full cursor-text resize-none overflow-hidden p-0 font-mono text-lg leading-relaxed tracking-wide focus:outline-none focus:ring-2 focus:ring-sky-500/40 md:text-xl"
            :class="
              typingAllowed
                ? 'rounded-lg border border-slate-700/90 bg-slate-950/90 text-emerald-300/95'
                : 'rounded-lg border border-amber-800/60 bg-amber-950/20 text-amber-100/80'
            "
            :style="progressMirrorMinPx > 0 ? { minHeight: `${progressMirrorMinPx}px` } : undefined"
            :aria-disabled="!typingAllowed"
            :placeholder="inputPlaceholder"
            @blur="onCaptureBlur"
            @pointerdown="onPointerDownCapture"
          />
          <p id="race-paragraph-hint" class="mt-1.5 text-xs text-slate-500">
            {{ typedLen }} / {{ game.paragraph.length }} characters · wrong keys move the cursor back one and add an error
          </p>
          <p
            v-if="typingStatus"
            class="mt-2 text-xs text-amber-300/90"
            role="status"
            aria-live="polite"
          >
            {{ typingStatus }}
          </p>
          <div class="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <span>WPM <strong class="text-slate-200">{{ (game.me?.wpm ?? 0).toFixed(1) }}</strong></span>
            <span>Accuracy <strong class="text-slate-200">{{ ((game.me?.accuracy ?? 1) * 100).toFixed(1) }}%</strong></span>
            <span>Errors <strong class="text-slate-200">{{ game.me?.errors ?? 0 }}</strong></span>
            <span>Progress <strong class="text-slate-200">{{ ((game.me?.progress ?? 0) * 100).toFixed(1) }}%</strong></span>
          </div>
        </section>
      </div>

      <aside class="w-full shrink-0 space-y-4 lg:w-80" aria-label="Race standings">
        <div
          v-if="game.relayMode"
          class="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100/90"
        >
          <p class="font-medium text-amber-200">Relay mode</p>
          <p v-if="game.me?.relay_active" class="mt-1 text-xs text-amber-100/80">Your turn — type the paragraph.</p>
          <p v-else class="mt-1 text-xs text-amber-100/70">Waiting for teammate on your team…</p>
          <button
            v-if="game.me?.relay_active"
            type="button"
            class="mt-3 w-full rounded-lg border border-amber-700/60 bg-amber-900/40 px-2 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-900/60"
            @click="game.sendRelayPass()"
          >
            Pass turn (relay)
          </button>
        </div>

        <div class="rounded-xl border border-slate-800 bg-slate-900/40">
          <div class="border-b border-slate-800 px-4 py-3">
            <h2 class="text-sm font-semibold text-slate-200">Teams</h2>
            <p class="text-xs text-slate-500">Avg progress · teamwork · consistency · comms</p>
          </div>
          <ul class="divide-y divide-slate-800">
            <li
              v-for="t in game.teamRankings"
              :key="t.id"
              class="px-4 py-3"
              :class="t.id === game.teamId ? 'bg-sky-950/20' : ''"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-slate-200">{{ t.rank }}. {{ t.name }}</span>
                <span class="text-xs text-emerald-300/90">{{ (t.score * 100).toFixed(1) }}%</span>
              </div>
              <div class="mt-1 grid grid-cols-3 gap-1 text-[10px] text-slate-500">
                <span>TW {{ t.teamwork_score.toFixed(0) }}</span>
                <span>CS {{ t.consistency_score.toFixed(0) }}</span>
                <span>CE {{ t.communication_efficiency_score.toFixed(0) }}</span>
              </div>
            </li>
          </ul>
        </div>

        <div class="rounded-xl border border-slate-800 bg-slate-900/40">
          <div class="border-b border-slate-800 px-4 py-3">
            <h2 class="text-sm font-semibold text-slate-200">Players</h2>
            <p class="text-xs text-slate-500">Individual rank · <span class="text-amber-300/85">gold beacon on track = you</span></p>
          </div>
          <ul class="max-h-[40vh] divide-y divide-slate-800 overflow-auto lg:max-h-[calc(100vh-22rem)]">
            <li
              v-for="p in game.players"
              :key="p.id"
              class="flex flex-col gap-1 px-4 py-3"
              :class="[
                p.id === game.playerId ? 'bg-sky-950/30' : '',
                p.relay_active ? 'ring-1 ring-amber-500/40' : '',
              ]"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate font-medium text-slate-200">{{ p.rank }}. {{ p.name }}</span>
                <span class="shrink-0 text-xs text-sky-300/90">{{ (p.progress * 100).toFixed(0) }}%</span>
              </div>
              <div class="flex justify-between text-xs text-slate-500">
                <span>T{{ p.team_id + 1 }} · #{{ p.team_rank }}</span>
                <span>{{ p.wpm.toFixed(0) }} wpm</span>
                <span>{{ (p.accuracy * 100).toFixed(0) }}%</span>
              </div>
            </li>
          </ul>
          <p v-if="!game.players.length" class="p-4 text-sm text-slate-500">No data yet…</p>
        </div>
      </aside>
    </div>

    <Teleport to="body">
      <div
        v-if="game.gamePaused && game.raceStarted"
        class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 px-6 backdrop-blur-sm"
        aria-live="polite"
      >
        <div
          class="max-w-md rounded-2xl border border-slate-600/80 bg-slate-900/95 px-8 py-8 text-center shadow-2xl ring-1 ring-sky-500/20"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/90">Paused</p>
          <h2 class="mt-2 text-xl font-bold tracking-tight text-slate-50 sm:text-2xl">Game Paused by Host</h2>
          <p class="mt-3 text-sm leading-relaxed text-slate-400">
            Typing is frozen for everyone. Your progress and rankings stay as they are until the host resumes.
          </p>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="showFinishRaceModal"
        class="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-race-title"
        @click.self="showFinishRaceModal = false"
      >
        <div
          class="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl"
          @click.stop
        >
          <h2 id="finish-race-title" class="text-lg font-bold text-slate-50">End race for everyone?</h2>
          <p class="mt-2 text-sm text-slate-400">
            All players will stop immediately, progress will freeze, and everyone will be taken to the results
            leaderboard.
          </p>
          <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              class="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
              @click="showFinishRaceModal = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-gradient-to-r from-rose-600 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:from-rose-500 hover:to-orange-500"
              @click="confirmFinishRaceFromModal"
            >
              End race now
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="game.me?.is_host && game.raceStarted && !game.raceFinishedByHost"
        class="fixed bottom-0 left-0 right-0 z-[100] border-t border-amber-500/35 bg-gradient-to-t from-slate-950 via-slate-950 to-slate-900/95 px-3 py-3 shadow-[0_-12px_48px_rgba(0,0,0,0.5)]"
      >
        <div class="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p class="text-center text-[11px] font-bold uppercase tracking-widest text-amber-200/90 sm:text-left">
            Host controls
          </p>
          <div class="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
            <button
              type="button"
              class="min-h-[44px] min-w-[120px] rounded-lg border border-amber-600/50 bg-amber-950/50 px-4 py-2 text-sm font-semibold text-amber-100 shadow transition hover:border-amber-400 hover:bg-amber-900/60 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="game.gamePaused || game.hostControlsBusy"
              @click="game.sendHostPause()"
            >
              Pause
            </button>
            <button
              type="button"
              class="min-h-[44px] min-w-[120px] rounded-lg border border-emerald-600/50 bg-emerald-950/40 px-4 py-2 text-sm font-semibold text-emerald-100 shadow transition hover:border-emerald-400 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!game.gamePaused || game.hostControlsBusy"
              @click="game.sendHostResume()"
            >
              Resume
            </button>
            <button
              type="button"
              class="min-h-[44px] min-w-[120px] rounded-lg border border-rose-500/60 bg-rose-950/50 px-4 py-2 text-sm font-semibold text-rose-100 shadow transition hover:border-rose-400 hover:bg-rose-900/55 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="game.hostControlsBusy"
              @click="showFinishRaceModal = true"
            >
              <span v-if="game.hostControlsBusy" class="inline-flex items-center gap-2">
                <span
                  class="inline-block size-3.5 animate-spin rounded-full border-2 border-rose-200/30 border-t-rose-100"
                  aria-hidden="true"
                />
                Ending…
              </span>
              <span v-else>Finish game</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
