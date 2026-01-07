type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseOptions(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const opts = config.options;
  if (!Array.isArray(opts)) return [];
  return opts.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
}

export function parseCheckboxDefault(config: unknown): boolean {
  if (!isRecord(config)) return false;
  const v = config.defaultValue;
  return typeof v === "boolean" ? v : Boolean(v);
}
