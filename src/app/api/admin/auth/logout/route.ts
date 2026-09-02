import { revokeAdminToken, requireAdmin } from "@/lib/auth";
import { addAuditEvent } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    await revokeAdminToken(request.headers.get("authorization"));
    await addAuditEvent({
      companyId: admin.companyId,
      type: "auth.company_logout",
      actor: admin.email,
      meta: { company: admin.companySlug },
    });
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ detail: "invalid_or_expired_token" }, { status: 401 });
  }
}
