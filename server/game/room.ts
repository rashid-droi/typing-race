import type { WebSocket } from "ws";
import {
  applyKeystroke,
  buildRaceParagraph,
  computeStats,
  newTypingState,
  type TypingRuntimeState,
} from "./typing-engine";
import {
  communicationEfficiencyScore,
  consistencyScore,
  teamAverageProgress,
  teamworkScore,
} from "./team-metrics";
import type { JoinPayload, Player } from "./types";
import { isOpen, sendJson } from "./types";
import type { RoomManager } from "./manager";

function rankedPlayers(players: Map<string, Player>): Player[] {
  const ordered = [...players.values()].sort(
    (a, b) =>
      b.progress - a.progress ||
      b.wpm - a.wpm ||
      b.typedChars - a.typedChars ||
      a.id.localeCompare(b.id)
  );
  return ordered.map((p, i) => ({ ...p, rank: i + 1 }));
}

export class GameRoom {
  readonly storageKey: string;
  readonly logicalRoomId: string;
  readonly shardIndex: number;
  private manager: RoomManager;
  private paragraph: string;
  private players = new Map<string, Player>();
  private typingStates = new Map<string, TypingRuntimeState>();
  private connections = new Map<string, WebSocket>();
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private relayMode = false;
  private teamOrders: Record<number, string[]> = { 0: [], 1: [] };
  private relayCursor: Record<number, number> = { 0: 0, 1: 0 };
  private relayPasses: Record<number, number> = { 0: 0, 1: 0 };
  private metaDirty = true;
  private started = false;
  private removalTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly DISCONNECT_GRACE_MS = 120_000;

  constructor(
    storageKey: string,
    logicalRoomId: string,
    shardIndex: number,
    manager: RoomManager
  ) {
    this.storageKey = storageKey;
    this.logicalRoomId = logicalRoomId;
    this.shardIndex = shardIndex;
    this.manager = manager;
    this.paragraph = buildRaceParagraph(logicalRoomId);
  }

  getParagraph(): string {
    return this.paragraph;
  }

  getRelayMode(): boolean {
    return this.relayMode;
  }

  getTypingState(playerId: string): TypingRuntimeState | undefined {
    return this.typingStates.get(playerId);
  }

  disconnectPlayer(playerId: string): void {
    if (!this.players.has(playerId)) return;
    this.connections.delete(playerId);

    const existing = this.removalTimers.get(playerId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.removalTimers.delete(playerId);
      void this.removePlayer(playerId, "disconnect_timeout");
    }, GameRoom.DISCONNECT_GRACE_MS);
    this.removalTimers.set(playerId, timer);
  }

  private tryReconnect(ws: WebSocket, playerId: string): Player | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    const timer = this.removalTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.removalTimers.delete(playerId);
    }

    this.connections.set(playerId, ws);
    this.metaDirty = true;
    this.ensureBroadcast();
    return player;
  }

  occupancy(): number {
    return this.connections.size;
  }

  getPlayersSnapshot(): {
    id: string;
    name: string;
    teamId: number;
    progress: number;
    wpm: number;
  }[] {
    const nowMono = performance.now() / 1000;
    return [...this.allPlayersWithStats(nowMono).values()].map((p) => ({
      id: p.id,
      name: p.name,
      teamId: p.teamId,
      progress: p.progress,
      wpm: p.wpm,
    }));
  }

  isEmpty(): boolean {
    return this.connections.size === 0;
  }

  listPlayerIds(): string[] {
    return [...this.players.keys()];
  }

  peersSnapshot(excludeId: string): { id: string; name: string; team_id: number }[] {
    return [...this.players.values()]
      .filter((p) => p.id !== excludeId)
      .map((p) => ({ id: p.id, name: p.name, team_id: p.teamId }));
  }

  private pickTeam(preferred?: number | null): number {
    if (preferred === 0 || preferred === 1) return preferred;
    const n0 = this.teamOrders[0]!.length;
    const n1 = this.teamOrders[1]!.length;
    return n0 <= n1 ? 0 : 1;
  }

  private activeRelayPlayer(teamId: number): string | null {
    const order = this.teamOrders[teamId] ?? [];
    if (!order.length) return null;
    const idx = (this.relayCursor[teamId] ?? 0) % order.length;
    return order[idx] ?? null;
  }

  private advanceRelay(teamId: number): void {
    const order = this.teamOrders[teamId] ?? [];
    if (!order.length) return;
    this.relayCursor[teamId] = ((this.relayCursor[teamId] ?? 0) + 1) % order.length;
  }

  private allPlayersWithStats(nowMono: number): Map<string, Player> {
    const out = new Map<string, Player>();
    for (const [pid, p] of this.players) {
      const st = this.typingStates.get(pid);
      if (!st) continue;
      const { wpm, accuracy, progress } = computeStats(st, this.paragraph.length, nowMono);
      out.set(pid, {
        ...p,
        wpm,
        accuracy,
        progress,
        typedChars: st.typedIndex,
        keystrokes: st.keystrokes,
        errors: st.errors,
      });
    }
    return out;
  }

  private decorateTeamsAndRelay(merged: Map<string, Player>): Player[] {
    const byTeam: Record<number, Player[]> = { 0: [], 1: [] };
    for (const p of merged.values()) {
      const tid = p.teamId === 0 || p.teamId === 1 ? p.teamId : 0;
      byTeam[tid]!.push(p);
    }
    for (const tid of [0, 1] as const) {
      byTeam[tid]!.sort(
        (a, b) =>
          b.progress - a.progress ||
          b.wpm - a.wpm ||
          b.typedChars - a.typedChars ||
          a.id.localeCompare(b.id)
      );
      byTeam[tid]!.forEach((pl, i) => {
        const active = this.relayMode && this.activeRelayPlayer(tid) === pl.id;
        merged.set(pl.id, { ...pl, teamRank: i + 1, relayActive: active });
      });
    }
    return rankedPlayers(merged);
  }

  private buildLiteBundle(nowMono: number): {
    pLite: { i: string; r: number; p: number; w: number }[];
    yMap: Record<string, { a: number; e: number; tc: number; t: number; tr: number; ra: boolean }>;
  } | null {
    if (!this.connections.size) return null;
    const merged = this.allPlayersWithStats(nowMono);
    const ranked = this.decorateTeamsAndRelay(merged);
    const pLite = ranked.map((x) => ({
      i: x.id,
      r: x.rank,
      p: x.progress,
      w: x.wpm,
    }));
    const yMap: Record<string, { a: number; e: number; tc: number; t: number; tr: number; ra: boolean }> = {};
    for (const x of ranked) {
      yMap[x.id] = {
        a: Math.round(x.accuracy * 10000) / 10000,
        e: x.errors,
        tc: x.typedChars,
        t: x.teamId,
        tr: x.teamRank,
        ra: x.relayActive,
      };
    }
    return { pLite, yMap };
  }

  private buildRoomMeta(nowMono: number): string {
    const merged = this.allPlayersWithStats(nowMono);
    const [, teamRankings] = this.teamPayloads(merged);
    const relay: Record<string, string | null> = {
      "0": this.relayMode ? this.activeRelayPlayer(0) : null,
      "1": this.relayMode ? this.activeRelayPlayer(1) : null,
    };
    return JSON.stringify({
      type: "room_meta",
      payload: {
        teams: this.teamPayloads(merged)[0],
        team_rankings: teamRankings,
        relay: { enabled: this.relayMode, active_player_by_team: relay },
      },
    });
  }

  private teamPayloads(merged: Map<string, Player>): [Record<string, unknown>[], Record<string, unknown>[]] {
    const teamsOut: Record<string, unknown>[] = [];
    for (const tid of [0, 1] as const) {
      const members = [...merged.values()].filter((p) => p.teamId === tid);
      if (!members.length) {
        teamsOut.push({
          id: tid,
          name: tid === 0 ? "Team A" : "Team B",
          score: 0,
          member_count: 0,
          teamwork_score: 0,
          consistency_score: 0,
          communication_efficiency_score: 0,
        });
        continue;
      }
      const progresses = members.map((p) => p.progress);
      const accs = members.map((p) => p.accuracy);
      const kss = members.map((p) => p.keystrokes);
      const ers = members.map((p) => p.errors);
      teamsOut.push({
        id: tid,
        name: tid === 0 ? "Team A" : "Team B",
        score: Math.round(teamAverageProgress(progresses) * 10000) / 10000,
        member_count: members.length,
        teamwork_score: Math.round(teamworkScore(progresses) * 10) / 10,
        consistency_score: Math.round(consistencyScore(accs) * 10) / 10,
        communication_efficiency_score: Math.round(
          communicationEfficiencyScore(kss, ers, this.relayPasses[tid] ?? 0, members.length) * 10
        ) / 10,
      });
    }
    const teamRankings = [...teamsOut].sort(
      (a, b) => (b.score as number) - (a.score as number) || (a.id as number) - (b.id as number)
    );
    return [teamsOut, teamRankings];
  }

  private ensureBroadcast(): void {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setInterval(() => {
      void this.flushLeaderboardAndMeta();
    }, this.manager.broadcastIntervalMs);
  }

  private async flushLeaderboardAndMeta(): Promise<void> {
    if (!this.connections.size) {
      if (this.broadcastTimer) {
        clearInterval(this.broadcastTimer);
        this.broadcastTimer = null;
      }
      void this.manager.maybeDropRoom(this.storageKey);
      return;
    }
    const nowMono = performance.now() / 1000;
    const bundle = this.buildLiteBundle(nowMono);
    if (!bundle) return;
    let metaMsg: string | null = null;
    if (this.metaDirty) {
      this.metaDirty = false;
      metaMsg = this.buildRoomMeta(nowMono);
    }
    const { paused, finished } = this.manager.logicalPlayFlags(this.logicalRoomId);
    for (const [pid, ws] of this.connections) {
      const y = bundle.yMap[pid];
      if (!y) continue;
      sendJson(ws, {
        type: "leaderboard",
        t: nowMono,
        p: bundle.pLite,
        y,
        paused,
        finished,
      });
    }
    if (metaMsg) this.sendToAll(metaMsg);
  }

  sendToAll(message: string): void {
    for (const ws of this.connections.values()) {
      if (isOpen(ws)) ws.send(message);
    }
  }

  sendToOthers(excludeId: string, message: string): void {
    for (const [pid, ws] of this.connections) {
      if (pid !== excludeId && isOpen(ws)) ws.send(message);
    }
  }

  async notifyRaceStarted(): Promise<void> {
    this.started = true;
    this.sendToAll(JSON.stringify({ type: "race_started" }));
  }

  async setSharedParagraph(text: string): Promise<void> {
    this.paragraph = text;
    this.metaDirty = true;
    await this.pushLeaderboardSnapshot();
  }

  async resetRaceSession(newParagraph: string): Promise<void> {
    this.paragraph = newParagraph;
    this.started = false;
    this.relayCursor = { 0: 0, 1: 0 };
    this.relayPasses = { 0: 0, 1: 0 };
    for (const pid of [...this.players.keys()]) {
      const p = this.players.get(pid)!;
      this.typingStates.set(pid, newTypingState());
      this.players.set(pid, {
        id: pid,
        name: p.name,
        teamId: p.teamId,
        teamRank: 0,
        relayActive: false,
        wpm: 0,
        accuracy: 1,
        progress: 0,
        typedChars: 0,
        keystrokes: 0,
        errors: 0,
        rank: 0,
      });
    }
    this.metaDirty = true;
    await this.pushLeaderboardSnapshot();
  }

  async pushLeaderboardSnapshot(): Promise<void> {
    if (!this.connections.size) return;
    this.metaDirty = true;
    await this.flushLeaderboardAndMeta();
  }

  async broadcastRaceFinishedSnapshot(): Promise<void> {
    if (!this.connections.size) return;
    const nowMono = performance.now() / 1000;
    const merged = this.allPlayersWithStats(nowMono);
    const ranked = this.decorateTeamsAndRelay(merged);
    const [teamsOut, teamRankings] = this.teamPayloads(merged);
    this.sendToAll(
      JSON.stringify({
        type: "race_finished",
        payload: { players: ranked, teams: teamsOut, team_rankings: teamRankings },
      })
    );
  }

  sendRaceFinishedTo(ws: WebSocket): void {
    const nowMono = performance.now() / 1000;
    const merged = this.allPlayersWithStats(nowMono);
    const ranked = this.decorateTeamsAndRelay(merged);
    const [teamsOut, teamRankings] = this.teamPayloads(merged);
    ws.send(
      JSON.stringify({
        type: "race_finished",
        payload: { players: ranked, teams: teamsOut, team_rankings: teamRankings },
      })
    );
  }

  join(ws: WebSocket, payload: JoinPayload): Player {
    const reconnectId =
      typeof payload.playerId === "string" && payload.playerId.trim()
        ? payload.playerId.trim()
        : "";
    if (reconnectId) {
      const reconnected = this.tryReconnect(ws, reconnectId);
      if (reconnected) return reconnected;
    }

    this.relayMode = this.manager.relayModeFor(this.logicalRoomId, payload.relay);
    const playerId = this.manager.newPlayerId();
    const teamId = this.pickTeam(payload.teamId);
    const player: Player = {
      id: playerId,
      name: (payload.name?.trim().slice(0, 48) || "Player"),
      teamId,
      teamRank: 0,
      relayActive: false,
      wpm: 0,
      accuracy: 1,
      progress: 0,
      typedChars: 0,
      keystrokes: 0,
      errors: 0,
      rank: 0,
    };
    this.players.set(playerId, player);
    this.typingStates.set(playerId, newTypingState());
    this.connections.set(playerId, ws);
    this.teamOrders[teamId]!.push(playerId);
    this.metaDirty = true;
    this.ensureBroadcast();
    this.sendToOthers(
      playerId,
      JSON.stringify({
        type: "player_joined",
        payload: { player: { id: player.id, name: player.name, team_id: player.teamId } },
      })
    );
    return player;
  }

  applyKey(playerId: string, char: string | null, backspace: boolean): void {
    if (this.manager.typingBlocked(this.logicalRoomId)) return;
    const st = this.typingStates.get(playerId);
    const p = this.players.get(playerId);
    if (!st || !p) return;
    if (this.relayMode && this.activeRelayPlayer(p.teamId) !== playerId) return;
    const nowMono = performance.now() / 1000;
    applyKeystroke(st, this.paragraph, { char, backspace, nowMono });
    if (this.relayMode) {
      const { progress } = computeStats(st, this.paragraph.length, nowMono);
      if (progress >= 0.999) this.advanceRelay(p.teamId);
    }
  }

  relayPass(playerId: string): boolean {
    if (this.manager.typingBlocked(this.logicalRoomId)) return false;
    const p = this.players.get(playerId);
    if (!p || !this.relayMode) return false;
    if (this.activeRelayPlayer(p.teamId) !== playerId) return false;
    this.relayPasses[p.teamId] = (this.relayPasses[p.teamId] ?? 0) + 1;
    this.advanceRelay(p.teamId);
    this.metaDirty = true;
    return true;
  }

  async removePlayer(playerId: string, reason: string): Promise<void> {
    const pending = this.removalTimers.get(playerId);
    if (pending) {
      clearTimeout(pending);
      this.removalTimers.delete(playerId);
    }
    if (!this.players.has(playerId) && !this.connections.has(playerId)) return;
    await this.manager.transferHostIfLeaving(this.logicalRoomId, playerId);
    const p = this.players.get(playerId);
    const teamId = p?.teamId ?? 0;
    const order = this.teamOrders[teamId] ?? [];
    const idx = order.indexOf(playerId);
    if (idx >= 0) {
      order.splice(idx, 1);
      const cur = this.relayCursor[teamId] ?? 0;
      if (order.length) {
        if (idx < cur) this.relayCursor[teamId] = Math.max(0, cur - 1);
        else if (idx === cur) this.relayCursor[teamId] = cur % order.length;
      } else {
        this.relayCursor[teamId] = 0;
      }
    }
    this.players.delete(playerId);
    this.typingStates.delete(playerId);
    this.connections.delete(playerId);
    this.metaDirty = true;
    const remaining = this.connections.size;
    if (remaining === 0) {
      if (this.broadcastTimer) {
        clearInterval(this.broadcastTimer);
        this.broadcastTimer = null;
      }
      await this.manager.maybeDropRoom(this.storageKey);
      return;
    }
    this.sendToAll(
      JSON.stringify({ type: "player_left", payload: { player_id: playerId, reason } })
    );
  }
}
