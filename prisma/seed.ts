import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const slug = process.env.ADMIN_COMPANY_SLUG ?? "acme";
  const email = process.env.ADMIN_EMAIL ?? "admin@typingrace.local";
  const password = process.env.ADMIN_PASSWORD ?? "changeme";

  const company = await prisma.company.upsert({
    where: { slug },
    update: { name: "Acme Corp" },
    create: { slug, name: "Acme Corp" },
  });

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.upsert({
    where: { companyId_email: { companyId: company.id, email } },
    update: { passwordHash },
    create: {
      companyId: company.id,
      email,
      passwordHash,
      role: "company_admin",
    },
  });

  console.log("Seeded company:", slug, "admin:", email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
