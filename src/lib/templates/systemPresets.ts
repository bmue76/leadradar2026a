import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * ensureSystemPresets()
 * - seedet System-Vorlagen (tenantId=null, isPublic=true), aber überschreibt bestehende Datensätze NICHT.
 * - Seeds werden (wenn vorhanden) aus src/lib/systemTemplates.ts gelesen (mehrere mögliche Export-Namen).
 */

type SystemPresetSeed = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  config?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSeedArray(v: unknown): v is SystemPresetSeed[] {
  if (!Array.isArray(v)) return false;
  return v.every((x) => isRecord(x) && typeof x.id === "string" && x.id.trim() && typeof x.name === "string");
}

function normalizeCategory(v: string | null | undefined): string {
  const c = (v ?? "").trim();
  return c || "Standard";
}

function toInputJson(v: unknown): Prisma.InputJsonValue {
  return (v ?? {}) as Prisma.InputJsonValue;
}

async function getSeedsFromSystemTemplatesModule(): Promise<SystemPresetSeed[]> {
  const modUnknown: unknown = await import("@/lib/systemTemplates");
  const m = isRecord(modUnknown) ? modUnknown : {};

  const candidates: unknown[] = [
    m.SYSTEM_PRESET_SEEDS,
    m.SYSTEM_PRESETS,
    m.SYSTEM_TEMPLATES,
    m.SYSTEM_TEMPLATE_SEEDS,
    m.SYSTEM_TEMPLATE_PRESETS,
  ];

  for (const c of candidates) {
    if (isSeedArray(c)) return c;
  }

  return [];
}

let ensured: Promise<void> | null = null;

export async function ensureSystemPresets(): Promise<void> {
  if (ensured) return ensured;

  ensured = (async () => {
    const seeds = await getSeedsFromSystemTemplatesModule();

    // Wenn keine Seeds vorhanden sind, ist das OK (du seedest aktuell via Prisma Studio).
    if (!seeds.length) return;

    const ids = seeds.map((s) => s.id);

    const existing = await prisma.formPreset.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((x) => x.id));
    const missing = seeds.filter((s) => !existingIds.has(s.id));

    for (const seed of missing) {
      await prisma.formPreset.create({
        data: {
          id: seed.id,
          tenantId: null,
          isPublic: true,
          name: seed.name,
          category: normalizeCategory(seed.category),
          description: seed.description ?? null,
          imageUrl: seed.imageUrl ?? null,
          config: toInputJson(seed.config),
        },
      });
    }
  })();

  return ensured;
}
