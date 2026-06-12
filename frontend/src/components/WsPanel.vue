<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useAppStore } from "../stores/app";

const app = useAppStore();
const socket = ref<WebSocket | null>(null);

function wsUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
  if (base) {
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws";
    u.search = "";
    u.hash = "";
    return u.toString();
  }
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws`;
}

function disconnect() {
  socket.value?.close();
  socket.value = null;
  app.setWsConnected(false);
}

function connect() {
  disconnect();
  const ws = new WebSocket(wsUrl());
  socket.value = ws;
  ws.addEventListener("open", () => {
    app.setWsConnected(true);
    app.pushWsLog("open");
  });
  ws.addEventListener("message", (ev) => {
    app.pushWsLog(`← ${String(ev.data)}`);
  });
  ws.addEventListener("close", () => {
    app.setWsConnected(false);
    app.pushWsLog("close");
  });
  ws.addEventListener("error", () => {
    app.pushWsLog("error");
  });
}

function sendPing() {
  socket.value?.send(JSON.stringify({ type: "ping", payload: {} }));
}

function sendEcho() {
  socket.value?.send(
    JSON.stringify({ type: "echo", payload: { message: "hello from Vue" } })
  );
}

onBeforeUnmount(disconnect);
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700"
        @click="connect"
      >
        Connect
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700"
        @click="disconnect"
      >
        Disconnect
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700 disabled:opacity-40"
        :disabled="!app.wsConnected"
        @click="sendPing"
      >
        Send ping
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700 disabled:opacity-40"
        :disabled="!app.wsConnected"
        @click="sendEcho"
      >
        Send echo
      </button>
      <span class="ml-auto text-xs text-slate-500">
        {{ app.wsConnected ? "connected" : "disconnected" }}
      </span>
    </div>
    <pre
      class="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300"
    >{{ app.wsLog.join("\n") || "…" }}</pre>
  </div>
</template>
