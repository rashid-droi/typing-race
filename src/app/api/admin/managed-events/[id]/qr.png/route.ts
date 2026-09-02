import QRCode from "qrcode";
import { requireAdmin, AdminAuthError } from "@/lib/auth";
import { getManagedEventById, eventPublicUrls } from "@/lib/events";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await ctx.params;
    const row = await getManagedEventById(id, admin.companyId);
    if (!row) return Response.json({ detail: "event_not_found" }, { status: 404 });
    const { join_url } = eventPublicUrls(row.joinCode, row.roomId);
    const png = await QRCode.toBuffer(join_url, { type: "png" });
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png" },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}
