import * as path from "node:path";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { fileExists, putFileFromLocalPath } from "../src/lib/storage";

const BRANDING_ROOT_DIR = ".tmp_branding";

// Seed asset (place your Atlex logo here)
const ATLEX_LOGO_FILENAME = "atlex-logo.png";
const ATLEX_LOGO_SOURCE_ABS = path.join(process.cwd(), "prisma", "seed_assets", ATLEX_LOGO_FILENAME);

function mimeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function seedTenantLogoDemo(tenantId: string): Promise<void> {
  const exists = await fileExists(ATLEX_LOGO_SOURCE_ABS);
  if (!exists) {
    console.warn(
      `[seed] Tenant logo not seeded: missing file "${ATLEX_LOGO_SOURCE_ABS}". ` +
        `Add the Atlex logo as prisma/seed_assets/${ATLEX_LOGO_FILENAME} (png/jpg/webp).`,
    );
    return;
  }

  const ext = path.extname(ATLEX_LOGO_FILENAME).toLowerCase() || ".png";
  const relativeKey = `tenants/${tenantId}/branding/logo-atlex${ext}`;

  const stored = await putFileFromLocalPath({
    rootDirName: BRANDING_ROOT_DIR,
    relativeKey,
    sourceAbsPath: ATLEX_LOGO_SOURCE_ABS,
  });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      logoKey: relativeKey,
      logoMime: mimeFromFilename(ATLEX_LOGO_FILENAME),
      logoSizeBytes: stored.sizeBytes,
      logoOriginalName: ATLEX_LOGO_FILENAME,
      logoUpdatedAt: new Date(),
      logoWidth: null,
      logoHeight: null,
    },
    select: { id: true },
  });

  console.log(`[seed] Tenant logo stored: ${relativeKey} (${stored.sizeBytes} bytes)`);
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

  await seedTenantLogoDemo(tenant.id);

  console.log("Seed done:", tenant);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
