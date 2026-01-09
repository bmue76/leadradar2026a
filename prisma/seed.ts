/**
 * LeadRadar2026A — DEV Seed (safe + idempotent-ish)
 *
 * - Creates/updates a demo tenant + owner user
 * - Creates/updates one ACTIVE demo form + fields
 * - If MOBILE_API_KEY_SECRET is present: creates a fresh demo MobileApiKey + bound device + assignment
 *
 * IMPORTANT:
 * - No cleartext keys stored in DB (only hash + prefix).
 * - Seed prints the cleartext token once for DEV proof.
 */

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function hasStrongSecret(s: string): boolean {
  // pragmatic: avoid accidental empty/short secrets
  return s.trim().length >= 16;
}

function hmacSha256Hex(secret: string, token: string): string {
  return crypto.createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

function randomToken(): string {
  return `lrk_${crypto.randomBytes(24).toString("hex")}`;
}

async function upsertTenant() {
  const slug = env("SEED_TENANT_SLUG", "atlex").toLowerCase();
  const name = env("SEED_TENANT_NAME", "Atlex GmbH");
  const country = env("SEED_TENANT_COUNTRY", "CH");

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { name, country },
    create: { slug, name, country },
    select: { id: true, slug: true, name: true, country: true },
  });

  return tenant;
}

async function upsertOwnerUser(tenantId: string) {
  const email = env("SEED_OWNER_EMAIL", "owner@atlex.test").toLowerCase();
  const firstName = env("SEED_OWNER_FIRST_NAME", "Beat");
  const lastName = env("SEED_OWNER_LAST_NAME", "Owner");

  const user = await prisma.user.upsert({
    where: { email },
    update: { tenantId, role: "TENANT_OWNER", firstName, lastName },
    create: { email, tenantId, role: "TENANT_OWNER", firstName, lastName },
    select: { id: true, email: true, tenantId: true, role: true },
  });

  return user;
}

async function upsertDemoForm(tenantId: string) {
  const formName = "Demo Lead Capture";

  const existing = await prisma.form.findFirst({
    where: { tenantId, name: formName },
    select: { id: true },
  });

  const description =
    "DEV Demo Form für echte Lead-Captures über Mobile API v1 (Demo Capture Screen).";

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

  const fields: Array<{
    key: string;
    label: string;
    type:
      | "TEXT"
      | "TEXTAREA"
      | "SINGLE_SELECT"
      | "MULTI_SELECT"
      | "EMAIL"
      | "PHONE"
      | "CHECKBOX";
    required: boolean;
    sortOrder: number;
    placeholder?: string;
    helpText?: string;
    config?: unknown;
  }> = [
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
    {
      key: "note",
      label: "Notiz",
      type: "TEXTAREA",
      required: false,
      sortOrder: 80,
      placeholder: "Kurznotiz",
    },
  ];

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
        // Prisma v7: NEVER pass null here, use undefined to omit.
        config: typeof f.config === "undefined" ? undefined : (f.config as any),
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
        config: typeof f.config === "undefined" ? undefined : (f.config as any),
      },
    });
  }

  return form;
}

async function recreateDemoMobileKeyAndDevice(opts: {
  tenantId: string;
  ownerUserId: string;
  formId: string;
}) {
  const secret = env("MOBILE_API_KEY_SECRET", "");
  if (!hasStrongSecret(secret)) {
    console.log("[seed] MOBILE_API_KEY_SECRET missing/too short -> skip MobileApiKey/Device seed.");
    return;
  }

  const keyName = "Seed Demo Key";
  const deviceName = "Seed Demo Device";

  // Clean previous seed artifacts to keep things simple and predictable
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
    },
    select: { id: true, name: true, status: true },
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
}

async function main() {
  const tenant = await upsertTenant();
  const owner = await upsertOwnerUser(tenant.id);
  const form = await upsertDemoForm(tenant.id);

  console.log("[seed] Tenant:", tenant.slug, tenant.id);
  console.log("[seed] Owner:", owner.email, owner.id, `(role=${owner.role})`);
  console.log("[seed] Form:", form.name, form.id, `(status=${form.status})`);

  await recreateDemoMobileKeyAndDevice({
    tenantId: tenant.id,
    ownerUserId: owner.id,
    formId: form.id,
  });

  console.log("[seed] Done.");
}

main()
  .catch((e) => {
    console.error("[seed] FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
