const ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Matches backend `ws_room._ROOM_ID_RE`. */
export function isValidRoomId(id: string): boolean {
  return ROOM_ID_RE.test(id.trim());
}

/** Short, URL-safe id for hosts to share (e.g. `race-k7m2xq`). */
export function generateRoomId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz23456789";
  let suffix = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) {
    suffix += alphabet[b % alphabet.length]!;
  }
  return `race-${suffix}`;
}

export function joinUrlForRoom(roomId: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const id = roomId.trim();
  if (!id || !base) return "";
  return `${base}/?room=${encodeURIComponent(id)}`;
}

export function joinUrlForEventCode(joinCode: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const code = joinCode.trim().toUpperCase();
  if (!code || !base) return "";
  return `${base}/?event=${encodeURIComponent(code)}`;
}
