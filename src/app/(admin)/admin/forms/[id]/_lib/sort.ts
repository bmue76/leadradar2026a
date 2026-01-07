import type { FormField } from "../formDetail.types";

export function sortFieldsStable(fields: FormField[]) {
  return [...fields].sort((a, b) => {
    const ao = typeof a.sortOrder === "number" ? a.sortOrder : 0;
    const bo = typeof b.sortOrder === "number" ? b.sortOrder : 0;
    if (ao !== bo) return ao - bo;
    return (a.label || "").localeCompare(b.label || "");
  });
}

export function normalizeOrder(order: string[], fields: { id: string }[]) {
  const existing = new Set(fields.map((f) => f.id));
  const out: string[] = [];

  for (const id of order) {
    if (existing.has(id)) out.push(id);
  }
  for (const f of fields) {
    if (!out.includes(f.id)) out.push(f.id);
  }
  return out;
}
