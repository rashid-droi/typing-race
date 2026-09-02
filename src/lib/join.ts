import { isValidRoomId } from "./roomId";

export type ResolvedJoin = {
  roomId: string;
  eventName?: string;
  relayMode?: boolean;
  joinCode?: string;
};

/** Resolve an event join code (JZZWV8) or raw room id (test-abc123) to a WebSocket room. */
export async function resolveJoinTarget(input: string): Promise<ResolvedJoin> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Enter your event code or room ID");
  }

  const maybeJoinCode = /^[A-Za-z0-9]{4,8}$/.test(trimmed);

  if (maybeJoinCode) {
    const r = await fetch(`/api/public/events/${encodeURIComponent(trimmed.toUpperCase())}`);
    if (r.ok) {
      const data = (await r.json()) as {
        room_id: string;
        name: string;
        relay_mode?: boolean;
        join_code: string;
      };
      return {
        roomId: data.room_id,
        eventName: data.name,
        relayMode: Boolean(data.relay_mode),
        joinCode: data.join_code,
      };
    }
    if (r.status === 410) {
      throw new Error("This event is closed");
    }
  }

  if (isValidRoomId(trimmed)) {
    return { roomId: trimmed };
  }

  throw new Error(
    maybeJoinCode
      ? "Event code not found — check the code or ask your organizer"
      : "Invalid code — use the 6-character event code or room ID from your organizer"
  );
}
