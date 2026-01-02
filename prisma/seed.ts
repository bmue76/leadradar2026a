import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  // IMPORTANT: import AFTER dotenv, so prisma picks up DATABASE_URL/POSTGRES_URL correctly
  const { prisma } = await import("../src/lib/prisma");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "atlex" },
    update: { name: "Atlex GmbH" },
    create: { slug: "atlex", name: "Atlex GmbH" },
  });

  console.log("seeded tenant:", tenant);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
