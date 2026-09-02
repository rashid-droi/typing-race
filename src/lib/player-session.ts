export type StoredPlayerSession = {
  roomId: string;
  playerId: string;
  playerName: string;
  teamId: number;
  relayMode: boolean;
};

const KEY = "typing-race-player-session";

export function savePlayerSession(session: StoredPlayerSession): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function loadPlayerSession(): StoredPlayerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredPlayerSession;
    if (!data.roomId || !data.playerId || !data.playerName) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearPlayerSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}
