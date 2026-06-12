import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  adminCompanyLogin,
  adminLogout,
  adminMe,
  getStoredAdminToken,
  setStoredAdminToken,
  type CompanyLoginRequest,
} from "../lib/adminApi";

export const useAdminAuthStore = defineStore("adminAuth", () => {
  const token = ref<string | null>(getStoredAdminToken());
  const companySlug = ref("");
  const email = ref("");
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => Boolean(token.value));

  async function hydrateFromStorage(): Promise<void> {
    const t = getStoredAdminToken();
    token.value = t;
    if (!t) return;
    try {
      const me = await adminMe(t);
      companySlug.value = me.company;
      email.value = me.email;
    } catch {
      token.value = null;
      setStoredAdminToken(null);
    }
  }

  async function login(payload: CompanyLoginRequest): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const res = await adminCompanyLogin(payload);
      token.value = res.access_token;
      companySlug.value = res.company_slug;
      email.value = res.email;
      setStoredAdminToken(res.access_token);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Login failed";
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    const t = token.value;
    if (t) {
      try {
        await adminLogout(t);
      } catch {
        /* ignore */
      }
    }
    token.value = null;
    companySlug.value = "";
    email.value = "";
    setStoredAdminToken(null);
  }

  return {
    token,
    companySlug,
    email,
    loading,
    error,
    isAuthenticated,
    login,
    logout,
    hydrateFromStorage,
  };
});
