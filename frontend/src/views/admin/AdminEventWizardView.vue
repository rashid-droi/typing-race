<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { createManagedEvent } from "../../lib/adminApi";
import { TEXT_LINE_COUNT_OPTIONS } from "../../stores/game";
import { useAdminAuthStore } from "../../stores/adminAuth";

const admin = useAdminAuthStore();
const router = useRouter();

const step = ref(1);
const busy = ref(false);
const error = ref<string | null>(null);

const name = ref("");
const description = ref("");
const startsAtLocal = ref("");
const endsAtLocal = ref("");
const timezone = ref(
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"
);
const maxPlayers = ref(500);
const textLineCount = ref(1);
const relayMode = ref(false);
const themePrimary = ref("#7c3aed");
const publicWall = ref(false);
const openLobbyOnCreate = ref(true);

function localToUnix(local: string): number | null {
  if (!local.trim()) return null;
  const ms = new Date(local).getTime();
  return Number.isFinite(ms) ? ms / 1000 : null;
}

async function onCreate() {
  const t = admin.token;
  if (!t || !name.value.trim()) return;
  busy.value = true;
  error.value = null;
  try {
    const ev = await createManagedEvent(t, {
      name: name.value.trim(),
      description: description.value.trim(),
      status: openLobbyOnCreate.value ? "lobby_open" : "scheduled",
      starts_at: localToUnix(startsAtLocal.value),
      ends_at: localToUnix(endsAtLocal.value),
      timezone: timezone.value.trim() || "UTC",
      max_players: maxPlayers.value,
      text_line_count: textLineCount.value,
      relay_mode: relayMode.value,
      theme_primary: themePrimary.value,
      public_wall: publicWall.value,
    });
    await router.replace({ name: "admin-event-control", params: { id: ev.id } });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Create failed";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <div>
      <h2 class="text-xl font-semibold text-slate-100">Create typing event</h2>
      <p class="text-sm text-slate-500">Step {{ step }} of 3 — join code and QR are generated automatically.</p>
    </div>

    <div class="flex gap-2">
      <button
        v-for="n in 3"
        :key="n"
        type="button"
        class="h-1.5 flex-1 rounded-full"
        :class="n <= step ? 'bg-violet-500' : 'bg-slate-800'"
        @click="step = n"
      />
    </div>

    <p v-if="error" class="rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
      {{ error }}
    </p>

    <form v-show="step === 1" class="space-y-4" @submit.prevent="step = 2">
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Event name</span>
        <input
          v-model="name"
          required
          maxlength="120"
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          placeholder="Q2 Typing Championship"
        />
      </label>
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Description</span>
        <textarea
          v-model="description"
          rows="3"
          maxlength="2000"
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          placeholder="Optional notes for hosts and players"
        />
      </label>
      <button
        type="submit"
        class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
      >
        Next: Schedule
      </button>
    </form>

    <form v-show="step === 2" class="space-y-4" @submit.prevent="step = 3">
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Start (optional)</span>
        <input
          v-model="startsAtLocal"
          type="datetime-local"
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
        />
      </label>
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">End (optional)</span>
        <input
          v-model="endsAtLocal"
          type="datetime-local"
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
        />
      </label>
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Timezone</span>
        <input
          v-model="timezone"
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
        />
      </label>
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Max players</span>
        <input
          v-model.number="maxPlayers"
          type="number"
          min="2"
          max="10000"
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
        />
      </label>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          @click="step = 1"
        >
          Back
        </button>
        <button
          type="submit"
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Next: Game settings
        </button>
      </div>
    </form>

    <form v-show="step === 3" class="space-y-4" @submit.prevent="onCreate">
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Race length (lines)</span>
        <select
          v-model.number="textLineCount"
          class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
        >
          <option v-for="n in TEXT_LINE_COUNT_OPTIONS" :key="n" :value="n">
            {{ n }} line{{ n === 1 ? "" : "s" }}
          </option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-300">
        <input v-model="relayMode" type="checkbox" class="rounded border-slate-600" />
        Relay mode (one active typist per team)
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-300">
        <input v-model="openLobbyOnCreate" type="checkbox" class="rounded border-slate-600" />
        Open lobby immediately after create
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-300">
        <input v-model="publicWall" type="checkbox" class="rounded border-slate-600" />
        Enable public display wall (coming soon)
      </label>
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Theme color</span>
        <div class="flex gap-2">
          <input v-model="themePrimary" type="color" class="h-10 w-14 cursor-pointer rounded border border-slate-700" />
          <input
            v-model="themePrimary"
            class="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100"
          />
        </div>
      </label>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          @click="step = 2"
        >
          Back
        </button>
        <button
          type="submit"
          :disabled="busy || !name.trim()"
          class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {{ busy ? "Creating…" : "Create event" }}
        </button>
      </div>
    </form>
  </div>
</template>
