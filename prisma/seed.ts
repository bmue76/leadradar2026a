/**
 * LeadRadar2026A — DEV Seed (safe + idempotent-ish)
 *
 * IMPORTANT:
 * This repo uses prisma.config.ts (Prisma v7 “config-driven” setup).
 * In driver-adapter mode, PrismaClient expects { adapter } (NOT datasources/datasourceUrl).
 */

import { Prisma, PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function envFirst(names: string[]): string {
  for (const n of names) {
    const v = env(n, "");
    if (v) return v;
  }
  return "";
}

function hasStrongSecret(s: string): boolean {
  return s.trim().length >= 16;
}

function hmacSha256Hex(secret: string, token: string): string {
  return crypto.createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

function randomToken(): string {
  return `lrk_${crypto.randomBytes(24).toString("hex")}`;
}

function asInputJson(v: unknown): Prisma.InputJsonValue {
  return v as Prisma.InputJsonValue;
}

type SeedDb = {
  prisma: PrismaClient;
  close: () => Promise<void>;
};

async function createSeedDb(): Promise<SeedDb> {
  const dbUrl = envFirst([
    "DATABASE_URL",
    "PRISMA_DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "NEON_DATABASE_URL",
  ]);

  if (!dbUrl) {
    console.error(
      "[seed] Missing DB url. Set DATABASE_URL (recommended) or one of: PRISMA_DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL."
    );
    process.exit(1);
  }

  // Preferred (your setup): Driver Adapter (Postgres)
  try {
    const adapterMod = await import("@prisma/adapter-pg");
    const pgMod = await import("pg");

    const Pool = (pgMod as unknown as { Pool: typeof import("pg").Pool }).Pool;
    const PrismaPg = (adapterMod as unknown as { PrismaPg: new (pool: import("pg").Pool) => unknown }).PrismaPg;

    const pool = new Pool({ connectionString: dbUrl });
    const adapter = new PrismaPg(pool);

    const prisma = new PrismaClient({ adapter } as unknown as Prisma.PrismaClientOptions);

    return {
      prisma,
      close: async () => {
        await prisma.$disconnect();
        await pool.end();
      },
    };
  } catch (e) {
    // Fallback (only if repo is NOT in adapter mode)
    console.warn("[seed] adapter-pg init failed, trying plain PrismaClient().", e);
    const prisma = new PrismaClient();
    return {
      prisma,
      close: async () => {
        await prisma.$disconnect();
      },
    };
  }
}

async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tableName}
      ) AS "exists";
    `;
    return Boolean(rows?.[0]?.exists);
  } catch (e) {
    console.warn("[seed] tableExists check failed -> assume missing:", tableName, e);
    return false;
  }
}

type DemoField = {
  key: string;
  label: string;
  type: "TEXT" | "TEXTAREA" | "SINGLE_SELECT" | "MULTI_SELECT" | "EMAIL" | "PHONE" | "CHECKBOX";
  required: boolean;
  sortOrder: number;
  placeholder?: string;
  helpText?: string;
  config?: unknown;
};

function demoFields(): DemoField[] {
  return [
    { key: "firstName", label: "Vorname", type: "TEXT", required: true, sortOrder: 10, placeholder: "Vorname" },
    { key: "lastName", label: "Nachname", type: "TEXT", required: true, sortOrder: 20, placeholder: "Nachname" },
    { key: "company", label: "Firma", type: "TEXT", required: false, sortOrder: 30, placeholder: "Firma" },
    { key: "email", label: "E-Mail", type: "EMAIL", required: false, sortOrder: 40, placeholder: "name@firma.ch" },
    { key: "phone", label: "Telefon", type: "PHONE", required: false, sortOrder: 50, placeholder: "+41 ..." },
    {
      key: "interest",
      label: "Interesse",
      type: "SINGLE_SELECT",
      required: false,
      sortOrder: 60,
      config: { options: ["Produktinfo", "Demo", "Preis", "Sonstiges"] },
    },
    {
      key: "newsletter",
      label: "Newsletter ok",
      type: "CHECKBOX",
      required: false,
      sortOrder: 70,
      helpText: "DEV: Checkbox default=false",
      config: { defaultValue: false },
    },
    { key: "note", label: "Notiz", type: "TEXTAREA", required: false, sortOrder: 80, placeholder: "Kurznotiz" },
  ];
}

async function upsertTenant(prisma: PrismaClient) {
  const slug = env("SEED_TENANT_SLUG", "atlex").toLowerCase();
  const name = env("SEED_TENANT_NAME", "Atlex GmbH");
  const country = env("SEED_TENANT_COUNTRY", "CH");

  return prisma.tenant.upsert({
    where: { slug },
    update: { name, country },
    create: { slug, name, country },
    select: { id: true, slug: true, name: true, country: true },
  });
}

async function upsertOwnerUser(prisma: PrismaClient, tenantId: string) {
  const email = env("SEED_OWNER_EMAIL", "owner@atlex.test").toLowerCase();
  const firstName = env("SEED_OWNER_FIRST_NAME", "Beat");
  const lastName = env("SEED_OWNER_LAST_NAME", "Owner");

  return prisma.user.upsert({
    where: { email },
    update: { tenantId, role: "TENANT_OWNER", firstName, lastName },
    create: { email, tenantId, role: "TENANT_OWNER", firstName, lastName },
    select: { id: true, email: true, tenantId: true, role: true },
  });
}

async function upsertDemoForm(prisma: PrismaClient, tenantId: string) {
  const formName = "Demo Lead Capture";
  const description = "DEV Demo Form für echte Lead-Captures über Mobile API v1 (Demo Capture Screen).";

  const existing = await prisma.form.findFirst({
    where: { tenantId, name: formName },
    select: { id: true },
  });

  const form = existing
    ? await prisma.form.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", description },
        select: { id: true, name: true, status: true },
      })
    : await prisma.form.create({
        data: { tenantId, name: formName, status: "ACTIVE", description },
        select: { id: true, name: true, status: true },
      });

  const fields = demoFields();

  for (const f of fields) {
    await prisma.formField.upsert({
      where: { formId_key: { formId: form.id, key: f.key } },
      update: {
        tenantId,
        label: f.label,
        type: f.type,
        required: f.required,
        isActive: true,
        sortOrder: f.sortOrder,
        placeholder: f.placeholder ?? undefined,
        helpText: f.helpText ?? undefined,
        config: typeof f.config === "undefined" ? undefined : asInputJson(f.config),
      },
      create: {
        tenantId,
        formId: form.id,
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        isActive: true,
        sortOrder: f.sortOrder,
        placeholder: f.placeholder ?? undefined,
        helpText: f.helpText ?? undefined,
        config: typeof f.config === "undefined" ? undefined : asInputJson(f.config),
      },
    });
  }

  return form;
}

/**
 * TP 7.0 — Seed Preset (tenant-owned)
 * - Uses JSON config snapshot (fields included) for later "create-from-preset".
 * - Safe: skips if FormPreset table does not exist yet.
 */
async function upsertDemoPreset(prisma: PrismaClient, tenantId: string) {
  const ok = await tableExists(prisma, "FormPreset");
  if (!ok) {
    console.log("[seed] FormPreset table missing -> skip preset seed.");
    return null;
  }

  const name = env("SEED_PRESET_NAME", "Kontakt – Basic");
  const category = env("SEED_PRESET_CATEGORY", "Standard");
  const description = env("SEED_PRESET_DESCRIPTION", "DEV Preset für 'Aus Vorlage erstellen' (TP 7.0).");

  const imageUrlRaw = env("SEED_PRESET_IMAGE_URL", "");
  const imageUrl = imageUrlRaw.trim() ? imageUrlRaw.trim() : null;

  const fields = demoFields();

  const config = {
    version: 1,
    generatedAt: new Date().toISOString(),
    form: { name, description },
    fields: fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      sortOrder: f.sortOrder,
      placeholder: f.placeholder ?? null,
      helpText: f.helpText ?? null,
      config: typeof f.config === "undefined" ? null : f.config,
    })),
  };

  const existing = await prisma.formPreset.findFirst({
    where: { tenantId, name, isPublic: false },
    select: { id: true },
  });

  const preset = existing
    ? await prisma.formPreset.update({
        where: { id: existing.id },
        data: {
          category,
          description,
          imageUrl,
          isPublic: false,
          config: asInputJson(config),
        },
        select: { id: true, name: true, category: true, isPublic: true },
      })
    : await prisma.formPreset.create({
        data: {
          tenantId,
          name,
          category,
          description,
          imageUrl,
          isPublic: false,
          config: asInputJson(config),
        },
        select: { id: true, name: true, category: true, isPublic: true },
      });

  return preset;
}

/**
 * TP 6.10 — Multi-ACTIVE events:
 * We intentionally allow multiple ACTIVE events per tenant.
 * Seed creates 2 ACTIVE events by default (Demo Messe + Demo Messe 2).
 */
async function upsertDemoEvents(prisma: PrismaClient, tenantId: string) {
  const name1 = env("SEED_EVENT_NAME", "Demo Messe");
  const name2 = env("SEED_EVENT_NAME_2", "Demo Messe 2");

  const locationRaw = env("SEED_EVENT_LOCATION", ""); // optional
  const location = locationRaw.trim() ? locationRaw.trim() : null;

  const now = new Date();
  const startsAt = now;
  const endsAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const names = [name1, name2].map((s) => s.trim()).filter(Boolean);

  const out: Array<{ id: string; name: string; status: string }> = [];

  for (const name of names) {
    const existing = await prisma.event.findFirst({
      where: { tenantId, name },
      select: { id: true },
    });

    const ev = existing
      ? await prisma.event.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            location, // allow clearing to NULL
            startsAt,
            endsAt,
          },
          select: { id: true, name: true, status: true },
        })
      : await prisma.event.create({
          data: {
            tenantId,
            name,
            status: "ACTIVE",
            location, // allow NULL
            startsAt,
            endsAt,
          },
          select: { id: true, name: true, status: true },
        });

    out.push({ id: ev.id, name: ev.name, status: String(ev.status) });
  }

  return out;
}

async function recreateDemoMobileKeyAndDevice(
  prisma: PrismaClient,
  opts: { tenantId: string; ownerUserId: string; formId: string; activeEventId?: string }
) {
  const secret = env("MOBILE_API_KEY_SECRET", "");
  if (!hasStrongSecret(secret)) {
    console.log("[seed] MOBILE_API_KEY_SECRET missing/too short -> skip MobileApiKey/Device seed.");
    return;
  }

  const keyName = "Seed Demo Key";
  const deviceName = "Seed Demo Device";

  // Clean previous seed artifacts for predictability
  const old = await prisma.mobileApiKey.findFirst({
    where: { tenantId: opts.tenantId, name: keyName },
    select: { id: true, device: { select: { id: true } } },
  });

  if (old?.device?.id) {
    await prisma.mobileDeviceForm.deleteMany({
      where: { tenantId: opts.tenantId, deviceId: old.device.id },
    });
    await prisma.mobileDevice.delete({ where: { id: old.device.id } });
  }
  if (old?.id) {
    await prisma.mobileApiKey.delete({ where: { id: old.id } });
  }

  const token = randomToken();
  const prefix = token.slice(0, 12);
  const keyHash = hmacSha256Hex(secret, token);

  const apiKey = await prisma.mobileApiKey.create({
    data: {
      tenantId: opts.tenantId,
      name: keyName,
      prefix,
      keyHash,
      status: "ACTIVE",
      createdByUserId: opts.ownerUserId,
    },
    select: { id: true, prefix: true, status: true },
  });

  const device = await prisma.mobileDevice.create({
    data: {
      tenantId: opts.tenantId,
      name: deviceName,
      apiKeyId: apiKey.id,
      status: "ACTIVE",
      ...(opts.activeEventId ? { activeEventId: opts.activeEventId } : {}),
    },
    select: { id: true, name: true, status: true, activeEventId: true },
  });

  await prisma.mobileDeviceForm.create({
    data: {
      tenantId: opts.tenantId,
      deviceId: device.id,
      formId: opts.formId,
    },
  });

  console.log("[seed] Demo Mobile ApiKey created (cleartext, DEV only):");
  console.log("        token:", token);
  console.log("        prefix:", apiKey.prefix);
  console.log("        device:", device.name, device.id);
  if (device.activeEventId) console.log("        device.activeEventId:", device.activeEventId);
}

async function main() {
  const db = await createSeedDb();
  try {
    const tenant = await upsertTenant(db.prisma);
    const owner = await upsertOwnerUser(db.prisma, tenant.id);
    const form = await upsertDemoForm(db.prisma, tenant.id);
    const events = await upsertDemoEvents(db.prisma, tenant.id);

    const preset = await upsertDemoPreset(db.prisma, tenant.id);

    console.log("[seed] Tenant:", tenant.slug, tenant.id);
    console.log("[seed] Owner:", owner.email, owner.id, `(role=${owner.role})`);
    console.log("[seed] Form:", form.name, form.id, `(status=${form.status})`);

    if (preset) {
      console.log("[seed] Preset:", preset.name, preset.id, `(category=${preset.category}, public=${preset.isPublic})`);
    } else {
      console.log("[seed] Preset: none");
    }

    if (events.length) {
      for (const ev of events) console.log("[seed] Event:", ev.name, ev.id, `(status=${ev.status})`);
    } else {
      console.log("[seed] Event: none");
    }

    // Bind device to the first seeded event (if any)
    const primaryEventId = events[0]?.id;

    await recreateDemoMobileKeyAndDevice(db.prisma, {
      tenantId: tenant.id,
      ownerUserId: owner.id,
      formId: form.id,
      activeEventId: primaryEventId,
    });

    console.log("[seed] Done.");
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error("[seed] FAILED:", e);
  process.exitCode = 1;
});
