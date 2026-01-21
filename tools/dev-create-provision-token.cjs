/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const crypto = require("node:crypto");
const { prisma, disconnect } = require("./prisma.cjs");

const PREFIX_LEN = 8;

function hmacSha256Hex(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function getProvisionSecret() {
  const s = (process.env.MOBILE_PROVISION_TOKEN_SECRET || process.env.MOBILE_API_KEY_SECRET || "").trim();
  if (!s) throw new Error("MOBILE_PROVISION_TOKEN_SECRET (oder MOBILE_API_KEY_SECRET) fehlt in .env.local");
  return s;
}

function genToken() {
  return `prov_${crypto.randomBytes(24).toString("base64url")}`;
}

(async () => {
  const tenantSlug = String(process.argv[2] || "").trim();
  const deviceName = String(process.argv[3] || "android-36").trim().slice(0, 120);

  if (!tenantSlug) {
    console.log('Usage: node tools/dev-create-provision-token.cjs <tenantSlug> "<deviceName>"');
    process.exit(2);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);

  const token = genToken();
  const prefix = token.slice(0, PREFIX_LEN);
  const tokenHash = hmacSha256Hex(getProvisionSecret(), token);

  // ACTIVE Forms (damit /forms nach Claim nicht leer ist)
  const forms = await prisma.form.findMany({
    where: { tenantId: tenant.id, status: "ACTIVE" },
    select: { id: true },
    take: 200,
  });
  const requestedFormIds = forms.map((f) => f.id);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 60min

  const row = await prisma.mobileProvisionToken.create({
    data: {
      tenantId: tenant.id,
      prefix,
      tokenHash,
      status: "ACTIVE",
      expiresAt,
      requestedDeviceName: deviceName,
      requestedFormIds,
    },
    select: { id: true, status: true, expiresAt: true, prefix: true },
  });

  console.log(
    JSON.stringify(
      {
        tenant: `${tenant.slug} (${tenant.name})`,
        provisionToken: token,
        prefix: row.prefix,
        expiresAt: row.expiresAt,
        requestedFormCount: requestedFormIds.length,
      },
      null,
      2
    )
  );
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnect();
  });
