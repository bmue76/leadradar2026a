import * as path from "node:path";
import { promises as fsp } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { putBinaryFile } from "../src/lib/storage";

const BRANDING_ROOT_DIR = ".tmp_branding";

async function seedDemoLogo(tenantId: string) {
  const assetAbs = path.join(process.cwd(), "prisma", "seed_assets", "atlex-logo.png");
  try {
    const buf = await fsp.readFile(assetAbs);
    const key = `tenants/${tenantId}/branding/logo-seed.png`;

    await putBinaryFile({
      rootDirName: BRANDING_ROOT_DIR,
      relativeKey: key,
      data: new Uint8Array(buf),
    });

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        logoKey: key,
        logoMime: "image/png",
        logoSizeBytes: buf.length,
        logoOriginalName: "atlex-logo.png",
        logoUpdatedAt: new Date(),
        logoWidth: null,
        logoHeight: null,
      },
    });

    // eslint-disable-next-line no-console
    console.log("Seed demo logo:", { tenantId, key, bytes: buf.length });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("Seed demo logo skipped:", (e as Error)?.message ?? e);
  }
}

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

  await seedDemoLogo(tenant.id);

  // eslint-disable-next-line no-console
  console.log("Seed done:", tenant);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
