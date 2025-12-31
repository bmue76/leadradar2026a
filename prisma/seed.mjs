/**
 * LeadRadar2026A Seed (idempotent)
 *
 * Prisma 7 note:
 * - PrismaClient must be constructed with either `adapter` or `accelerateUrl`.
 * - We use PostgreSQL driver adapter (@prisma/adapter-pg) for local dev.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("[seed] DATABASE_URL is missing. Check .env.local / prisma.config.ts setup.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1) Tenant: Atlex GmbH (idempotent)
  const tenant = await prisma.tenant.upsert({
    where: { slug: "atlex" },
    update: { name: "Atlex GmbH" },
    create: { slug: "atlex", name: "Atlex GmbH" },
  });

  // 2) Minimal demo user (idempotent)
  await prisma.user.upsert({
    where: { email: "beat@atlex.ch" },
    update: { tenantId: tenant.id, role: "TENANT_OWNER" },
    create: { tenantId: tenant.id, email: "beat@atlex.ch", role: "TENANT_OWNER" },
  });

  // 3) Demo Form "Kontakt" (idempotent)
  const existingForm = await prisma.form.findFirst({
    where: { tenantId: tenant.id, name: "Kontakt" },
    select: { id: true },
  });

  const form =
    existingForm ??
    (await prisma.form.create({
      data: {
        tenantId: tenant.id,
        name: "Kontakt",
        description: "Demo-Formular für Tests (TP 1.x/2.x).",
        status: "ACTIVE",
        config: { version: 1 },
      },
      select: { id: true },
    }));

  // 4) Fields (createMany + skipDuplicates => no duplicates on re-run)
  await prisma.formField.createMany({
    data: [
      {
        tenantId: tenant.id,
        formId: form.id,
        key: "firstName",
        label: "Vorname",
        type: "TEXT",
        required: false,
        isActive: true,
        sortOrder: 10,
        placeholder: "Vorname",
      },
      {
        tenantId: tenant.id,
        formId: form.id,
        key: "lastName",
        label: "Nachname",
        type: "TEXT",
        required: false,
        isActive: true,
        sortOrder: 20,
        placeholder: "Nachname",
      },
      {
        tenantId: tenant.id,
        formId: form.id,
        key: "email",
        label: "E-Mail",
        type: "EMAIL",
        required: false,
        isActive: true,
        sortOrder: 30,
        placeholder: "name@firma.ch",
      },
      {
        tenantId: tenant.id,
        formId: form.id,
        key: "company",
        label: "Firma",
        type: "TEXT",
        required: false,
        isActive: true,
        sortOrder: 40,
        placeholder: "Firmenname",
      },
      {
        tenantId: tenant.id,
        formId: form.id,
        key: "phone",
        label: "Telefon",
        type: "PHONE",
        required: false,
        isActive: true,
        sortOrder: 50,
        placeholder: "+41 ...",
      },
      {
        tenantId: tenant.id,
        formId: form.id,
        key: "notes",
        label: "Notizen",
        type: "TEXTAREA",
        required: false,
        isActive: true,
        sortOrder: 60,
        placeholder: "Kurz notieren…",
      },
    ],
    skipDuplicates: true,
  });

  console.log(`[seed] tenant=${tenant.slug} (${tenant.id})`);
  console.log(`[seed] form="Kontakt" (${form.id}) ensured`);
  console.log(`[seed] fields ensured (skipDuplicates)`);
}

main()
  .catch((e) => {
    console.error("[seed] failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

