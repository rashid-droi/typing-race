import { getManagedEventByJoinCode, serializeEvent } from "@/lib/events";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const row = await getManagedEventByJoinCode(code);
  if (!row) return Response.json({ detail: "event_not_found" }, { status: 404 });
  if (row.status === "cancelled" || row.status === "archived") {
    return Response.json({ detail: "event_closed" }, { status: 410 });
  }
  const company = await prisma.company.findUnique({ where: { id: row.companyId } });
  const base = serializeEvent(row, { company_slug: company?.slug ?? "" });
  return Response.json({
    join_code: base.join_code,
    room_id: base.room_id,
    name: base.name,
    description: base.description,
    status: base.status,
    text_line_count: base.text_line_count,
    relay_mode: base.relay_mode,
    theme_primary: base.theme_primary,
    join_url: base.join_url,
    room_url: base.room_url,
  });
}
