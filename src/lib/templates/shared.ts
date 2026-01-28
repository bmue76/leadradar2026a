export type TemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  imageKey: string | null;
  updatedAt: string; // ISO
};

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function readBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

/**
 * Flexible Template-Meta-Erkennung, weil wir kein eigenes Template-Model haben
 * und historisch mehrere Keys möglich sind.
 */
export function readTemplateMeta(config: unknown): {
  isTemplate: boolean;
  category: string | null;
  imageKey: string | null;
} {
  if (!isRecord(config)) return { isTemplate: false, category: null, imageKey: null };

  // direkte Flags
  const directIsTemplate =
    readBool(config.isTemplate) ??
    readBool(config.asTemplate) ??
    readBool(config.templateEnabled) ??
    null;

  const directCategory =
    readString(config.category) ??
    readString(config.templateCategory) ??
    readString(config.presetCategory) ??
    null;

  const directImageKey =
    readString(config.imageKey) ??
    readString(config.templateImageKey) ??
    readString(config.presetImageKey) ??
    null;

  // nested template object
  const tpl = config.template;
  if (isRecord(tpl)) {
    const nestedIsTemplate =
      readBool(tpl.isTemplate) ??
      readBool(tpl.enabled) ??
      readBool(tpl.isEnabled) ??
      readBool(tpl.public) ??
      readBool(tpl.isPublic) ??
      null;

    const nestedCategory =
      readString(tpl.category) ??
      readString(tpl.templateCategory) ??
      null;

    const nestedImageKey =
      readString(tpl.imageKey) ??
      readString(tpl.templateImageKey) ??
      null;

    return {
      isTemplate: Boolean(directIsTemplate ?? nestedIsTemplate ?? false),
      category: nestedCategory ?? directCategory ?? null,
      imageKey: nestedImageKey ?? directImageKey ?? null,
    };
  }

  return {
    isTemplate: Boolean(directIsTemplate ?? false),
    category: directCategory ?? null,
    imageKey: directImageKey ?? null,
  };
}

/**
 * Entfernt Template-Meta aus Form.config, wenn wir ein "normales" Form aus einem Template erzeugen.
 * (Wir strippen bewusst nur Template-Keys, der Rest bleibt unverändert.)
 */
export function stripTemplateMeta(config: unknown): unknown {
  if (config === null || config === undefined) return config;
  if (!isRecord(config)) return config;

  // JSON-safe clone (Prisma Json ist serialisierbar)
  const cloned = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

  delete cloned.isTemplate;
  delete cloned.asTemplate;
  delete cloned.templateEnabled;
  delete cloned.templateCategory;
  delete cloned.presetCategory;
  delete cloned.templateImageKey;
  delete cloned.presetImageKey;
  delete cloned.imageKey;

  if (isRecord(cloned.template)) {
    const t = cloned.template as Record<string, unknown>;
    delete t.isTemplate;
    delete t.enabled;
    delete t.isEnabled;
    delete t.public;
    delete t.isPublic;
    delete t.category;
    delete t.templateCategory;
    delete t.imageKey;
    delete t.templateImageKey;

    // wenn template leer wurde, weg damit
    if (Object.keys(t).length === 0) delete cloned.template;
  }

  return cloned;
}
