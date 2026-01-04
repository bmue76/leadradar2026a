import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: "tenant_demo" },
    update: {
      name: "Demo AG",
      country: "CH",
    },
    create: {
      id: "tenant_demo",
      name: "Demo AG",
      country: "CH",
    },
    select: { id: true, name: true, country: true },
  });

  const passwordHash = await hashPassword("Admin1234!");

  await prisma.user.upsert({
    where: { email: "admin@demo.ch" },
    update: {
      tenantId: tenant.id,
      role: "TENANT_OWNER",
      passwordHash,
      firstName: "Beat",
      lastName: "Müller",
      emailVerifiedAt: new Date(),
    },
    create: {
      email: "admin@demo.ch",
      tenantId: tenant.id,
      role: "TENANT_OWNER",
      passwordHash,
      firstName: "Beat",
      lastName: "Müller",
      emailVerifiedAt: new Date(),
    },
  });

  console.log("Seed done:", tenant);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
