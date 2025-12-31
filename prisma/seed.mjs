import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function loadEnvFile(relPath) {
  const abs = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(abs)) return;

  const raw = fs.readFileSync(abs, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Create .env.local (see .env.example).");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "atlex" },
    update: { name: "Atlex GmbH" },
    create: { slug: "atlex", name: "Atlex GmbH" },
  });

  const user = await prisma.user.upsert({
    where: { email: "owner@atlex.test" },
    update: {
      tenantId: tenant.id,
      role: "TENANT_OWNER",
      name: "Beat",
    },
    create: {
      tenantId: tenant.id,
      email: "owner@atlex.test",
      role: "TENANT_OWNER",
      name: "Beat",
    },
  });

  console.log("[seed] tenant:", { id: tenant.id, slug: tenant.slug, name: tenant.name });
  console.log("[seed] user:", { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId });
}

main()
  .catch((e) => {
    console.error("[seed] FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  });
