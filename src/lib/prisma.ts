/**
 * LeadRadar2026A – Prisma Client
 *
 * Some Prisma setups (Driver Adapters) REQUIRE passing PrismaClientOptions (e.g. { adapter }).
 * If we call `new PrismaClient()` in such a project, Prisma will throw at module-eval time,
 * causing Next to render an HTML 500 error page before our route handler can respond with jsonError.
 *
 * This module creates PrismaClient in a way that supports both:
 * - "classic" Prisma engine: new PrismaClient()
 * - "driver adapter" Prisma: new PrismaClient({ adapter })
 */

import { PrismaClient } from "@prisma/client";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

type PrismaSingleton = { prisma?: PrismaClient };
const globalForPrisma = globalThis as unknown as PrismaSingleton;

function createClientWithPgAdapter(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url || !url.trim()) {
    throw new Error("DATABASE_URL is missing/empty. Set it in .env.local before starting the dev server.");
  }

  // Adapter dependencies must exist in repo if driver adapters are enabled.
  // npm i pg @prisma/adapter-pg
  const pg = require("pg") as typeof import("pg");
  const adapterPkg = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");

  const pool = new pg.Pool({ connectionString: url });
  const adapter = new adapterPkg.PrismaPg(pool);

  // Prisma Client types don't always include `adapter` (preview/driverAdapters).
  // Runtime accepts it; we cast safely via unknown.
  const options = { adapter } as unknown as ConstructorParameters<typeof PrismaClient>[0];
  return new PrismaClient(options);
}

function createPrismaClient(): PrismaClient {
  try {
    // Works for classic Prisma setups
    return new PrismaClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);

    const needsOptions =
      msg.includes("PrismaClientOptions") ||
      msg.includes("needs to be constructed with a non-empty") ||
      msg.includes("non-empty, valid `PrismaClientOptions`");

    if (!needsOptions) throw e;

    // Driver adapter setup detected -> attempt adapter-pg
    try {
      return createClientWithPgAdapter();
    } catch (adapterErr: unknown) {
      console.error(
        "Prisma adapter init failed. If you use Driver Adapters, ensure deps are installed (pg, @prisma/adapter-pg).",
        adapterErr
      );
      throw e; // keep original Prisma error as primary signal
    }
  }
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
