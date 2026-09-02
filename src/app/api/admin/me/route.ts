import { requireAdmin, AdminAuthError } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    return Response.json({ company: admin.companySlug, email: admin.email });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}
