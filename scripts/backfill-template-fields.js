/**
 * Backfill template config.fields from source form fields (sourceFormId/formId).
 *
 * Usage:
 *   node scripts/backfill-template-fields.js          # dry-run
 *   node scripts/backfill-template-fields.js --apply  # writes changes
 */

require("dotenv").config({ path: ".env.local" });

const { PrismaClient } = require("@prisma/client");

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getSourceFormIdFromConfig(cfg) {
  if (!isRecord(cfg)) return null;
  const v = cfg.sourceFormId ?? cfg.formId;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient();

  try {
    const presets = await prisma.formPreset.findMany({
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        tenantId: true,
        isPublic: true,
        name: true,
        updatedAt: true,
        config: true,
      },
    });

    let candidates = 0;
    let updated = 0;
    let skipped = 0;

    for (const p of presets) {
      const cfg = p.config;

      // only backfill if fields missing
      const hasFields = isRecord(cfg) && Array.isArray(cfg.fields) && cfg.fields.length > 0;
      if (hasFields) continue;

      const sourceFormId = getSourceFormIdFromConfig(cfg);
      if (!sourceFormId) {
        skipped += 1;
        continue;
      }

      // public presets: tenantId null => don't know ownership of source form safely
      if (!p.tenantId) {
        skipped += 1;
        continue;
      }

      candidates += 1;

      const form = await prisma.form.findFirst({
        where: { id: sourceFormId, tenantId: p.tenantId },
        select: { id: true },
      });
      if (!form) {
        console.log(`skip (no source form): preset=${p.id} name="${p.name}" sourceFormId=${sourceFormId}`);
        skipped += 1;
        continue;
      }

      const rows = await prisma.formField.findMany({
        where: { tenantId: p.tenantId, formId: sourceFormId },
        orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
        select: {
          key: true,
          label: true,
          type: true,
          required: true,
          sortOrder: true,
          placeholder: true,
          helpText: true,
          isActive: true,
          config: true,
        },
      });

      const fields = rows.map((r) => ({
        key: r.key,
        label: r.label,
        type: String(r.type),
        required: Boolean(r.required),
        sortOrder: r.sortOrder ?? undefined,
        placeholder: r.placeholder ?? null,
        helpText: r.helpText ?? null,
        isActive: Boolean(r.isActive),
        config: typeof r.config === "undefined" ? null : r.config,
      }));

      if (!fields.length) {
        console.log(`skip (source form has no fields): preset=${p.id} sourceFormId=${sourceFormId}`);
        skipped += 1;
        continue;
      }

      console.log(`${apply ? "APPLY" : "DRY"} backfill: preset=${p.id} name="${p.name}" fields=${fields.length}`);

      if (apply) {
        const nextCfg = isRecord(cfg) ? { ...cfg, fields } : { fields };
        await prisma.formPreset.update({
          where: { id: p.id },
          data: { config: nextCfg },
        });
        updated += 1;
      }
    }

    console.log("\nDone.");
    console.log(`candidates: ${candidates}`);
    console.log(`updated:    ${updated}`);
    console.log(`skipped:    ${skipped}`);
    console.log(`mode:       ${apply ? "apply" : "dry-run"}`);
    console.log("");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("backfill-template-fields failed:", e);
  process.exit(1);
});
