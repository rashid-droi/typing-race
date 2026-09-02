import { EventStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { addAuditEvent } from "./auth";
import { ALLOWED_TEXT_LINE_COUNTS, normalizeTextLineCount } from "../../server/game/typing-engine";

const JOIN_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function slugRoomId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "race";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`.slice(0, 64);
}

async function uniqueJoinCode(): Promise<string> {
  for (let i = 0; i < 32; i++) {
    let code = "";
    for (let j = 0; j < 6; j++) {
      code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
    }
    const exists = await prisma.managedEvent.findUnique({ where: { joinCode: code } });
    if (!exists) return code;
  }
  throw new Error("could_not_allocate_join_code");
}

export function eventPublicUrls(joinCode: string, roomId: string) {
  const base = (process.env.APP_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    join_url: `${base}/?event=${encodeURIComponent(joinCode)}`,
    room_url: `${base}/?room=${encodeURIComponent(roomId)}`,
  };
}

export function serializeEvent(
  row: Prisma.ManagedEventGetPayload<object>,
  extra?: Record<string, unknown>
) {
  const urls = eventPublicUrls(row.joinCode, row.roomId);
  return {
    id: row.id,
    company_slug: row.companyId,
    name: row.name,
    description: row.description,
    join_code: row.joinCode,
    room_id: row.roomId,
    status: row.status,
    starts_at: row.startsAt ? row.startsAt.getTime() / 1000 : null,
    ends_at: row.endsAt ? row.endsAt.getTime() / 1000 : null,
    timezone: row.timezone,
    max_players: row.maxPlayers,
    text_line_count: row.textLineCount,
    relay_mode: row.relayMode,
    theme_primary: row.themePrimary,
    public_wall: row.publicWall,
    created_at: row.createdAt.getTime() / 1000,
    updated_at: row.updatedAt.getTime() / 1000,
    join_url: urls.join_url,
    room_url: urls.room_url,
    qr_url: `/api/admin/managed-events/${row.id}/qr.png`,
    ...extra,
  };
}

export async function createManagedEvent(opts: {
  companyId: string;
  actor: string;
  name: string;
  description?: string;
  roomId?: string;
  joinCode?: string;
  status?: EventStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;
  timezone?: string;
  maxPlayers?: number;
  textLineCount?: number;
  relayMode?: boolean;
  themePrimary?: string;
  publicWall?: boolean;
}) {
  const name = opts.name.trim();
  if (!name) throw new Error("name_required");
  const roomId = (opts.roomId ?? slugRoomId(name)).trim();
  if (!ROOM_ID_RE.test(roomId)) throw new Error("invalid_room_id");
  const lineCount = normalizeTextLineCount(opts.textLineCount ?? 1);
  if (!ALLOWED_TEXT_LINE_COUNTS.includes(lineCount as (typeof ALLOWED_TEXT_LINE_COUNTS)[number])) {
    throw new Error("invalid_text_line_count");
  }
  const joinCode = (opts.joinCode ?? (await uniqueJoinCode())).trim().toUpperCase();
  const row = await prisma.managedEvent.create({
    data: {
      companyId: opts.companyId,
      name,
      description: opts.description?.trim() ?? "",
      joinCode,
      roomId,
      status: opts.status ?? EventStatus.scheduled,
      startsAt: opts.startsAt ?? null,
      endsAt: opts.endsAt ?? null,
      timezone: opts.timezone ?? "UTC",
      maxPlayers: Math.max(2, Math.min(10_000, opts.maxPlayers ?? 500)),
      textLineCount: lineCount,
      relayMode: Boolean(opts.relayMode),
      themePrimary: opts.themePrimary ?? "#7c3aed",
      publicWall: Boolean(opts.publicWall),
    },
  });
  await addAuditEvent({
    companyId: opts.companyId,
    type: "event.created",
    actor: opts.actor,
    meta: { event_id: row.id, join_code: row.joinCode, room_id: row.roomId },
  });
  return row;
}

export async function listManagedEvents(companyId: string, limit = 100) {
  return prisma.managedEvent.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getManagedEventById(id: string, companyId: string) {
  return prisma.managedEvent.findFirst({ where: { id, companyId } });
}

export async function getManagedEventByJoinCode(joinCode: string) {
  return prisma.managedEvent.findUnique({
    where: { joinCode: joinCode.trim().toUpperCase() },
  });
}

export async function updateManagedEventStatus(
  id: string,
  companyId: string,
  status: EventStatus,
  actor: string
) {
  const row = await prisma.managedEvent.update({
    where: { id, companyId },
    data: { status },
  });
  await addAuditEvent({
    companyId,
    type: "event.status_changed",
    actor,
    meta: { event_id: id, status },
  });
  return row;
}
