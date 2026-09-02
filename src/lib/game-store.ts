"use client";

import { create } from "zustand";
import {
  applyKeystroke,
  newTypingState,
  type TypingRuntimeState,
} from "../../server/game/typing-engine";
import {
  clearPlayerSession,
  loadPlayerSession,
  savePlayerSession,
} from "./player-session";
import type { LeaderboardPlayer, TeamRow } from "./types";

export const TEXT_LINE_COUNT_OPTIONS = [1, 2, 5, 8] as const;

type GameState = {
  ws: WebSocket | null;
  roomId: string;
  playerId: string;
  playerName: string;
  paragraph: string;
  teamId: number;
  relayMode: boolean;
  isHost: boolean;
  players: LeaderboardPlayer[];
  teams: TeamRow[];
  raceStarted: boolean;
  gamePaused: boolean;
  raceFinished: boolean;
  finalStandings: LeaderboardPlayer[];
  finalTeams: TeamRow[];
  textLineCount: number;
  lastError: string | null;
  typingLocal: TypingRuntimeState;
  connectAndJoin: (
    roomId: string,
    name: string,
    opts?: { teamId?: 0 | 1; relay?: boolean; host?: boolean; playerId?: string }
  ) => Promise<void>;
  restoreSession: () => Promise<boolean>;
  sendKey: (char: string) => void;
  sendBackspace: () => void;
  sendStart: () => void;
  sendPause: () => void;
  sendResume: () => void;
  sendFinish: () => void;
  sendRestart: () => void;
  sendLeave: () => void;
  sendTextLineCount: (n: number) => void;
  resetSession: () => void;
};

function wsUrl(room: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/${encodeURIComponent(room)}`;
}

function stub(id: string, name: string, team_id: number): LeaderboardPlayer {
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

export const useGameStore = create<GameState>((set, get) => ({
  ws: null,
  roomId: "",
  playerId: "",
  playerName: "",
  paragraph: "",
  teamId: 0,
  relayMode: false,
  isHost: false,
  players: [],
  teams: [],
  raceStarted: false,
  gamePaused: false,
  raceFinished: false,
  finalStandings: [],
  finalTeams: [],
  textLineCount: 1,
  lastError: null,
  typingLocal: newTypingState(),

  resetSession: () => {
    get().ws?.close();
    clearPlayerSession();
    set({
      ws: null,
      roomId: "",
      playerId: "",
      playerName: "",
      paragraph: "",
      players: [],
      teams: [],
      raceStarted: false,
      gamePaused: false,
      raceFinished: false,
      finalStandings: [],
      finalTeams: [],
      isHost: false,
      lastError: null,
      typingLocal: newTypingState(),
    });
  },

  restoreSession: async () => {
    const saved = loadPlayerSession();
    if (!saved) return false;
    if (get().playerId && get().ws?.readyState === WebSocket.OPEN) return true;
    try {
      await get().connectAndJoin(saved.roomId, saved.playerName, {
        teamId: saved.teamId as 0 | 1,
        relay: saved.relayMode || undefined,
        playerId: saved.playerId,
      });
      return true;
    } catch {
      clearPlayerSession();
      return false;
    }
  },

  connectAndJoin: async (roomId, name, opts) => {
    const health = await fetch("/api/health");
    if (!health.ok) throw new Error("API not reachable");
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl(roomId.trim()));
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Connection timeout"));
      }, 15000);

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: "join",
            payload: {
              name: name.trim(),
              team_id: opts?.teamId,
              relay: opts?.relay,
              host: opts?.host,
              player_id: opts?.playerId,
            },
          })
        );
      };

      socket.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        if (msg.type === "join_ok") {
          clearTimeout(timeout);
          const p = msg.payload as Record<string, unknown>;
          const typingLocal = newTypingState();
          typingLocal.typedIndex = Number(p.typed_chars ?? 0);
          typingLocal.errors = Number(p.errors ?? 0);

          set({
            ws: socket,
            roomId,
            playerId: String(p.player_id),
            playerName: name.trim(),
            paragraph: String(p.text ?? ""),
            teamId: Number(p.team_id ?? 0),
            relayMode: Boolean(p.relay_mode),
            isHost: Boolean(p.is_host),
            raceStarted: Boolean(p.started),
            gamePaused: Boolean(p.paused),
            raceFinished: Boolean(p.finished),
            textLineCount: Number(p.text_line_count ?? 1),
            typingLocal,
          });

          savePlayerSession({
            roomId,
            playerId: String(p.player_id),
            playerName: name.trim(),
            teamId: Number(p.team_id ?? 0),
            relayMode: Boolean(p.relay_mode),
          });

          attachHandlers(socket, set, get);
          resolve();
          return;
        }
        if (msg.type === "error") {
          clearTimeout(timeout);
          const detail = (msg.payload as { detail?: string })?.detail ?? "join failed";
          reject(new Error(detail));
        }
      };

      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("WebSocket error"));
      };
    });
  },

  sendKey: (char) => {
    const { ws, paragraph, typingLocal } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN || char.length !== 1) return;
    applyKeystroke(typingLocal, paragraph, {
      char,
      backspace: false,
      nowMono: performance.now() / 1000,
    });
    set({ typingLocal: { ...typingLocal } });
    ws.send(JSON.stringify({ type: "key", payload: { char } }));
  },

  sendBackspace: () => {
    const { ws, paragraph, typingLocal } = get();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    applyKeystroke(typingLocal, paragraph, {
      backspace: true,
      nowMono: performance.now() / 1000,
    });
    set({ typingLocal: { ...typingLocal } });
    ws.send(JSON.stringify({ type: "key", payload: { backspace: true } }));
  },

  sendStart: () => get().ws?.send(JSON.stringify({ type: "start", payload: {} })),
  sendPause: () => get().ws?.send(JSON.stringify({ type: "game_pause", payload: {} })),
  sendResume: () => get().ws?.send(JSON.stringify({ type: "game_resume", payload: {} })),
  sendFinish: () => get().ws?.send(JSON.stringify({ type: "game_finish", payload: {} })),
  sendRestart: () => get().ws?.send(JSON.stringify({ type: "game_restart", payload: {} })),
  sendLeave: () => {
    get().ws?.send(JSON.stringify({ type: "leave", payload: {} }));
    get().ws?.close();
    clearPlayerSession();
  },
  sendTextLineCount: (n) =>
    get().ws?.send(JSON.stringify({ type: "room_settings_update", payload: { text_line_count: n } })),
}));

function attachHandlers(
  socket: WebSocket,
  set: (p: Partial<GameState>) => void,
  get: () => GameState
) {
  socket.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
    const type = String(msg.type);

    if (type === "leaderboard") {
      const rows = msg.p as { i: string; r: number; p: number; w: number }[];
      const you = msg.y as { a: number; e: number; tc: number; t: number; tr: number; ra: boolean } | undefined;
      const sid = get().playerId;
      const prev = new Map(get().players.map((x) => [x.id, x]));
      const typingLocal = { ...get().typingLocal };
      if (you && typeof you.tc === "number") {
        typingLocal.typedIndex = you.tc;
      }
      if (you && typeof you.e === "number") {
        typingLocal.errors = you.e;
      }
      set({
        typingLocal,
        players: rows.map((row) => {
          const old = prev.get(row.i);
          const isSelf = row.i === sid;
          return {
            ...(old ?? stub(row.i, row.i.slice(0, 8), 0)),
            id: row.i,
            name: old?.name ?? (isSelf ? get().playerName : row.i.slice(0, 8)),
            rank: row.r,
            progress: row.p,
            wpm: row.w,
            ...(isSelf && you
              ? {
                  accuracy: you.a,
                  errors: you.e,
                  typed_chars: you.tc,
                  team_id: you.t,
                  team_rank: you.tr,
                  relay_active: you.ra,
                }
              : {}),
          };
        }),
        gamePaused: Boolean(msg.paused),
        raceFinished: Boolean(msg.finished),
      });
    }

    if (type === "race_started") {
      set({ raceStarted: true, gamePaused: false, raceFinished: false, typingLocal: newTypingState() });
    }
    if (type === "game_paused") set({ gamePaused: true });
    if (type === "game_resumed") set({ gamePaused: false });
    if (type === "game_restart") {
      const text = (msg.payload as { text?: string })?.text;
      if (text) {
        set({
          paragraph: text,
          raceStarted: false,
          raceFinished: false,
          gamePaused: false,
          typingLocal: newTypingState(),
        });
      }
    }
    if (type === "room_settings_sync") {
      const p = msg.payload as { text_line_count?: number; text?: string };
      const patch: Partial<GameState> = {};
      if (p.text_line_count) patch.textLineCount = p.text_line_count;
      if (p.text) {
        patch.paragraph = p.text;
        patch.typingLocal = newTypingState();
      }
      if (Object.keys(patch).length) set(patch);
    }
    if (type === "game_state_update") {
      const hid = (msg.payload as { host_player_id?: string | null })?.host_player_id;
      set({ isHost: hid === get().playerId });
    }
    if (type === "race_finished") {
      const payload = msg.payload as {
        players?: LeaderboardPlayer[];
        teams?: TeamRow[];
      };
      set({
        raceFinished: true,
        finalStandings: payload.players ?? [],
        finalTeams: payload.teams ?? [],
      });
    }
    if (type === "error") {
      set({ lastError: (msg.payload as { detail?: string })?.detail ?? "error" });
    }
  };
}
