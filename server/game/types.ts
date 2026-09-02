import type { WebSocket } from "ws";

export type Player = {
  id: string;
  name: string;
  teamId: number;
  teamRank: number;
  relayActive: boolean;
  wpm: number;
  accuracy: number;
  progress: number;
  typedChars: number;
  keystrokes: number;
  errors: number;
  rank: number;
};

export type JoinPayload = {
  name?: string;
  teamId?: number | null;
  relay?: boolean | null;
  host?: boolean | null;
  /** Reconnect after refresh — keep progress if still in room */
  playerId?: string | null;
};

export type ClientMessage = {
  type: string;
  payload?: Record<string, unknown>;
};

export const ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function isOpen(ws: WebSocket): boolean {
  return ws.readyState === ws.OPEN;
}

export function sendJson(ws: WebSocket, data: unknown): void {
  if (isOpen(ws)) ws.send(JSON.stringify(data));
}
