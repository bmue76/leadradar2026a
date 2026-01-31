/**
 * TP 5.5 — Billing SKU Seed (Stripe Packages)
 * - Cleans up accidental duplicates (same name or stripePriceId) created during dev seeding
 * - Upserts stable SKU IDs (id-stable)
 * - IMPORTANT: update includes stripePriceId (so you can change prices without deleting rows)
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function createPrisma() {
  const { PrismaClient } = await import("@prisma/client");

  // Prisma v7: often requires adapter (engine type "client").
  // We try adapter-pg first; fallback to plain client if your setup allows it.
  try {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { Pool } = await import("pg");

    const connectionString =
      (process.env.DATABASE_URL ?? "").trim() ||
      (process.env.POSTGRES_URL ?? "").trim() ||
      (process.env.POSTGRES_PRISMA_URL ?? "").trim() ||
      (process.env.DIRECT_URL ?? "").trim();

    if (!connectionString) {
      throw new Error(
        "No connection string found. Set DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL / DIRECT_URL).",
      );
    }

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    return { prisma, pool };
  } catch {
    const prisma = new PrismaClient();
    return { prisma, pool: null };
  }
}

function fmtMoney(cents, currency) {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

/**
 * Stable SKU IDs.
 * Stripe Price IDs are REAL (Stripe Test Mode) from Beat’s Stripe output.
 *
 * Zielpreise:
 * - 30d: 1× = 39 CHF; 10× = 290 CHF
 * - 365d: 1× = 399 CHF; 10× = 2’990 CHF
 */
const SKUS = [
  // 30d — single (new)
  {
    id: "lr_sku_30d_1",
    active: true,
    name: "1× 30-Tage Lizenz-Credit",
    description: "1 Credit für 30 Tage Lizenz-Aktivierung.",
    stripePriceId: "price_1SvkZZHZ6Wqiu55s3MRfh2iS",
    currency: "CHF",
    amountCents: 3900,
    grantLicense30d: 1,
    grantLicense365d: 0,
    grantDeviceSlots: 0,
    creditExpiresInDays: 365,
    sortOrder: 5,
  },

  // 30d — bundles
  {
    id: "cml1hxpvr00009wts58e3j87n",
    active: true,
    name: "3× 30-Tage Lizenz-Credit",
    description: "3 Credits für je 30 Tage Lizenz-Aktivierung.",
    stripePriceId: "price_1SvSCsHZ6Wqiu55siups2VXL",
    currency: "CHF",
    amountCents: 11700,
    grantLicense30d: 3,
    grantLicense365d: 0,
    grantDeviceSlots: 0,
    creditExpiresInDays: 365,
    sortOrder: 10,
  },
  {
    id: "cml1hxpzw00019wtspusy9j81",
    active: true,
    name: "5× 30-Tage Lizenz-Credit",
    description: "5 Credits für je 30 Tage Lizenz-Aktivierung.",
    stripePriceId: "price_1SvSCuHZ6Wqiu55sPQBDX4nD",
    currency: "CHF",
    amountCents: 19500,
    grantLicense30d: 5,
    grantLicense365d: 0,
    grantDeviceSlots: 0,
    creditExpiresInDays: 365,
    sortOrder: 20,
  },
  {
    id: "cml1hxpzz00029wtsn95vltkt",
    active: true,
    name: "10× 30-Tage Lizenz-Credit",
    description: "10 Credits für je 30 Tage Lizenz-Aktivierung.",
    stripePriceId: "price_1SvSCvHZ6Wqiu55s23wpeUVk",
    currency: "CHF",
    amountCents: 29000, // rabattiert (statt 39000)
    grantLicense30d: 10,
    grantLicense365d: 0,
    grantDeviceSlots: 0,
    creditExpiresInDays: 365,
    sortOrder: 30,
  },

  // 365d — bundles
  {
    id: "cml1hxq0100039wts9nvyg1iz",
    active: true,
    name: "1× 365-Tage Lizenz-Credit",
    description: "1 Credit für 365 Tage Lizenz-Aktivierung.",
    stripePriceId: "price_1SvSCxHZ6Wqiu55sfeL2JUob",
    currency: "CHF",
    amountCents: 39900,
    grantLicense30d: 0,
    grantLicense365d: 1,
    grantDeviceSlots: 0,
    creditExpiresInDays: 365,
    sortOrder: 110,
  },
  {
    id: "cml1hxq0300049wtsgp8z3dib",
    active: true,
    name: "3× 365-Tage Lizenz-Credit",
    description: "3 Credits für je 365 Tage Lizenz-Aktivierung.",
    stripePriceId: "price_1SvSCyHZ6Wqiu55st1RSmtFM",
    currency: "CHF",
    amountCents: 119700,
    grantLicense30d: 0,
    grantLicense365d: 3,
    grantDeviceSlots: 0,
    creditExpiresInDays: 365,
    sortOrder: 120,
  },
  {
    id: "cml1hxq0500059wtsome6atul",
    active: true,
    name: "5× 365-Tage Lizenz-Credit",
    description: "5 Credits für je 365 Tage Lizenz-Aktivierung.",
    stripePriceId: "price_1SvSCzHZ6Wqiu55sBV9QzYTk",
    currency: "CHF",
    amountCents: 199500,
    grantLicense30d: 0,
    grantLicense365d: 5,
    grantDeviceSlots: 0,
    creditExpiresInDays: 365,
    sortOrder: 130,
  },

  // 365d — 10 bundle (new)
  {
    id: "lr_sku_365d_10",
    active: true,
    name: "10× 365-Tage Lizenz-Credit",
    description: "10 Credits für je 365 Tage Lizenz-Aktivierung.",
    stripePriceId: "price_1SvkSbHZ6Wqiu55ssPSwImYg",
    currency: "CHF",
    amountCents: 299000, // rabattiert (statt 399000)
    grantLicense30d: 0,
    grantLicense365d: 10,
    grantDeviceSlots: 0,
    creditExpiresInDays: 365,
    sortOrder: 140,
  },
];

async function main() {
  console.log("Seeding BillingSku…");

  const { prisma, pool } = await createPrisma();

  try {
    const desiredIds = SKUS.map((s) => s.id);
    const desiredNames = SKUS.map((s) => s.name);
    const desiredPriceIds = SKUS.map((s) => s.stripePriceId);

    // 1) Cleanup duplicates that would violate unique(stripePriceId)
    const del = await prisma.billingSku.deleteMany({
      where: {
        id: { notIn: desiredIds },
        OR: [{ name: { in: desiredNames } }, { stripePriceId: { in: desiredPriceIds } }],
      },
    });

    if (del.count > 0) {
      console.log(`Cleaned duplicates: deleted=${del.count}`);
    } else {
      console.log("Cleaned duplicates: none");
    }

    // 2) Upsert stable SKUs (update includes stripePriceId!)
    const out = [];

    for (const sku of SKUS) {
      const row = await prisma.billingSku.upsert({
        where: { id: sku.id },
        create: {
          id: sku.id,
          active: sku.active,
          name: sku.name,
          description: sku.description,
          stripePriceId: sku.stripePriceId,
          currency: sku.currency,
          amountCents: sku.amountCents,
          grantLicense30d: sku.grantLicense30d,
          grantLicense365d: sku.grantLicense365d,
          grantDeviceSlots: sku.grantDeviceSlots,
          creditExpiresInDays: sku.creditExpiresInDays,
          sortOrder: sku.sortOrder,
        },
        update: {
          active: sku.active,
          name: sku.name,
          description: sku.description,
          stripePriceId: sku.stripePriceId, // IMPORTANT
          currency: sku.currency,
          amountCents: sku.amountCents,
          grantLicense30d: sku.grantLicense30d,
          grantLicense365d: sku.grantLicense365d,
          grantDeviceSlots: sku.grantDeviceSlots,
          creditExpiresInDays: sku.creditExpiresInDays,
          sortOrder: sku.sortOrder,
        },
      });

      out.push(row);
    }

    console.log("\nDONE ✅  Created/updated SKUs:");
    for (const r of out) {
      console.log(
        `- skuId=${r.id} | ${r.name} | price=${r.stripePriceId} | ${fmtMoney(r.amountCents ?? 0, r.currency ?? "CHF")} | 30d=${r.grantLicense30d} | 365d=${r.grantLicense365d} | expDays=${r.creditExpiresInDays} | active=${r.active} | sort=${r.sortOrder}`,
      );
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
    if (pool) await pool.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error("\nFAILED ❌");
  console.error(e?.message ?? e);
  process.exit(1);
});
