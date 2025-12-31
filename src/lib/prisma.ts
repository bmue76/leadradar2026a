import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type GlobalPrisma = typeof globalThis & {
  __prisma?: PrismaClient;
  __prismaPg?: PrismaPg;
};

const g = globalThis as GlobalPrisma;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  // Nicht beim Import hard-crashen – erst wenn DB wirklich gebraucht wird.
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (gitignored) or set it as an environment variable."
    );
  }

  // Adapter re-using in dev (Hot Reload)
  const adapter = g.__prismaPg ?? new PrismaPg({ connectionString });
  if (process.env.NODE_ENV !== "production") g.__prismaPg = adapter;

  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (!g.__prisma) g.__prisma = createClient();
  return g.__prisma;
}

/**
 * Optional convenience export:
 * Allows `import { prisma } from "@/lib/prisma"` with lazy init.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: PropertyKey) {
    const client = getPrisma();

    const value = (client as unknown as Record<PropertyKey, unknown>)[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
