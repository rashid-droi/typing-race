import { requireAdmin, AdminAuthError } from "@/lib/auth";
import { getManagedEventById, serializeEvent } from "@/lib/events";
import { getRoomManager } from "../../../../../../../server/game/manager";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await ctx.params;
    const row = await getManagedEventById(id, admin.companyId);
    if (!row) return Response.json({ detail: "event_not_found" }, { status: 404 });

    const manager = getRoomManager();
    manager.ensureEventRoomConfig(row.roomId, {
      textLineCount: row.textLineCount,
      relayMode: row.relayMode,
    });
    manager.claimAdminHost(row.roomId);

    const live = manager.getLogicalRoomLiveState(row.roomId);
    return Response.json({
      event: serializeEvent(row, { company_slug: admin.companySlug }),
      live,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}
