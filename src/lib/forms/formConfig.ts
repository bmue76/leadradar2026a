import { z } from "zod";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Expected 6-digit hex color like #AABBCC");

export const UiHeaderV1Schema = z
  .object({
    title: z.string().trim().max(200).optional(),
    subtitle: z.string().trim().max(200).optional(),
  })
  .strict();

export const UiLayoutV1Schema = z
  .object({
    density: z.enum(["comfortable", "compact"]).optional(),
  })
  .strict();

export const UiConfigV1Schema = z
  .object({
    version: z.literal(1),
    accentColor: HexColorSchema.optional(),
    header: UiHeaderV1Schema.optional(),
    layout: UiLayoutV1Schema.optional(),
  })
  .strict();

export type UiConfigV1 = z.infer<typeof UiConfigV1Schema>;

function pickUiCandidate(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) return {};
  const ui = input.ui;
  if (isRecord(ui)) return ui;
  return {};
}

function pickString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

function pickAccentColor(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  const res = HexColorSchema.safeParse(s);
  if (!res.success) return undefined;
  return res.data;
}

export function normalizeUiConfigV1(inputConfig: unknown, opts?: { tenantAccentColor?: string | null }): UiConfigV1 {
  const cand = pickUiCandidate(inputConfig);

  const headerTitle = pickString(cand.header && isRecord(cand.header) ? (cand.header as Record<string, unknown>).title : undefined, 200);
  const headerSubtitle = pickString(
    cand.header && isRecord(cand.header) ? (cand.header as Record<string, unknown>).subtitle : undefined,
    200
  );

  const densityRaw =
    cand.layout && isRecord(cand.layout) ? (cand.layout as Record<string, unknown>).density : undefined;

  const density =
    densityRaw === "comfortable" || densityRaw === "compact" ? (densityRaw as "comfortable" | "compact") : undefined;

  const accentFromForm = pickAccentColor(cand.accentColor);
  const accentFromTenant = pickAccentColor(opts?.tenantAccentColor ?? undefined);

  const out: UiConfigV1 = {
    version: 1,
    ...(accentFromForm ? { accentColor: accentFromForm } : accentFromTenant ? { accentColor: accentFromTenant } : {}),
    ...(headerTitle || headerSubtitle ? { header: { ...(headerTitle ? { title: headerTitle } : {}), ...(headerSubtitle ? { subtitle: headerSubtitle } : {}) } } : {}),
    ...(density ? { layout: { density } } : {}),
  };

  return out;
}

export function templateConfigFromFormConfig(inputConfig: unknown, opts?: { tenantAccentColor?: string | null }): { ui: UiConfigV1 } {
  return { ui: normalizeUiConfigV1(inputConfig, opts) };
}
