"use strict";

/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");
const { prisma, disconnect } = require("./prisma.cjs");

function hmacSha256Hex(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function getSecret() {
  const s = String(process.env.MOBILE_API_KEY_SECRET || "").trim();
  if (!s) throw new Error("MOBILE_API_KEY_SECRET missing in env (.env.local).");
  return s;
}

function generateApiKeyToken() {
  // Token format: lrk_<8hex>_<random>
  const p = crypto.randomBytes(4).toString("hex"); // 8 hex
  const body = crypto.randomBytes(24).toString("base64url");
  const token = `lrk_${p}_${body}`;

  // MUST match backend requireMobileAuth prefix slice length (=8)
  const prefix = token.slice(0, 8);

  const keyHash = hmacSha256Hex(getSecret(), token);
  return { token, prefix, keyHash };
}

(async () => {
  const tenantSlug = String(process.argv[2] || "").trim();
  const deviceName = String(process.argv[3] || "Dev Device").trim().slice(0, 120);

  if (!tenantSlug) {
    console.log('Usage: node tools/dev-create-mobile-key.cjs <tenantSlug> "<deviceName>"');
    process.exit(2);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantSlug}`);
  }

  const gen = generateApiKeyToken();

  const apiKey = await prisma.mobileApiKey.create({
    data: {
      tenantId: tenant.id,
      name: deviceName,
      prefix: gen.prefix,
      keyHash: gen.keyHash,
      status: "ACTIVE",
    },
    select: { id: true, prefix: true, createdAt: true },
  });

  const device = await prisma.mobileDevice.create({
    data: {
      tenantId: tenant.id,
      name: deviceName,
      apiKeyId: apiKey.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  console.log(
    JSON.stringify(
      {
        tenant: `${tenant.slug} (${tenant.name})`,
        apiKeyId: apiKey.id,
        deviceId: device.id,
        prefix: apiKey.prefix,
        token: gen.token,
      },
      null,
      2
    )
  );
})()
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnect();
  });
