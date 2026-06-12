<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
import { useRouter } from "vue-router";
import { useAdminAuthStore } from "../../stores/adminAuth";

const admin = useAdminAuthStore();
const router = useRouter();

async function onLogout() {
  await admin.logout();
  await router.replace({ name: "admin-login" });
}
</script>

<template>
  <div class="flex min-h-full bg-slate-950 text-slate-100">
    <aside class="hidden w-56 shrink-0 border-r border-slate-800 bg-slate-900/80 md:flex md:flex-col">
      <div class="border-b border-slate-800 px-4 py-4">
        <p class="text-xs uppercase tracking-wide text-slate-500">Admin</p>
        <p class="truncate text-sm font-semibold text-violet-300">{{ admin.companySlug }}</p>
        <p class="truncate text-xs text-slate-500">{{ admin.email }}</p>
      </div>
      <nav class="flex flex-1 flex-col gap-1 p-2">
        <RouterLink
          :to="{ name: 'admin-overview' }"
          class="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          active-class="bg-violet-950/50 text-violet-200"
        >
          Overview
        </RouterLink>
        <RouterLink
          :to="{ name: 'admin-sessions' }"
          class="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          active-class="bg-violet-950/50 text-violet-200"
        >
          Training sessions
        </RouterLink>
        <RouterLink
          :to="{ name: 'admin-managed-events' }"
          class="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          active-class="bg-violet-950/50 text-violet-200"
        >
          Events
        </RouterLink>
        <RouterLink
          :to="{ name: 'admin-events' }"
          class="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          active-class="bg-violet-950/50 text-violet-200"
        >
          Audit log
        </RouterLink>
      </nav>
      <div class="border-t border-slate-800 p-2">
        <RouterLink to="/" class="block rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300">
          Player app →
        </RouterLink>
        <button
          type="button"
          class="mt-1 w-full rounded-lg px-3 py-2 text-left text-xs text-rose-300/90 hover:bg-slate-800"
          @click="onLogout"
        >
          Sign out
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center justify-between border-b border-slate-800 bg-slate-900/40 px-4 py-3 md:hidden">
        <span class="text-sm font-medium text-slate-200">Admin</span>
        <button type="button" class="text-xs text-rose-300" @click="onLogout">Out</button>
      </header>
      <header class="hidden border-b border-slate-800 bg-slate-900/30 px-8 py-4 md:block">
        <h1 class="text-lg font-semibold text-slate-100">Training &amp; performance</h1>
        <p class="text-sm text-slate-500">Analytics, session replay, and audit trail</p>
      </header>
      <main class="flex-1 overflow-auto p-4 md:p-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>
