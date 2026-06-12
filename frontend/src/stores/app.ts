import { defineStore } from "pinia";
import { computed, ref } from "vue";

const apiBase = () => import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export const useAppStore = defineStore("app", () => {
  const health = ref<{ status: string } | null>(null);
  const healthError = ref<string | null>(null);
  const wsLog = ref<string[]>([]);
  const wsConnected = ref(false);

  const apiRoot = computed(() => apiBase());

  async function fetchHealth() {
    healthError.value = null;
    try {
      const res = await fetch(`${apiBase()}/health`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      health.value = (await res.json()) as { status: string };
    } catch (e) {
      health.value = null;
      healthError.value = e instanceof Error ? e.message : "Unknown error";
    }
  }

  function pushWsLog(line: string) {
    wsLog.value = [...wsLog.value, line].slice(-40);
  }

  return {
    health,
    healthError,
    wsLog,
    wsConnected,
    apiRoot,
    fetchHealth,
    pushWsLog,
    setWsConnected(v: boolean) {
      wsConnected.value = v;
    },
  };
});
