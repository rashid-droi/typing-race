import QRCode from "qrcode";
import { EventStatus } from "@prisma/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createManagedEvent,
  listManagedEvents,
  serializeEvent,
} from "@/lib/events";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Number(searchParams.get("limit") ?? 100));
    const rows = await listManagedEvents(admin.companyId, limit);
    return Response.json(rows.map((r) => serializeEvent(r, { company_slug: admin.companySlug })));
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const startsAt =
      body.starts_at != null ? new Date(Number(body.starts_at) * 1000) : null;
    const endsAt = body.ends_at != null ? new Date(Number(body.ends_at) * 1000) : null;
    const row = await createManagedEvent({
      companyId: admin.companyId,
      actor: admin.email,
      name: body.name,
      description: body.description,
      roomId: body.room_id,
      joinCode: body.join_code,
      status: (body.status as EventStatus) ?? EventStatus.scheduled,
      startsAt,
      endsAt,
      timezone: body.timezone,
      maxPlayers: body.max_players,
      textLineCount: body.text_line_count,
      relayMode: body.relay_mode,
      themePrimary: body.theme_primary,
      publicWall: body.public_wall,
    });
    return Response.json(serializeEvent(row, { company_slug: admin.companySlug }));
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    if (e instanceof Error && e.message.startsWith("name_")) {
      return Response.json({ detail: e.message }, { status: 400 });
    }
    throw e;
  }
}
