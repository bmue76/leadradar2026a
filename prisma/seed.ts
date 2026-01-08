import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { createHmac, randomBytes } from "node:crypto";

const PREFIX_LEN = 8;

function getMobileSecretOrNull(): string | null {
  const v = process.env.MOBILE_API_KEY_SECRET;
  if (!v) return null;
  const s = v.trim();
  if (s.length < 16) return null;
  return s;
}

function generateApiKeyToken(): string {
  // 32 bytes => ~43 chars base64url
  return randomBytes(32).toString("base64url");
}

function getPrefix(token: string): string {
  return token.slice(0, PREFIX_LEN);
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

  // Enforce canonical seed fields (update if they exist)
  const fields = [
    {
      key: "firstName",
      label: "First name",
      type: "TEXT" as const,
      required: true,
      isActive: true,
      sortOrder: 10,
      placeholder: null as string | null,
      helpText: null as string | null,
      config: null as unknown,
    },
    {
      key: "lastName",
      label: "Last name",
      type: "TEXT" as const,
      required: true,
      isActive: true,
      sortOrder: 20,
      placeholder: null as string | null,
      helpText: null as string | null,
      config: null as unknown,
    },
    {
      key: "email",
      label: "Email",
      type: "EMAIL" as const,
      required: false,
      isActive: true,
      sortOrder: 30,
      placeholder: null as string | null,
      helpText: null as string | null,
      config: null as unknown,
    },
    {
      key: "note",
      label: "Note",
      type: "TEXTAREA" as const,
      required: false,
      isActive: true,
      sortOrder: 40,
      placeholder: null as string | null,
      helpText: null as string | null,
      config: null as unknown,
    },
  ];

  await prisma.$transaction(
    fields.map((f) =>
      prisma.formField.upsert({
        where: { formId_key: { formId: args.formId, key: f.key } },
        update: {
          tenantId: args.tenantId,
          label: f.label,
          type: f.type,
          required: f.required,
          isActive: f.isActive,
          sortOrder: f.sortOrder,
          placeholder: f.placeholder,
          helpText: f.helpText,
          config: f.config ?? null,
        },
        create: {
          tenantId: args.tenantId,
          formId: args.formId,
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required,
          isActive: f.isActive,
          sortOrder: f.sortOrder,
          placeholder: f.placeholder,
          helpText: f.helpText,
          config: f.config ?? null,
        },
        select: { id: true },
      })
    )
  );
}

async function resetSeedMobileForTenant(args: {
  tenantId: string;
  tenantSlug: string;
  seedDeviceName: string;
  formIdToAssign: string;
}) {
  const secret = getMobileSecretOrNull();
  if (!secret) {
    console.warn(`[seed] MOBILE_API_KEY_SECRET missing/too short -> skipping mobile seed for tenant ${args.tenantSlug}`);
    return { apiKey: null as string | null };
  }

  // Remove previous seed device (+ its key) if present.
  const existing = await prisma.mobileDevice.findFirst({
    where: { tenantId: args.tenantId, name: args.seedDeviceName },
    select: { id: true, apiKeyId: true },
  });

  if (existing) {
    // Important order: delete assignments -> device -> apiKey (device has onDelete: Restrict)
    await prisma.$transaction([
      prisma.mobileDeviceForm.deleteMany({ where: { tenantId: args.tenantId, deviceId: existing.id } }),
      prisma.mobileDevice.delete({ where: { id: existing.id } }),
      prisma.mobileApiKey.delete({ where: { id: existing.apiKeyId } }),
    ]);
  }

  // Create new key (rotates on every seed run; raw key printed once)
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

  console.log(`[seed] Mobile API Key created for ${args.tenantSlug} (prefix ${created.prefix}) => x-api-key: ${token}`);
  return { apiKey: token };
}

async function upsertTenant(args: { id: string; slug: string; name: string; country: string }) {
  return prisma.tenant.upsert({
    where: { id: args.id },
    update: {
      slug: args.slug,
      name: args.name,
      country: args.country,
    },
    create: {
      id: args.id,
      slug: args.slug,
      name: args.name,
      country: args.country,
    },
    select: { id: true, slug: true, name: true, country: true },
  });
}

async function upsertUser(args: { email: string; tenantId: string; passwordHash: string }) {
  return prisma.user.upsert({
    where: { email: args.email },
    update: {
      tenantId: args.tenantId,
      role: "TENANT_OWNER",
      passwordHash: args.passwordHash,
      firstName: "Beat",
      lastName: "Müller",
      emailVerifiedAt: new Date(),
    },
    create: {
      email: args.email,
      tenantId: args.tenantId,
      role: "TENANT_OWNER",
      passwordHash: args.passwordHash,
      firstName: "Beat",
      lastName: "Müller",
      emailVerifiedAt: new Date(),
    },
    select: { id: true, email: true, tenantId: true },
  });
}

async function main() {
  const tenantDemo = await upsertTenant({ id: "tenant_demo", slug: "demo", name: "Demo AG", country: "CH" });
  const tenantAtlex = await upsertTenant({ id: "tenant_atlex", slug: "atlex", name: "Atlex GmbH", country: "CH" });

  const passwordHash = await hashPassword("Admin1234!");

  await upsertUser({ email: "admin@demo.ch", tenantId: tenantDemo.id, passwordHash });
  await upsertUser({ email: "admin@atlex.ch", tenantId: tenantAtlex.id, passwordHash });

  await ensureSeedForm({ tenantId: tenantDemo.id, formId: "form_demo_1", name: "Demo Lead Capture" });
  await ensureSeedForm({ tenantId: tenantAtlex.id, formId: "form_atlex_1", name: "Atlex Lead Capture" });

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
