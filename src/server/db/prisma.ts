import { PrismaClient } from "@prisma/client";

type GlobalWithPrisma = typeof globalThis & { __lrPrisma?: PrismaClient };

/**
 * Lazy Prisma getter:
 * - No PrismaClient construction at module-eval time (build-safe when used via dynamic import)
 * - Uses global cache in dev to avoid too many connections on HMR
 *
 * NOTE: Do NOT pass `datasourceUrl` here (typed as `never` in this project’s Prisma client).
 */
export function getPrisma(): PrismaClient {
  const g = globalThis as GlobalWithPrisma;

  if (g.__lrPrisma) return g.__lrPrisma;

  // Provide a non-empty options object (Prisma error workaround in some bundler contexts)
  const client = new PrismaClient({
    log: ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    g.__lrPrisma = client;
  }

  return client;
}
