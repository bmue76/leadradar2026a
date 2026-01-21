const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString =
  (process.env.DATABASE_URL || "").trim() ||
  (process.env.POSTGRES_URL_NON_POOLING || "").trim() ||
  (process.env.POSTGRES_URL || "").trim();

if (!connectionString) {
  throw new Error("No Postgres connection string found. Set DATABASE_URL (preferred) in .env.local.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function disconnect() {
  await prisma.$disconnect().catch(() => {});
  await pool.end().catch(() => {});
}

module.exports = { prisma, disconnect };
