<script setup lang="ts">
import { computed } from "vue";
import { RouterView } from "vue-router";
import { useGameStore } from "./stores/game";

const game = useGameStore();

const countdownLabel = computed(() => {
  const v = game.restartCountdown;
  if (v === null) return "";
  if (v === -1) return "GO!";
  return String(v);
});

const showRestartOverlay = computed(
  () => game.restartCountdown !== null && game.connectionState === "open"
);
</script>

<template>
  <div class="min-h-full bg-slate-950 text-slate-100 antialiased">
    <RouterView />
    <Teleport to="body">
      <div
        v-if="showRestartOverlay"
        class="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 px-6"
        aria-live="assertive"
      >
        <div
          class="pointer-events-none flex min-h-[8rem] min-w-[12rem] flex-col items-center justify-center rounded-3xl border border-sky-500/40 bg-slate-900/95 px-10 py-8 shadow-2xl ring-2 ring-sky-500/25"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-sky-400/90">Rematch</p>
          <p
            class="mt-2 text-center font-mono text-5xl font-black tabular-nums tracking-tight text-sky-100 sm:text-6xl"
          >
            {{ countdownLabel }}
          </p>
          <p class="mt-3 max-w-xs text-center text-xs text-slate-400">New race starting — same room, same crew.</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>
