import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var __lr_prisma: PrismaClient | undefined;
  var __lr_pg_pool: Pool | undefined;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || !url.trim()) throw new Error("DATABASE_URL missing. Ensure it is set (e.g. in .env.local).");
  return url;
}

function getPool(): Pool {
  if (!globalThis.__lr_pg_pool) {
    globalThis.__lr_pg_pool = new Pool({ connectionString: getDatabaseUrl() });
  }
  return globalThis.__lr_pg_pool;
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg(getPool());
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalThis.__lr_prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__lr_prisma = prisma;
}
