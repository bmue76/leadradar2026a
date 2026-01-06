import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";

async function main() {
  // Tenants
  const tenantDemo = await prisma.tenant.upsert({
    where: { id: "tenant_demo" },
    update: {
      slug: "demo",
      name: "Demo AG",
      country: "CH",
    },
    create: {
      id: "tenant_demo",
      slug: "demo",
      name: "Demo AG",
      country: "CH",
    },
    select: { id: true, slug: true, name: true, country: true },
  });

  const tenantAtlex = await prisma.tenant.upsert({
    where: { id: "tenant_atlex" },
    update: {
      slug: "atlex",
      name: "Atlex GmbH",
      country: "CH",
    },
    create: {
      id: "tenant_atlex",
      slug: "atlex",
      name: "Atlex GmbH",
      country: "CH",
    },
    select: { id: true, slug: true, name: true, country: true },
  });

  const passwordHash = await hashPassword("Admin1234!");

  // Users
  await prisma.user.upsert({
    where: { email: "admin@demo.ch" },
    update: {
      tenantId: tenantDemo.id,
      role: "TENANT_OWNER",
      passwordHash,
      firstName: "Beat",
      lastName: "Müller",
      emailVerifiedAt: new Date(),
    },
    create: {
      email: "admin@demo.ch",
      tenantId: tenantDemo.id,
      role: "TENANT_OWNER",
      passwordHash,
      firstName: "Beat",
      lastName: "Müller",
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@atlex.ch" },
    update: {
      tenantId: tenantAtlex.id,
      role: "TENANT_OWNER",
      passwordHash,
      firstName: "Beat",
      lastName: "Müller",
      emailVerifiedAt: new Date(),
    },
    create: {
      email: "admin@atlex.ch",
      tenantId: tenantAtlex.id,
      role: "TENANT_OWNER",
      passwordHash,
      firstName: "Beat",
      lastName: "Müller",
      emailVerifiedAt: new Date(),
    },
  });

  console.log("Seed done:", { tenantDemo, tenantAtlex });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
