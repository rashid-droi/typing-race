<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useAdminAuthStore } from "../../stores/adminAuth";

const router = useRouter();
const route = useRoute();
const admin = useAdminAuthStore();

const companySlug = ref("acme");
const email = ref("admin@typingrace.local");
const password = ref("");
const formError = ref<string | null>(null);

async function onSubmit() {
  formError.value = null;
  try {
    await admin.login({
      company_slug: companySlug.value.trim(),
      email: email.value.trim(),
      password: password.value,
    });
    const raw = route.query.redirect;
    const redir = Array.isArray(raw) ? raw[0] : raw;
    const path =
      typeof redir === "string" && redir.startsWith("/") && !redir.startsWith("//")
        ? redir
        : "/admin";
    await router.replace(path);
  } catch (e) {
    formError.value = e instanceof Error ? e.message : "Login failed";
  }
}
</script>

<template>
  <div class="flex min-h-full flex-col items-center justify-center px-4 py-16">
    <div class="w-full max-w-md space-y-6">
      <div class="text-center">
        <p class="text-xs font-medium uppercase tracking-widest text-slate-500">Company admin</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-100">Typing Race Admin</h1>
        <p class="mt-2 text-sm text-slate-400">
          Sign in with your organization slug and credentials (configure on the API server).
        </p>
      </div>

      <form
        class="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl"
        @submit.prevent="onSubmit"
      >
        <div>
          <label class="mb-1 block text-xs font-medium uppercase text-slate-500" for="co">Company slug</label>
          <input
            id="co"
            v-model="companySlug"
            type="text"
            autocomplete="organization"
            class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium uppercase text-slate-500" for="em">Email</label>
          <input
            id="em"
            v-model="email"
            type="email"
            autocomplete="username"
            class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium uppercase text-slate-500" for="pw">Password</label>
          <input
            id="pw"
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <p v-if="formError" class="text-sm text-rose-400">{{ formError }}</p>
        <button
          type="submit"
          :disabled="admin.loading"
          class="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {{ admin.loading ? "Signing in…" : "Sign in" }}
        </button>
      </form>

      <p class="text-center text-xs text-slate-500">
        <RouterLink to="/" class="text-violet-400 hover:underline">← Back to typing race</RouterLink>
      </p>
    </div>
  </div>
</template>
