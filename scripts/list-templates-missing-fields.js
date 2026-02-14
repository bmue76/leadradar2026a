/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const { PrismaClient } = require("@prisma/client");

function createPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url || !String(url).trim()) {
    throw new Error("DATABASE_URL fehlt oder ist leer (prüfe .env.local).");
  }

  // Prisma engineType="client" → adapter required
  // Postgres adapter: @prisma/adapter-pg + pg
  const { Pool } = require("pg");
  const { PrismaPg } = require("@prisma/adapter-pg");

  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);

  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    async close() {
      try {
        await prisma.$disconnect();
      } finally {
        await pool.end().catch(() => {});
      }
    },
  };
}

/* -------------------------- helpers -------------------------- */

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFieldLike(x) {
  return (
    isRecord(x) &&
    typeof x.key === "string" &&
    typeof x.label === "string" &&
    typeof x.type === "string"
  );
}

function tryParseFieldsArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isFieldLike);
}

function findFieldsDeep(cfg, maxDepth = 5) {
  const seen = new Set();

  const walk = (v, depth) => {
    if (!v || typeof v !== "object") return null;
    if (seen.has(v)) return null;
    seen.add(v);

    if (Array.isArray(v)) {
      const parsed = tryParseFieldsArray(v);
      if (parsed.length) return parsed;
      if (depth <= 0) return null;
      for (const item of v) {
        const found = walk(item, depth - 1);
        if (found && found.length) return found;
      }
      return null;
    }

    if (depth <= 0) return null;

    const o = v;

    const directKeys = ["fields", "fieldsSnapshot", "formFields", "schemaFields"];
    for (const k of directKeys) {
      if (Object.prototype.hasOwnProperty.call(o, k)) {
        const parsed = tryParseFieldsArray(o[k]);
        if (parsed.length) return parsed;
      }
    }

    for (const k of Object.keys(o)) {
      const found = walk(o[k], depth - 1);
      if (found && found.length) return found;
    }

    return null;
  };

  return walk(cfg, maxDepth) || [];
}

function extractFieldsFromPresetConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return [];
  const o = cfg;

  const direct = tryParseFieldsArray(o.fields);
  if (direct.length) return direct;

  const snap = tryParseFieldsArray(o.fieldsSnapshot);
  if (snap.length) return snap;

  return findFieldsDeep(cfg, 5);
}

/* -------------------------- main -------------------------- */

async function main() {
  const { prisma, close } = createPrisma();

  try {
    const presets = await prisma.formPreset.findMany({
      select: {
        id: true,
        tenantId: true,
        isPublic: true,
        name: true,
        updatedAt: true,
        config: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    let missing = 0;

    for (const p of presets) {
      const fields = extractFieldsFromPresetConfig(p.config);

      if (!fields.length) {
        missing += 1;
        console.log(
          [
            "MISSING_FIELDS",
            p.id,
            `public=${p.isPublic ? "1" : "0"}`,
            `tenant=${p.tenantId ?? "null"}`,
            `"${p.name}"`,
            `updatedAt=${new Date(p.updatedAt).toISOString()}`,
          ].join(" | ")
        );
      }
    }

    console.log(`\nDone. Missing fields: ${missing} / ${presets.length}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error("list-templates-missing-fields failed:", e);
  process.exitCode = 1;
});
