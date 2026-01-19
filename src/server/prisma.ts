import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function normalize(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function isValidPostgresUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return u.protocol === "postgres:" || u.protocol === "postgresql:";
  } catch {
    return false;
  }
}

function pickDatabaseUrl(): string {
  const candidates: Array<string | undefined> = [
    normalize(process.env.DATABASE_URL),
    normalize(process.env.POSTGRES_URL_NON_POOLING),
    normalize(process.env.POSTGRES_URL),
    normalize(process.env.POSTGRES_PRISMA_URL),
  ];

  for (const c of candidates) {
    if (c && isValidPostgresUrl(c)) return c;
  }

  throw new Error("No valid Postgres connection string found. Set DATABASE_URL in .env.local / .env.");
}

function needsSsl(connectionString: string): boolean {
  try {
    const u = new URL(connectionString);

    const sslmode = (u.searchParams.get("sslmode") || "").toLowerCase();
    if (sslmode === "disable") return false;
    if (sslmode === "require" || sslmode === "verify-ca" || sslmode === "verify-full") return true;

    const host = (u.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;

    // Remote DB: default to SSL (safe for most managed Postgres)
    return true;
  } catch {
    return false;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = pickDatabaseUrl();
const adapter = new PrismaPg({
  connectionString: url,
  ...(needsSsl(url) ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
