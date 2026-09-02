import { v4 as uuidv4 } from "uuid";
import { GameRoom } from "./room";
import {
  buildRaceParagraph,
  DEFAULT_TEXT_LINE_COUNT,
  normalizeTextLineCount,
} from "./typing-engine";

type LogicalRoomConfig = {
  relayMode: boolean;
  hostPlayerId: string | null;
  started: boolean;
  paused: boolean;
  finished: boolean;
  raceRound: number;
  restartInProgress: boolean;
  textLineCount: number;
};

export class RoomManager {
  readonly broadcastIntervalMs: number;
  readonly maxPlayersPerShard: number;
  readonly instanceId: string;
  readonly idleSeconds: number;
  readonly serverPingIntervalS: number;

  private rooms = new Map<string, GameRoom>();
  private roomsByLogical = new Map<string, string[]>();
  private logicalConfig = new Map<string, LogicalRoomConfig>();

  constructor(opts?: {
    broadcastHz?: number;
    maxPlayersPerShard?: number;
    instanceId?: string;
    idleSeconds?: number;
    serverPingIntervalS?: number;
  }) {
    const hz = Math.max(5, Math.min(10, opts?.broadcastHz ?? 8));
    this.broadcastIntervalMs = 1000 / hz;
    this.maxPlayersPerShard = opts?.maxPlayersPerShard ?? 150;
    this.instanceId = opts?.instanceId ?? "local-1";
    this.idleSeconds = opts?.idleSeconds ?? 45;
    this.serverPingIntervalS = opts?.serverPingIntervalS ?? 10;
  }

  newPlayerId(): string {
    return uuidv4();
  }

  relayModeFor(logicalRoomId: string, relay?: boolean | null): boolean {
    let c = this.logicalConfig.get(logicalRoomId);
    if (!c) {
      const rm = relay != null ? Boolean(relay) : false;
      c = {
        relayMode: rm,
        hostPlayerId: null,
        started: false,
        paused: false,
        finished: false,
        raceRound: 0,
        restartInProgress: false,
        textLineCount: DEFAULT_TEXT_LINE_COUNT,
      };
      this.logicalConfig.set(logicalRoomId, c);
      return rm;
    }
    return c.relayMode;
  }

  playerRoomFlags(
    logicalRoomId: string,
    playerId: string,
    wantsHost?: boolean | null
  ): { isHost: boolean; started: boolean; paused: boolean; finished: boolean } {
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c) return { isHost: false, started: false, paused: false, finished: false };
    if (wantsHost && !c.hostPlayerId) c.hostPlayerId = playerId;
    return {
      isHost: c.hostPlayerId === playerId,
      started: c.started,
      paused: c.paused,
      finished: c.finished,
    };
  }

  startLogicalRace(logicalRoomId: string, playerId: string): boolean {
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c || c.hostPlayerId !== playerId) return false;
    if (c.started && !c.finished) return false;
    if (c.restartInProgress) return false;
    c.started = true;
    c.paused = false;
    c.finished = false;
    for (const room of this.roomsForLogical(logicalRoomId)) {
      void room.notifyRaceStarted();
    }
    return true;
  }

  typingBlocked(logicalRoomId: string): boolean {
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c) return true;
    return !c.started || c.finished || c.paused;
  }

  logicalPlayFlags(logicalRoomId: string): { paused: boolean; finished: boolean } {
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c) return { paused: false, finished: false };
    return { paused: c.paused, finished: c.finished };
  }

  pauseLogicalGame(logicalRoomId: string, playerId: string): boolean {
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c || c.hostPlayerId !== playerId || c.finished) return false;
    c.paused = true;
    return true;
  }

  resumeLogicalGame(logicalRoomId: string, playerId: string): boolean {
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c || c.hostPlayerId !== playerId || c.finished) return false;
    c.paused = false;
    return true;
  }

  finishLogicalGame(logicalRoomId: string, playerId: string): boolean {
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c || c.hostPlayerId !== playerId || !c.started || c.finished || c.restartInProgress)
      return false;
    c.finished = true;
    c.paused = false;
    return true;
  }

  async beginRaceRestart(logicalRoomId: string, playerId: string): Promise<boolean> {
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c || c.hostPlayerId !== playerId || c.restartInProgress) return false;
    c.restartInProgress = true;
    c.finished = false;
    c.paused = false;
    c.started = false;
    c.raceRound += 1;
    c.textLineCount = normalizeTextLineCount(c.textLineCount);
    const text = buildRaceParagraph(logicalRoomId, {
      raceRound: c.raceRound,
      lineCount: c.textLineCount,
    });
    const rooms = this.roomsForLogical(logicalRoomId);
    if (!rooms.length) {
      c.restartInProgress = false;
      return false;
    }
    for (const r of rooms) await r.resetRaceSession(text);
    this.broadcastToLogical(
      logicalRoomId,
      JSON.stringify({ type: "game_restart", payload: { text } })
    );
    void this.restartCountdownThenGo(logicalRoomId);
    return true;
  }

  private async restartCountdownThenGo(logicalRoomId: string): Promise<void> {
    try {
      for (const n of [3, 2, 1]) {
        this.broadcastToLogical(
          logicalRoomId,
          JSON.stringify({ type: "game_restart_countdown", payload: { n } })
        );
        await new Promise((r) => setTimeout(r, 1000));
      }
      this.broadcastToLogical(
        logicalRoomId,
        JSON.stringify({ type: "game_restart_countdown", payload: { go: true } })
      );
      await new Promise((r) => setTimeout(r, 450));
      const c = this.logicalConfig.get(logicalRoomId);
      if (c) c.started = true;
      for (const room of this.roomsForLogical(logicalRoomId)) {
        await room.notifyRaceStarted();
      }
    } finally {
      const c = this.logicalConfig.get(logicalRoomId);
      if (c) c.restartInProgress = false;
    }
  }

  async transferHostIfLeaving(logicalRoomId: string, leavingPlayerId: string): Promise<void> {
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c || c.hostPlayerId !== leavingPlayerId) return;
    if (leavingPlayerId.startsWith("admin-host:")) return;
    c.hostPlayerId = null;
    let newHost: string | null = null;
    for (const sk of this.roomsByLogical.get(logicalRoomId) ?? []) {
      const room = this.rooms.get(sk);
      if (!room) continue;
      for (const pid of room.listPlayerIds()) {
        if (pid !== leavingPlayerId) {
          newHost = pid;
          break;
        }
      }
      if (newHost) break;
    }
    if (newHost && c) c.hostPlayerId = newHost;
    this.broadcastHostState(logicalRoomId);
  }

  broadcastToLogical(logicalRoomId: string, message: string): void {
    for (const room of this.roomsForLogical(logicalRoomId)) {
      room.sendToAll(message);
    }
  }

  broadcastHostState(logicalRoomId: string): void {
    const c = this.logicalConfig.get(logicalRoomId);
    const hostId = c?.hostPlayerId ?? null;
    this.broadcastToLogical(
      logicalRoomId,
      JSON.stringify({ type: "game_state_update", payload: { host_player_id: hostId } })
    );
  }

  logicalTextLineCount(logicalRoomId: string): number {
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c) return DEFAULT_TEXT_LINE_COUNT;
    c.textLineCount = normalizeTextLineCount(c.textLineCount);
    return c.textLineCount;
  }

  async canonicalParagraphForShard(room: GameRoom): Promise<string> {
    const c = this.logicalConfig.get(room.logicalRoomId);
    const started = Boolean(c?.started);
    const finished = Boolean(c?.finished);
    const rr = c?.raceRound ?? 0;
    const lc = c ? normalizeTextLineCount(c.textLineCount) : DEFAULT_TEXT_LINE_COUNT;
    if (started && !finished) {
      for (const r of this.roomsForLogical(room.logicalRoomId)) {
        if (r !== room && r.getParagraph().length > 0) return r.getParagraph();
      }
    }
    return buildRaceParagraph(room.logicalRoomId, { raceRound: rr, lineCount: lc });
  }

  async resyncRoomParagraphAfterJoin(room: GameRoom): Promise<void> {
    const text = await this.canonicalParagraphForShard(room);
    await room.setSharedParagraph(text);
  }

  applyHostTextLineCount(
    logicalRoomId: string,
    playerId: string,
    rawLineCount: unknown
  ): { ok: boolean; count: number; newText: string } {
    const rawInt = Number(rawLineCount);
    const c = this.logicalConfig.get(logicalRoomId);
    if (!c || c.hostPlayerId !== playerId || c.restartInProgress) {
      return { ok: false, count: c?.textLineCount ?? DEFAULT_TEXT_LINE_COUNT, newText: "" };
    }
    if (c.started && !c.finished) {
      return { ok: false, count: c.textLineCount, newText: "" };
    }
    const n = normalizeTextLineCount(Number.isFinite(rawInt) ? rawInt : DEFAULT_TEXT_LINE_COUNT);
    if (n === c.textLineCount) return { ok: true, count: n, newText: "" };
    c.textLineCount = n;
    const text = buildRaceParagraph(logicalRoomId, { raceRound: c.raceRound, lineCount: n });
    return { ok: true, count: n, newText: text };
  }

  async pushParagraphToAllShards(logicalRoomId: string, text: string): Promise<void> {
    for (const r of this.roomsForLogical(logicalRoomId)) {
      await r.setSharedParagraph(text);
    }
  }

  roomsForLogical(logicalRoomId: string): GameRoom[] {
    const out: GameRoom[] = [];
    for (const sk of this.roomsByLogical.get(logicalRoomId) ?? []) {
      const r = this.rooms.get(sk);
      if (r) out.push(r);
    }
    return out;
  }

  assignRoom(logicalRoomId: string): GameRoom {
    const keys = [...(this.roomsByLogical.get(logicalRoomId) ?? [])];
    for (const sk of keys) {
      const room = this.rooms.get(sk);
      if (room && room.occupancy() < this.maxPlayersPerShard) return room;
    }
    const shardIdx = keys.length;
    const storageKey = `${logicalRoomId}#${shardIdx}`;
    const room = new GameRoom(storageKey, logicalRoomId, shardIdx, this);
    this.rooms.set(storageKey, room);
    const list = this.roomsByLogical.get(logicalRoomId) ?? [];
    list.push(storageKey);
    this.roomsByLogical.set(logicalRoomId, list);
    return room;
  }

  async maybeDropRoom(storageKey: string): Promise<void> {
    const room = this.rooms.get(storageKey);
    if (!room || !room.isEmpty()) return;
    const logicalId = room.logicalRoomId;
    this.rooms.delete(storageKey);
    const lst = this.roomsByLogical.get(logicalId) ?? [];
    const idx = lst.indexOf(storageKey);
    if (idx >= 0) lst.splice(idx, 1);
    if (!lst.length) {
      this.roomsByLogical.delete(logicalId);
      this.logicalConfig.delete(logicalId);
    }
  }

  routingSnapshot() {
    const shards = [...this.rooms.entries()].map(([sk, room]) => ({
      storage_key: sk,
      logical_room_id: room.logicalRoomId,
      shard_index: room.shardIndex,
      players: room.occupancy(),
    }));
    return {
      instance_id: this.instanceId,
      max_players_per_shard: this.maxPlayersPerShard,
      broadcast_interval_s: this.broadcastIntervalMs / 1000,
      broadcast_hz: 1000 / this.broadcastIntervalMs,
      shards,
    };
  }

  adminHostId(logicalRoomId: string): string {
    return `admin-host:${logicalRoomId}`;
  }

  /** Reserve host role for admin panel control (no WebSocket required). */
  claimAdminHost(logicalRoomId: string): void {
    let c = this.logicalConfig.get(logicalRoomId);
    if (!c) {
      c = {
        relayMode: false,
        hostPlayerId: this.adminHostId(logicalRoomId),
        started: false,
        paused: false,
        finished: false,
        raceRound: 0,
        restartInProgress: false,
        textLineCount: DEFAULT_TEXT_LINE_COUNT,
      };
      this.logicalConfig.set(logicalRoomId, c);
      return;
    }
    c.hostPlayerId = this.adminHostId(logicalRoomId);
  }

  ensureEventRoomConfig(
    logicalRoomId: string,
    opts: { textLineCount?: number; relayMode?: boolean }
  ): void {
    let c = this.logicalConfig.get(logicalRoomId);
    if (!c) {
      c = {
        relayMode: Boolean(opts.relayMode),
        hostPlayerId: this.adminHostId(logicalRoomId),
        started: false,
        paused: false,
        finished: false,
        raceRound: 0,
        restartInProgress: false,
        textLineCount: normalizeTextLineCount(opts.textLineCount ?? DEFAULT_TEXT_LINE_COUNT),
      };
      this.logicalConfig.set(logicalRoomId, c);
      return;
    }
    if (!c.started || c.finished) {
      if (opts.relayMode != null) c.relayMode = Boolean(opts.relayMode);
      if (opts.textLineCount != null) {
        c.textLineCount = normalizeTextLineCount(opts.textLineCount);
      }
    }
    if (!c.hostPlayerId) c.hostPlayerId = this.adminHostId(logicalRoomId);
  }

  getLogicalRoomLiveState(logicalRoomId: string) {
    const c = this.logicalConfig.get(logicalRoomId);
    let playerCount = 0;
    const players: { id: string; name: string; team_id: number; progress: number; wpm: number }[] = [];
    for (const room of this.roomsForLogical(logicalRoomId)) {
      playerCount += room.occupancy();
      for (const p of room.getPlayersSnapshot()) {
        players.push({
          id: p.id,
          name: p.name,
          team_id: p.teamId,
          progress: p.progress,
          wpm: p.wpm,
        });
      }
    }
    players.sort((a, b) => b.progress - a.progress || b.wpm - a.wpm);
    return {
      room_id: logicalRoomId,
      player_count: playerCount,
      started: Boolean(c?.started),
      paused: Boolean(c?.paused),
      finished: Boolean(c?.finished),
      text_line_count: c ? normalizeTextLineCount(c.textLineCount) : DEFAULT_TEXT_LINE_COUNT,
      relay_mode: Boolean(c?.relayMode),
      admin_hosting: c?.hostPlayerId === this.adminHostId(logicalRoomId),
      race_round: c?.raceRound ?? 0,
      players,
    };
  }

  adminApplyTextLineCount(logicalRoomId: string, rawLineCount: unknown): {
    ok: boolean;
    count: number;
    newText: string;
  } {
    this.claimAdminHost(logicalRoomId);
    return this.applyHostTextLineCount(
      logicalRoomId,
      this.adminHostId(logicalRoomId),
      rawLineCount
    );
  }

  async adminGameAction(
    logicalRoomId: string,
    action: "open_lobby" | "start" | "pause" | "resume" | "finish" | "restart"
  ): Promise<{ ok: boolean; detail?: string }> {
    this.claimAdminHost(logicalRoomId);
    const hostId = this.adminHostId(logicalRoomId);

    if (action === "open_lobby") {
      const c = this.logicalConfig.get(logicalRoomId);
      if (c) {
        c.started = false;
        c.paused = false;
        c.finished = false;
        c.restartInProgress = false;
        const text = buildRaceParagraph(logicalRoomId, {
          raceRound: c.raceRound,
          lineCount: c.textLineCount,
        });
        await this.pushParagraphToAllShards(logicalRoomId, text);
      }
      this.broadcastHostState(logicalRoomId);
      return { ok: true };
    }

    if (action === "start") {
      const c = this.logicalConfig.get(logicalRoomId);
      if (c?.started && !c.finished) {
        return { ok: false, detail: "already_started" };
      }
      if (c?.finished) {
        c.finished = false;
        c.started = false;
        c.paused = false;
        c.raceRound += 1;
        const text = buildRaceParagraph(logicalRoomId, {
          raceRound: c.raceRound,
          lineCount: c.textLineCount,
        });
        for (const room of this.roomsForLogical(logicalRoomId)) {
          await room.resetRaceSession(text);
        }
        this.broadcastToLogical(
          logicalRoomId,
          JSON.stringify({ type: "room_settings_sync", payload: { text } })
        );
      }
      if (!this.startLogicalRace(logicalRoomId, hostId)) {
        return { ok: false, detail: "start_rejected" };
      }
      return { ok: true };
    }

    if (action === "pause") {
      if (!this.pauseLogicalGame(logicalRoomId, hostId)) {
        return { ok: false, detail: "pause_rejected" };
      }
      this.broadcastToLogical(
        logicalRoomId,
        JSON.stringify({ type: "game_paused", payload: {} })
      );
      return { ok: true };
    }

    if (action === "resume") {
      if (!this.resumeLogicalGame(logicalRoomId, hostId)) {
        return { ok: false, detail: "resume_rejected" };
      }
      this.broadcastToLogical(
        logicalRoomId,
        JSON.stringify({ type: "game_resumed", payload: {} })
      );
      return { ok: true };
    }

    if (action === "finish") {
      if (!this.finishLogicalGame(logicalRoomId, hostId)) {
        return { ok: false, detail: "finish_rejected" };
      }
      for (const shard of this.roomsForLogical(logicalRoomId)) {
        await shard.broadcastRaceFinishedSnapshot();
      }
      return { ok: true };
    }

    if (action === "restart") {
      if (!(await this.beginRaceRestart(logicalRoomId, hostId))) {
        return { ok: false, detail: "restart_rejected" };
      }
      return { ok: true };
    }

    return { ok: false, detail: "unknown_action" };
  }
}

type GlobalWithRoomManager = typeof globalThis & {
  __typingRaceRoomManager?: RoomManager;
};

export function getRoomManager(): RoomManager {
  const g = globalThis as GlobalWithRoomManager;
  if (!g.__typingRaceRoomManager) {
    g.__typingRaceRoomManager = new RoomManager({
      broadcastHz: Number(process.env.BROADCAST_HZ ?? 8),
      maxPlayersPerShard: Number(process.env.MAX_PLAYERS_PER_SHARD ?? 150),
      instanceId: process.env.INSTANCE_ID ?? "local-1",
    });
  }
  return g.__typingRaceRoomManager;
}

export function setRoomManager(manager: RoomManager): void {
  (globalThis as GlobalWithRoomManager).__typingRaceRoomManager = manager;
}
