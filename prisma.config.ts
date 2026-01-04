import fs from "node:fs";
import path from "node:path";
import { config as dotenvConfig } from "dotenv";
import { defineConfig } from "prisma/config";

function loadEnv() {
  const cwd = process.cwd();

  const envLocal = path.join(cwd, ".env.local");
  if (fs.existsSync(envLocal)) dotenvConfig({ path: envLocal });

  const env = path.join(cwd, ".env");
  if (fs.existsSync(env)) dotenvConfig({ path: env });
}

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

  throw new Error(
    "No valid Postgres connection string found. Set DATABASE_URL (preferred) in .env.local / .env."
  );
}

loadEnv();

const databaseUrl = pickDatabaseUrl();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
    // shadowDatabaseUrl: optional; let Prisma manage shadow DB automatically in dev
  },
});
