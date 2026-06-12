import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
  JoinOkPayload,
  JoinPeer,
  LeaderboardPlayer,
  RelayState,
  TeamRow,
} from "../types/game";

type JoinPending = {
  resolve: () => void;
  reject: (e: Error) => void;
};

type LiteRow = { i: string; r: number; p: number; w: number };
type YouLite = { a: number; e: number; tc: number; t: number; tr: number; ra: boolean };

/** Must match backend `ALLOWED_TEXT_LINE_COUNTS`. */
export const TEXT_LINE_COUNT_OPTIONS = [1, 2, 5, 8] as const;

function normalizeLeaderboardPlayer(p: LeaderboardPlayer): LeaderboardPlayer {
  return {
    ...p,
    team_id: typeof p.team_id === "number" ? p.team_id : 0,
    team_rank: typeof p.team_rank === "number" ? p.team_rank : 0,
    relay_active: Boolean(p.relay_active),
  };
}

function stubPlayer(id: string, name: string, team_id: number): LeaderboardPlayer {
  return {
    id,
    name,
    team_id,
    team_rank: 0,
    relay_active: false,
    wpm: 0,
    accuracy: 1,
    progress: 0,
    typed_chars: 0,
    keystrokes: 0,
    errors: 0,
    rank: 0,
  };
}

export const useGameStore = defineStore("game", () => {
  const ws = ref<WebSocket | null>(null);
  const connectionState = ref<"idle" | "connecting" | "open">("idle");
  const roomId = ref("");
  const playerId = ref("");
  const playerName = ref("");
  const paragraph = ref("");
  const teamId = ref(0);
  const relayMode = ref(false);
  const isHost = ref(false);
  const shardIndex = ref<number | null>(null);
  const logicalRoomId = ref("");
  const players = ref<LeaderboardPlayer[]>([]);
  const teams = ref<TeamRow[]>([]);
  const teamRankings = ref<TeamRow[]>([]);
  const relayState = ref<RelayState | null>(null);
  const raceStarted = ref(false);
  const gamePaused = ref(false);
  const raceFinishedByHost = ref(false);
  const hostControlsBusy = ref(false);
  const rematchLoading = ref(false);
  /** `3|2|1` countdown, `-1` = show GO, `null` = hidden. */
  const restartCountdown = ref<number | null>(null);
  const roomSettings = ref<{ textLineCount: number }>({ textLineCount: 1 });
  /** Last server-confirmed line count (revert optimistic UI on reject). */
  const confirmedTextLineCount = ref(1);
  /** Host: true between sending `room_settings_update` and receiving `room_settings_sync`. */
  const roomSettingsSyncing = ref(false);
  const lastError = ref<string | null>(null);
  const finalStandings = ref<LeaderboardPlayer[]>([]);
  const finalTeams = ref<TeamRow[]>([]);
  let joinPending: JoinPending | null = null;

  const me = computed(() => {
    const p = players.value.find((x) => x.id === playerId.value);
    if (!p) return undefined;
    return { ...p, is_host: isHost.value };
  });

  const isSocketOpen = computed(
    () => ws.value != null && ws.value.readyState === WebSocket.OPEN
  );

  function mergeLeaderboardLite(msg: Record<string, unknown>): void {
    const rows = msg.p as LiteRow[] | undefined;
    if (!Array.isArray(rows)) {
      return;
    }
    if (rows.length === 0) {
      return;
    }
    const you = msg.y as Partial<YouLite> | undefined;
    const selfYou: YouLite | undefined =
      you &&
      typeof you.a === "number" &&
      typeof you.e === "number" &&
      typeof you.tc === "number" &&
      typeof you.t === "number" &&
      typeof you.tr === "number" &&
      typeof you.ra === "boolean"
        ? {
            a: you.a,
            e: you.e,
            tc: you.tc,
            t: you.t,
            tr: you.tr,
            ra: you.ra,
          }
        : undefined;

    const prevMap = new Map(players.value.map((x) => [x.id, x]));
    const sid = playerId.value;
    const sname = playerName.value;

    players.value = rows.map((row) => {
      const old = prevMap.get(row.i);
      const isSelf = row.i === sid;
      const yv = isSelf ? selfYou : undefined;
      const base = old ?? stubPlayer(row.i, row.i.slice(0, 8), 0);
      return {
        ...base,
        id: row.i,
        name: old?.name ?? (isSelf ? sname : row.i.slice(0, 8)),
        rank: row.r,
        progress: row.p,
        wpm: row.w,
        team_id: yv?.t ?? old?.team_id ?? base.team_id,
        team_rank: yv?.tr ?? old?.team_rank ?? 0,
        relay_active: yv?.ra ?? old?.relay_active ?? false,
        accuracy: yv?.a ?? old?.accuracy ?? 1,
        errors: yv?.e ?? old?.errors ?? 0,
        typed_chars: yv?.tc ?? old?.typed_chars ?? 0,
        keystrokes: old?.keystrokes ?? 0,
      };
    });

    if (typeof msg.paused === "boolean") {
      gamePaused.value = msg.paused;
    }
    if (msg.finished === true) {
      raceFinishedByHost.value = true;
    }
  }

  function applyRematchFromServer(text: string): void {
    paragraph.value = text;
    raceFinishedByHost.value = false;
    raceStarted.value = false;
    gamePaused.value = false;
    hostControlsBusy.value = false;
    rematchLoading.value = false;
    restartCountdown.value = null;
    if (players.value.length === 0) return;
    players.value = players.value.map((p) => stubPlayer(p.id, p.name, p.team_id));
    if (relayMode.value) {
      relayState.value = {
        enabled: true,
        active_player_by_team: { "0": null, "1": null },
      };
    }
  }

  function devDirectApiOrigin(): string | null {
    const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "").trim();
    if (apiBase) return null;

    const envTarget = (import.meta.env.VITE_DEV_PROXY_TARGET as string | undefined)?.trim();
    if (envTarget) {
      try {
        return new URL(envTarget).origin;
      } catch {
        /* ignore */
      }
    }
    if (import.meta.env.DEV && typeof __TYPING_RACE_DEV_API_TARGET__ !== "undefined") {
      const t = String(__TYPING_RACE_DEV_API_TARGET__).trim();
      if (t) {
        try {
          return new URL(t).origin;
        } catch {
          /* ignore */
        }
      }
    }
    if (typeof window !== "undefined") {
      const h = window.location.hostname;
      if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") {
        return "http://127.0.0.1:8000";
      }
    }
    return null;
  }

  function wsUrl(room: string): string {
    const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
    if (base) {
      const u = new URL(base);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      u.pathname = `/ws/${encodeURIComponent(room)}`;
      u.search = "";
      u.hash = "";
      return u.toString();
    }
    const direct = devDirectApiOrigin();
    if (direct) {
      const u = new URL(direct);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      u.pathname = `/ws/${encodeURIComponent(room)}`;
      u.search = "";
      u.hash = "";
      return u.toString();
    }
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${window.location.host}/ws/${encodeURIComponent(room)}`;
  }

  function healthCheckUrl(): string {
    const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
    if (base) {
      try {
        const u = new URL(base);
        return `${u.origin}/api/v1/health`;
      } catch {
        return "/api/v1/health";
      }
    }
    return "/api/v1/health";
  }

  type HealthProbe =
    | { ok: true }
    | {
        ok: false;
        kind: "abort" | "network" | "http_error" | "wrong_body";
        status?: number;
        detail: string;
      };

  async function probeHealthUrl(url: string): Promise<HealthProbe> {
    const ac = new AbortController();
    const tid = window.setTimeout(() => ac.abort(), 5000);
    try {
      const r = await fetch(url, { method: "GET", signal: ac.signal, cache: "no-store" });
      const text = await r.text();
      const snippet = text.trim().replace(/\s+/g, " ").slice(0, 180);
      if (!r.ok) {
        return {
          ok: false,
          kind: "http_error",
          status: r.status,
          detail: snippet || "(empty body)",
        };
      }
      let j: unknown;
      try {
        j = JSON.parse(text);
      } catch {
        return { ok: false, kind: "wrong_body", detail: snippet || "non-JSON response" };
      }
      if (!j || typeof j !== "object") {
        return { ok: false, kind: "wrong_body", detail: snippet };
      }
      const row = j as { status?: unknown; service?: unknown };
      if (row.status !== "ok") {
        return {
          ok: false,
          kind: "wrong_body",
          detail: snippet || "missing status ok",
        };
      }
      if (row.service !== undefined && row.service !== "typing-race-api") {
        return {
          ok: false,
          kind: "wrong_body",
          detail: `wrong service field (${String(row.service)}). This is not the typing-race API. Body: ${snippet}`,
        };
      }
      return { ok: true };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { ok: false, kind: "abort", detail: "request timed out (5s)" };
      }
      return {
        ok: false,
        kind: "network",
        detail: e instanceof Error ? e.message : "fetch failed",
      };
    } finally {
      window.clearTimeout(tid);
    }
  }

  function formatProbeHint(url: string, p: Extract<HealthProbe, { ok: false }>): string {
    const u = url.startsWith("http") ? url : `(same origin) ${url}`;
    if (p.kind === "http_error" && p.status === 404) {
      return `${u} → HTTP 404. Another app may be bound to port 8000 (not typing-race). Stop it, then run typing-race backend only.`;
    }
    if (p.kind === "http_error") {
      return `${u} → HTTP ${p.status ?? "?"}: ${p.detail}`;
    }
    if (p.kind === "wrong_body") {
      return `${u} → ${p.detail}`;
    }
    if (p.kind === "network") {
      const low = p.detail.toLowerCase();
      if (low.includes("failed to fetch") || low.includes("networkerror")) {
        const proxyHint =
          url.startsWith("/") || url.startsWith(".")
            ? " The dev server proxy could not reach the API (backend stopped, wrong port, or not using Vite). "
            : " ";
        return `${u} → ${p.detail}.${proxyHint}Start typing-race backend, then curl http://127.0.0.1:8000/api/v1/health`;
      }
      return `${u} → ${p.detail}`;
    }
    return `${u} → ${p.detail}`;
  }

  /** Ensures HTTP API is reachable before opening a WebSocket (clearer errors than WS alone). */
  async function assertGameApiReachable(): Promise<void> {
    const primary = healthCheckUrl();
    const direct = devDirectApiOrigin();
    const secondary = direct ? `${direct}/api/v1/health` : null;

    const tried: string[] = [];
    const failures: string[] = [];

    async function tryOne(url: string): Promise<boolean> {
      if (tried.includes(url)) return false;
      tried.push(url);
      const r = await probeHealthUrl(url);
      if (r.ok) return true;
      failures.push(formatProbeHint(url, r));
      return false;
    }

    if (await tryOne(primary)) return;
    if (secondary && secondary !== primary && (await tryOne(secondary))) return;

    const lines = [
      `Cannot reach the typing-race API (tried ${tried.join(" → ")}).`,
      ...failures.map((f) => `Diagnostics: ${f}`),
    ];
    lines.push(
      "Fix: 1) Terminal: cd typing-race/backend && source .venv/bin/activate && npm run dev",
      '2) curl -s http://127.0.0.1:8000/api/v1/health — expect {"status":"ok","service":"typing-race-api"}',
      "3) If curl fails or 404, free port 8000 (lsof -i :8000) and run only this backend.",
      "4) Frontend must be served by Vite (npm run dev or npm run preview) — not opened as a raw file. Hard-refresh.",
      "5) Wrong API port? Set frontend/.env: VITE_DEV_PROXY_TARGET=http://127.0.0.1:PORT then restart Vite."
    );

    throw new Error(lines.join(" "));
  }

  function dispatchMessage(raw: string): void {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    const msg = data as Record<string, unknown>;
    const type = msg.type as string | undefined;

    if (type === "join_ok") {
      const p = msg.payload as JoinOkPayload;
      playerId.value = p.player_id;
      roomId.value = p.room_id;
      logicalRoomId.value = p.logical_room_id ?? p.room_id;
      shardIndex.value = typeof p.shard_index === "number" ? p.shard_index : null;
      paragraph.value = p.text;
      const tlc =
        typeof p.text_line_count === "number" && Number.isFinite(p.text_line_count)
          ? Math.round(p.text_line_count)
          : 1;
      roomSettings.value = { textLineCount: tlc };
      confirmedTextLineCount.value = tlc;
      roomSettingsSyncing.value = false;
      teamId.value = p.team_id ?? 0;
      relayMode.value = Boolean(p.relay_mode);
      isHost.value = Boolean(p.is_host);
      raceStarted.value = Boolean(p.started);
      gamePaused.value = Boolean(p.paused);
      lastError.value = null;
      const peers = (p.peers ?? []).filter((x: JoinPeer) => x.id !== p.player_id);
      const others = peers.map((pe) => stubPlayer(pe.id, pe.name, pe.team_id));
      const self = stubPlayer(p.player_id, playerName.value, p.team_id ?? 0);
      if (p.relay_mode) {
        self.relay_active = true;
      }
      players.value = [...others, self];
      joinPending?.resolve();
      joinPending = null;
      return;
    }

    if (type === "race_started") {
      raceStarted.value = true;
      gamePaused.value = false;
      restartCountdown.value = null;
      finalStandings.value = [];
      finalTeams.value = [];
      return;
    }

    if (type === "game_paused") {
      gamePaused.value = true;
      return;
    }

    if (type === "game_resumed") {
      gamePaused.value = false;
      return;
    }

    if (type === "game_state_update") {
      const hid = (msg.payload as { host_player_id?: string | null } | undefined)?.host_player_id;
      isHost.value = hid === playerId.value;
      return;
    }

    if (type === "race_finished") {
      const pl = msg.payload as {
        players?: LeaderboardPlayer[];
        teams?: TeamRow[];
        team_rankings?: TeamRow[];
      };
      const arr = pl?.players;
      if (Array.isArray(arr) && arr.length > 0) {
        const normalized = arr.map(normalizeLeaderboardPlayer);
        players.value = normalized;
        finalStandings.value = normalized.map((x) => ({ ...x }));
      } else {
        captureFinalStandings();
      }
      if (Array.isArray(pl?.teams)) {
        teams.value = pl.teams as TeamRow[];
      }
      if (Array.isArray(pl?.team_rankings)) {
        teamRankings.value = pl.team_rankings as TeamRow[];
        finalTeams.value = (pl.team_rankings as TeamRow[]).map((t) => ({ ...t }));
      } else {
        finalTeams.value = teamRankings.value.map((t) => ({ ...t }));
      }
      gamePaused.value = false;
      raceStarted.value = false;
      raceFinishedByHost.value = true;
      hostControlsBusy.value = false;
      return;
    }

    if (type === "game_restart") {
      const pl = msg.payload as { text?: string } | undefined;
      const t = typeof pl?.text === "string" ? pl.text : "";
      if (t) applyRematchFromServer(t);
      return;
    }

    if (type === "game_restart_countdown") {
      const pl = msg.payload as { n?: number; go?: boolean } | undefined;
      if (pl?.go) {
        restartCountdown.value = -1;
      } else if (typeof pl?.n === "number") {
        restartCountdown.value = pl.n;
      }
      return;
    }

    if (type === "room_settings_sync") {
      const pl = msg.payload as { text_line_count?: number; text?: string } | undefined;
      if (typeof pl?.text_line_count === "number" && Number.isFinite(pl.text_line_count)) {
        const n = Math.round(pl.text_line_count);
        roomSettings.value = { textLineCount: n };
        confirmedTextLineCount.value = n;
      }
      if (typeof pl?.text === "string" && pl.text.length > 0) {
        paragraph.value = pl.text;
      }
      roomSettingsSyncing.value = false;
      return;
    }

    if (type === "leaderboard") {
      const legacy = msg.players as LeaderboardPlayer[] | undefined;
      if (Array.isArray(legacy) && legacy.length > 0 && "name" in legacy[0]) {
        players.value = legacy.map(normalizeLeaderboardPlayer);
        const t = msg.teams as TeamRow[] | undefined;
        teams.value = Array.isArray(t) ? t : [];
        const tr = msg.team_rankings as TeamRow[] | undefined;
        teamRankings.value = Array.isArray(tr) ? tr : [];
        const rel = msg.relay as RelayState | undefined;
        relayState.value = rel && typeof rel === "object" ? rel : null;
        return;
      }
      mergeLeaderboardLite(msg);
      return;
    }

    if (type === "room_meta") {
      const t = msg.teams as TeamRow[] | undefined;
      teams.value = Array.isArray(t) ? t : [];
      const tr = msg.team_rankings as TeamRow[] | undefined;
      teamRankings.value = Array.isArray(tr) ? tr : [];
      const rel = msg.relay as RelayState | undefined;
      relayState.value = rel && typeof rel === "object" ? rel : null;
      return;
    }

    if (type === "player_joined") {
      const pl = (msg.payload as { player?: JoinPeer } | undefined)?.player;
      if (!pl?.id) return;
      if (players.value.some((x) => x.id === pl.id)) return;
      players.value = [...players.value, stubPlayer(pl.id, pl.name, pl.team_id)];
      return;
    }

    if (type === "error") {
      const raw = (msg.payload as { detail?: unknown } | undefined)?.detail;
      const detail =
        typeof raw === "string"
          ? raw
          : raw != null
            ? JSON.stringify(raw)
            : "Unknown error";
      lastError.value = detail;
      if (detail === "start_rejected") {
        raceStarted.value = false;
      }
      if (detail === "finish_rejected" || detail === "pause_rejected" || detail === "resume_rejected") {
        hostControlsBusy.value = false;
      }
      if (detail === "restart_rejected") {
        rematchLoading.value = false;
      }
      if (detail === "room_settings_rejected") {
        roomSettingsSyncing.value = false;
        roomSettings.value = { textLineCount: confirmedTextLineCount.value };
      }
      if (!playerId.value && joinPending) {
        joinPending.reject(new Error(lastError.value));
        joinPending = null;
      }
      return;
    }

    if (type === "ping") {
      if (ws.value?.readyState === WebSocket.OPEN) {
        ws.value.send(JSON.stringify({ type: "pong", payload: {} }));
      }
      return;
    }

    if (type === "pong") {
      return;
    }

    if (type === "player_left") {
      const pid = (msg.payload as { player_id?: string } | undefined)?.player_id;
      if (pid) {
        players.value = players.value.filter((x) => x.id !== pid);
      }
      return;
    }
  }

  function disconnect(): void {
    joinPending?.reject(new Error("Disconnected"));
    joinPending = null;
    if (ws.value) {
      ws.value.onopen = null;
      ws.value.onmessage = null;
      ws.value.onerror = null;
      ws.value.onclose = null;
      try {
        ws.value.close();
      } catch {
        /* ignore */
      }
      ws.value = null;
    }
    connectionState.value = "idle";
    rematchLoading.value = false;
    restartCountdown.value = null;
    roomSettingsSyncing.value = false;
  }

  function resetSession(): void {
    disconnect();
    roomId.value = "";
    logicalRoomId.value = "";
    shardIndex.value = null;
    playerId.value = "";
    playerName.value = "";
    paragraph.value = "";
    teamId.value = 0;
    relayMode.value = false;
    isHost.value = false;
    raceStarted.value = false;
    gamePaused.value = false;
    raceFinishedByHost.value = false;
    hostControlsBusy.value = false;
    rematchLoading.value = false;
    restartCountdown.value = null;
    players.value = [];
    teams.value = [];
    teamRankings.value = [];
    relayState.value = null;
    finalStandings.value = [];
    finalTeams.value = [];
    lastError.value = null;
    roomSettings.value = { textLineCount: 1 };
    confirmedTextLineCount.value = 1;
    roomSettingsSyncing.value = false;
  }

  function attachSocket(socket: WebSocket, opts?: { healthOk: boolean }) {
    const healthOk = opts?.healthOk ?? false;
    ws.value = socket;
    const failPendingJoin = (message: string) => {
      if (!joinPending) return;
      lastError.value = message;
      joinPending.reject(new Error(message));
      joinPending = null;
    };
    socket.onmessage = (ev: MessageEvent<string>) => {
      dispatchMessage(ev.data);
    };
    socket.onclose = (ev: CloseEvent) => {
      connectionState.value = "idle";
      if (joinPending) {
        const likelyUnreachable =
          ev.code === 1006 || (!ev.wasClean && ev.code !== 1000 && ev.code !== 1008);
        if (likelyUnreachable) {
          failPendingJoin(
            healthOk
              ? "WebSocket closed before join (often code 1006) even though /health worked. Try: restart backend (Ctrl+C then cd backend && npm run dev), hard-refresh this page, or set VITE_API_BASE_URL=http://127.0.0.1:8000 in frontend/.env if you are not using Vite’s proxy."
              : "Cannot reach the game server. In a separate terminal run: cd backend && source .venv/bin/activate && npm run dev (API on http://127.0.0.1:8000). Open this app with npm run dev in frontend (usually http://localhost:5173) so /ws is proxied."
          );
        } else {
          failPendingJoin(`Disconnected before join completed (code ${ev.code}).`);
        }
      }
      ws.value = null;
    };
    socket.onerror = () => {
      if (joinPending) {
        failPendingJoin(
          healthOk
            ? "WebSocket error while /health succeeded — proxy or upgrade issue. Restart Vite and the API; try frontend/.env VITE_DEV_PROXY_TARGET=http://127.0.0.1:8000 or VITE_API_BASE_URL=http://127.0.0.1:8000."
            : "WebSocket error — the API is probably not running. Try: cd backend && npm run dev"
        );
      } else {
        lastError.value = "WebSocket error";
      }
    };
  }

  async function connectAndJoin(
    rid: string,
    name: string,
    opts?: { teamId?: 0 | 1; relay?: boolean; host?: boolean }
  ): Promise<void> {
    lastError.value = null;
    disconnect();
    const cleanRoom = rid.trim();
    const cleanName = (name.trim() || "Player").slice(0, 48);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanRoom)) {
      throw new Error("Room ID: letters, numbers, underscore, hyphen only (1–64 chars).");
    }

    roomId.value = cleanRoom;
    playerName.value = cleanName;
    connectionState.value = "connecting";

    try {
      await assertGameApiReachable();
    } catch (e) {
      connectionState.value = "idle";
      throw e;
    }

    const payload: Record<string, unknown> = { name: cleanName };
    if (opts?.teamId !== undefined) payload.team_id = opts.teamId;
    if (opts?.relay !== undefined) payload.relay = opts.relay;
    if (opts?.host === true) payload.host = true;

    await new Promise<void>((resolve, reject) => {
      joinPending = { resolve, reject };
      const socket = new WebSocket(wsUrl(cleanRoom));
      attachSocket(socket, { healthOk: true });
      socket.onopen = () => {
        connectionState.value = "open";
        socket.send(JSON.stringify({ type: "join", payload }));
      };
    });
    if (opts?.host === true && !isHost.value) {
      isHost.value = true;
    }
  }

  function sendKeyChar(char: string): void {
    if (char.length !== 1 || !ws.value || ws.value.readyState !== WebSocket.OPEN) return;
    if (gamePaused.value || raceFinishedByHost.value) return;
    ws.value.send(JSON.stringify({ type: "key", payload: { char } }));
  }

  function sendKeyBackspace(): void {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return;
    if (gamePaused.value || raceFinishedByHost.value) return;
    ws.value.send(JSON.stringify({ type: "key", payload: { backspace: true } }));
  }

  function sendRelayPass(): void {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return;
    if (gamePaused.value || raceFinishedByHost.value) return;
    ws.value.send(JSON.stringify({ type: "relay_pass", payload: {} }));
  }

  function startRace(): boolean {
    if (!isHost.value) {
      lastError.value = "Only the room host can start the game.";
      return false;
    }
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      lastError.value = "Not connected to the room. Refresh and join again.";
      return false;
    }
    lastError.value = null;
    raceStarted.value = true;
    ws.value.send(JSON.stringify({ type: "start", payload: {} }));
    return true;
  }

  function sendHostPause(): void {
    if (!isHost.value || !ws.value || ws.value.readyState !== WebSocket.OPEN) return;
    lastError.value = null;
    ws.value.send(JSON.stringify({ type: "game_pause", payload: {} }));
  }

  function sendHostResume(): void {
    if (!isHost.value || !ws.value || ws.value.readyState !== WebSocket.OPEN) return;
    lastError.value = null;
    ws.value.send(JSON.stringify({ type: "game_resume", payload: {} }));
  }

  function sendHostFinishRace(): void {
    if (!isHost.value || !ws.value || ws.value.readyState !== WebSocket.OPEN) return;
    lastError.value = null;
    hostControlsBusy.value = true;
    ws.value.send(JSON.stringify({ type: "game_finish", payload: {} }));
  }

  function sendGameRestart(): void {
    if (!isHost.value || !ws.value || ws.value.readyState !== WebSocket.OPEN) return;
    lastError.value = null;
    rematchLoading.value = true;
    ws.value.send(JSON.stringify({ type: "game_restart", payload: {} }));
  }

  function sendRoomTextLineCount(lineCount: number): void {
    if (!isHost.value || !ws.value || ws.value.readyState !== WebSocket.OPEN) return;
    lastError.value = null;
    roomSettings.value = { textLineCount: lineCount };
    roomSettingsSyncing.value = true;
    ws.value.send(
      JSON.stringify({
        type: "room_settings_update",
        payload: { text_line_count: lineCount },
      })
    );
  }

  function sendLeave(): void {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return;
    ws.value.send(JSON.stringify({ type: "leave", payload: {} }));
  }

  function captureFinalStandings(): void {
    finalStandings.value = players.value.map((p) => ({ ...p }));
    finalTeams.value = teamRankings.value.map((t) => ({ ...t }));
  }

  return {
    ws,
    isSocketOpen,
    connectionState,
    roomId,
    logicalRoomId,
    shardIndex,
    playerId,
    playerName,
    paragraph,
    teamId,
    relayMode,
    isHost,
    players,
    teams,
    teamRankings,
    relayState,
    raceStarted,
    gamePaused,
    raceFinishedByHost,
    hostControlsBusy,
    rematchLoading,
    restartCountdown,
    roomSettings,
    roomSettingsSyncing,
    lastError,
    finalStandings,
    finalTeams,
    me,
    connectAndJoin,
    sendKeyChar,
    sendKeyBackspace,
    sendRelayPass,
    startRace,
    sendHostPause,
    sendHostResume,
    sendHostFinishRace,
    sendGameRestart,
    sendRoomTextLineCount,
    sendLeave,
    disconnect,
    resetSession,
    captureFinalStandings,
  };
});
