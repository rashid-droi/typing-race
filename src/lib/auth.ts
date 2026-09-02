import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex") + randomBytes(32).toString("hex");
  await prisma.adminSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return token;
}

export type AdminContext = {
  userId: string;
  email: string;
  companySlug: string;
  companyId: string;
};

export async function validateAdminToken(
  authorization: string | null
): Promise<AdminContext | null> {
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  const row = await prisma.adminSession.findFirst({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: { include: { company: true } } },
  });
  if (!row) return null;
  return {
    userId: row.userId,
    email: row.user.email,
    companySlug: row.user.company.slug,
    companyId: row.user.companyId,
  };
}

export async function revokeAdminToken(authorization: string | null): Promise<void> {
  if (!authorization?.toLowerCase().startsWith("bearer ")) return;
  const token = authorization.slice(7).trim();
  await prisma.adminSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function requireAdmin(request: Request): Promise<AdminContext> {
  const admin = await validateAdminToken(request.headers.get("authorization"));
  if (!admin) throw new AdminAuthError("invalid_or_expired_token");
  return admin;
}

export class AdminAuthError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export async function addAuditEvent(opts: {
  companyId?: string;
  type: string;
  actor: string;
  meta?: Record<string, unknown>;
}) {
  return prisma.auditEvent.create({
    data: {
      companyId: opts.companyId,
      type: opts.type,
      actor: opts.actor,
      meta: (opts.meta ?? {}) as Prisma.InputJsonValue,
    },
  });
}
