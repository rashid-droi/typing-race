const ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidRoomId(id: string): boolean {
  return ROOM_ID_RE.test(id.trim());
}

export function generateRoomId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let suffix = "";
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  return `race-${suffix}`;
}

export function joinUrlForRoom(roomId: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/?room=${encodeURIComponent(roomId.trim())}`;
}
