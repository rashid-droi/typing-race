import { EventStatus } from "@prisma/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth";
import {
  getManagedEventById,
  serializeEvent,
  updateManagedEventStatus,
} from "@/lib/events";
import { getRoomManager } from "../../../../../../../server/game/manager";

type Ctx = { params: Promise<{ id: string }> };

const ACTION_STATUS: Partial<
  Record<
    "open_lobby" | "start" | "pause" | "resume" | "finish" | "restart",
    EventStatus
  >
> = {
  open_lobby: EventStatus.lobby_open,
  start: EventStatus.in_progress,
  finish: EventStatus.finished,
  restart: EventStatus.in_progress,
};

export async function POST(request: Request, ctx: Ctx) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await ctx.params;
    const body = await request.json();
    const row = await getManagedEventById(id, admin.companyId);
    if (!row) return Response.json({ detail: "event_not_found" }, { status: 404 });

    const manager = getRoomManager();
    manager.ensureEventRoomConfig(row.roomId, {
      textLineCount: row.textLineCount,
      relayMode: row.relayMode,
    });
    manager.claimAdminHost(row.roomId);

    if (body.text_line_count != null) {
      const lineResult = manager.adminApplyTextLineCount(row.roomId, body.text_line_count);
      if (lineResult.ok && lineResult.newText) {
        await manager.pushParagraphToAllShards(row.roomId, lineResult.newText);
        manager.broadcastToLogical(
          row.roomId,
          JSON.stringify({
            type: "room_settings_sync",
            payload: { text_line_count: lineResult.count, text: lineResult.newText },
          })
        );
      }
    }

    const action = body.action as
      | "open_lobby"
      | "start"
      | "pause"
      | "resume"
      | "finish"
      | "restart"
      | undefined;

    if (!action) {
      return Response.json({ detail: "action_required" }, { status: 400 });
    }

    const result = await manager.adminGameAction(row.roomId, action);
    if (!result.ok) {
      return Response.json({ detail: result.detail ?? "action_rejected" }, { status: 409 });
    }

    const nextStatus = ACTION_STATUS[action];
    let eventRow = row;
    if (nextStatus && eventRow.status !== nextStatus) {
      eventRow = await updateManagedEventStatus(
        id,
        admin.companyId,
        nextStatus,
        admin.email
      );
    }

    const live = manager.getLogicalRoomLiveState(row.roomId);
    return Response.json({
      ok: true,
      event: serializeEvent(eventRow, { company_slug: admin.companySlug }),
      live,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}
