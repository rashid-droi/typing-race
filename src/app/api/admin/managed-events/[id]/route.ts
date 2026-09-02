import { EventStatus } from "@prisma/client";
import { requireAdmin, AdminAuthError } from "@/lib/auth";
import {
  getManagedEventById,
  serializeEvent,
  updateManagedEventStatus,
} from "@/lib/events";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await ctx.params;
    const row = await getManagedEventById(id, admin.companyId);
    if (!row) return Response.json({ detail: "event_not_found" }, { status: 404 });
    return Response.json(serializeEvent(row, { company_slug: admin.companySlug }));
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await ctx.params;
    const body = await request.json();
    const row = await updateManagedEventStatus(
      id,
      admin.companyId,
      body.status as EventStatus,
      admin.email
    );
    return Response.json(serializeEvent(row, { company_slug: admin.companySlug }));
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}
