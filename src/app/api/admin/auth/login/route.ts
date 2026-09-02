import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { addAuditEvent, createAdminSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    company_slug?: string;
    email?: string;
    password?: string;
  };
  const slug = (body.company_slug ?? "").trim().toLowerCase();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) {
    return Response.json({ detail: "unknown_company" }, { status: 401 });
  }
  const user = await prisma.adminUser.findFirst({
    where: { companyId: company.id, email },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return Response.json({ detail: "invalid_credentials" }, { status: 401 });
  }

  const access_token = await createAdminSession(user.id);
  await addAuditEvent({
    companyId: company.id,
    type: "auth.company_login",
    actor: email,
    meta: { company: slug },
  });

  return Response.json({
    access_token,
    token_type: "bearer",
    company_slug: slug,
    email,
  });
}
