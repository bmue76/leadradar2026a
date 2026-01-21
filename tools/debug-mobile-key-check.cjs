/* eslint-disable -eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");
const { prisma, disconnect } = require("./prisma.cjs");

function hmacSha256Hex(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

(async () => {
  const tenantSlug = String(process.argv[2] || "").trim();
  const token = String(process.argv[3] || "").trim();

  if (!tenantSlug || !token || token.length < 10) {
    console.log('Usage: node tools/debug-mobile-key-check.cjs <tenantSlug> "<x-api-key>"');
    process.exit(2);
  }

  const secret = (process.env.MOBILE_API_KEY_SECRET || "").trim();
  if (!secret) {
    console.log("MOBILE_API_KEY_SECRET is missing in env (.env.local).");
    process.exit(2);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    console.log(`Tenant not found: ${tenantSlug}`);
    process.exit(2);
  }

  const prefix = token.slice(0, 8);
  const keyHash = hmacSha256Hex(secret, token);

  // Direct match (fast truth)
  const row = await prisma.mobileApiKey.findFirst({
    where: { tenantId: tenant.id, keyHash },
    select: {
      id: true,
      status: true,
      prefix: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });

  const devices = row
    ? await prisma.mobileDevice.findMany({
        where: { tenantId: tenant.id, apiKeyId: row.id },
        select: { id: true, status: true, name: true, createdAt: true, lastSeenAt: true, activeEventId: true },
        take: 20,
      })
    : [];

  const activePrefixCount = await prisma.mobileApiKey.count({
    where: { tenantId: tenant.id, prefix, status: "ACTIVE" },
  });

  console.log({
    tenant: `${tenant.slug} (${tenant.name})`,
    tokenPrefix: prefix,
    activeKeysWithSamePrefixInTenant: activePrefixCount,
    keyHashFound: Boolean(row),
    key: row,
    devicesForKey: devices,
  });
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnect();
  });
