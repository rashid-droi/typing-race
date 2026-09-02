import { requireAdmin, AdminAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Number(searchParams.get("limit") ?? 100));
    const rows = await prisma.auditEvent.findMany({
      where: { companyId: admin.companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return Response.json(
      rows.map((r) => ({
        id: r.id,
        ts: r.createdAt.getTime() / 1000,
        type: r.type,
        actor: r.actor,
        meta: r.meta,
      }))
    );
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
    const row = await prisma.auditEvent.create({
      data: {
        companyId: admin.companyId,
        type: body.type,
        actor: admin.email,
        meta: body.meta ?? {},
      },
    });
    return Response.json({
      id: row.id,
      ts: row.createdAt.getTime() / 1000,
      type: row.type,
      actor: row.actor,
      meta: row.meta,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}
