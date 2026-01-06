import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { createHmac, randomBytes } from "node:crypto";

function requireMobileSecretOrNull(): string | null {
  const v = process.env.MOBILE_API_KEY_SECRET;
  if (!v || v.trim().length < 16) return null;
  return v;
}

function generateApiKeyToken(): string {
  return randomBytes(32).toString("base64url");
}

function getPrefix(token: string): string {
  return token.slice(0, 8);
}

function hashApiKey(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

async function ensureSeedForm(args: { tenantId: string; formId: string; name: string }) {
  await prisma.form.upsert({
    where: { id: args.formId },
    update: {
      tenantId: args.tenantId,
      name: args.name,
      description: "Seed form for Mobile API tests (TP 2.5).",
      status: "ACTIVE",
    },
    create: {
      id: args.formId,
      tenantId: args.tenantId,
      name: args.name,
      description: "Seed form for Mobile API tests (TP 2.5).",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  // A few basic fields (idempotent via createMany + skipDuplicates on @@unique([formId, key]))
  await prisma.formField.createMany({
    data: [
      {
        tenantId: args.tenantId,
        formId: args.formId,
        key: "firstName",
        label: "First name",
        type: "TEXT",
        required: true,
        sortOrder: 10,
        isActive: true,
      },
      {
        tenantId: args.tenantId,
        formId: args.formId,
        key: "lastName",
        label: "Last name",
        type: "TEXT",
        required: true,
        sortOrder: 20,
        isActive: true,
      },
      {
        tenantId: args.tenantId,
        formId: args.formId,
        key: "email",
        label: "Email",
        type: "EMAIL",
        required: false,
        sortOrder: 30,
        isActive: true,
      },
      {
        tenantId: args.tenantId,
        formId: args.formId,
        key: "note",
        label: "Note",
        type: "TEXTAREA",
        required: false,
        sortOrder: 40,
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });
}

async function resetSeedMobileForTenant(args: {
  tenantId: string;
  tenantSlug: string;
  seedDeviceName: string;
  formIdToAssign: string;
}) {
  const secret = requireMobileSecretOrNull();
  if (!secret) {
    console.warn(
      `[seed] MOBILE_API_KEY_SECRET missing/too short -> skipping mobile seed for tenant ${args.tenantSlug}`
    );
    return { apiKey: null as string | null };
  }

  // Remove previous seed device (+ its key) if present.
  const existing = await prisma.mobileDevice.findFirst({
    where: { tenantId: args.tenantId, name: args.seedDeviceName },
    select: { id: true, apiKeyId: true },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.mobileDeviceForm.deleteMany({
        where: { tenantId: args.tenantId, deviceId: existing.id },
      }),
      prisma.mobileDevice.delete({
        where: { id: existing.id },
      }),
      prisma.mobileApiKey.delete({
        where: { id: existing.apiKeyId },
      }),
    ]);
  }

  const token = generateApiKeyToken();
  const prefix = getPrefix(token);
  const keyHash = hashApiKey(token, secret);

  const created = await prisma.$transaction(async (tx) => {
    const key = await tx.mobileApiKey.create({
      data: {
        tenantId: args.tenantId,
        name: `Seed Key (${args.tenantSlug})`,
        prefix,
        keyHash,
        status: "ACTIVE",
      },
      select: { id: true, prefix: true },
    });

    const device = await tx.mobileDevice.create({
      data: {
        tenantId: args.tenantId,
        name: args.seedDeviceName,
        apiKeyId: key.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    await tx.mobileDeviceForm.create({
      data: {
        tenantId: args.tenantId,
        deviceId: device.id,
        formId: args.formIdToAssign,
      },
      select: { tenantId: true },
    });

    return { apiKeyId: key.id, prefix: key.prefix, deviceId: device.id };
  });

  console.log(
    `[seed] Mobile API Key created for ${args.tenantSlug} (prefix ${created.prefix}) => x-api-key: ${token}`
  );

  return { apiKey: token };
}

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

  // Seed forms for curl-proof and device assignments
  await ensureSeedForm({
    tenantId: tenantDemo.id,
    formId: "form_demo_1",
    name: "Demo Lead Capture",
  });

  await ensureSeedForm({
    tenantId: tenantAtlex.id,
    formId: "form_atlex_1",
    name: "Atlex Lead Capture",
  });

  // Seed mobile device + api key + assignment (DEV output only)
  await resetSeedMobileForTenant({
    tenantId: tenantDemo.id,
    tenantSlug: "demo",
    seedDeviceName: "Seed Device (demo)",
    formIdToAssign: "form_demo_1",
  });

  await resetSeedMobileForTenant({
    tenantId: tenantAtlex.id,
    tenantSlug: "atlex",
    seedDeviceName: "Seed Device (atlex)",
    formIdToAssign: "form_atlex_1",
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
