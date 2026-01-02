/**
 * Minimal CSV helper (MVP) for Excel-compatible exports.
 * - Default delimiter: ';' (CH-friendly)
 * - UTF-8 BOM prepended by caller (optional but recommended for Excel)
 */
export function csvEscape(value: unknown, delimiter = ";"): string {
  if (value === null || value === undefined) return "";

  const s = typeof value === "string" ? value : String(value);

  // Normalize line breaks to \n (CSV readers handle it; we quote anyway if needed)
  const normalized = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const mustQuote =
    normalized.includes('"') ||
    normalized.includes("\n") ||
    normalized.includes(delimiter);

  if (!mustQuote) return normalized;

  // Escape quotes by doubling them
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function csvLine(values: unknown[], delimiter = ";"): string {
  return values.map((v) => csvEscape(v, delimiter)).join(delimiter);
}

export function withUtf8Bom(text: string): string {
  // Excel (especially on Windows) often benefits from BOM to detect UTF-8 reliably.
  return "\ufeff" + text;
}
