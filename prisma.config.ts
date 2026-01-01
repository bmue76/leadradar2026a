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
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
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
    "No valid Postgres connection string found. Set DATABASE_URL or POSTGRES_URL(_NON_POOLING) in .env.local / .env."
  );
}

function deriveShadowSchemaUrl(databaseUrl: string): string {
  const u = new URL(databaseUrl);
  u.searchParams.set("schema", "shadow");
  return u.toString();
}

loadEnv();

const databaseUrl = pickDatabaseUrl();
const shadowFromEnv = normalize(process.env.SHADOW_DATABASE_URL);

const shadowDatabaseUrl =
  shadowFromEnv && isValidPostgresUrl(shadowFromEnv)
    ? shadowFromEnv
    : deriveShadowSchemaUrl(databaseUrl);

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
    shadowDatabaseUrl,
  },
});
