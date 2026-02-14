"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type TemplateSource = "SYSTEM" | "TENANT";
type SortKey = "updated_desc" | "updated_asc" | "name_asc" | "name_desc";

type UiTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  source: TemplateSource;
  updatedAt: string | null;
  createdAt: string | null;
  fieldsCount?: number | null;
};

type ApiOk = { ok: true; data: unknown; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp = ApiOk | ApiErr;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function toStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function isTemplateSource(v: string): v is TemplateSource {
  return v === "SYSTEM" || v === "TENANT";
}
function isSortKey(v: string): v is SortKey {
  return v === "updated_desc" || v === "updated_asc" || v === "name_asc" || v === "name_desc";
}

function toSource(v: unknown): TemplateSource {
  if (v === "SYSTEM" || v === "TENANT") return v;
  if (isRecord(v)) {
    const isPublic = v.isPublic;
    if (typeof isPublic === "boolean" && isPublic) return "SYSTEM";
  }
  return "TENANT";
}

function normalizeTemplateListPayload(dto: unknown): UiTemplate[] {
  const raw =
    Array.isArray(dto)
      ? dto
      : isRecord(dto) && Array.isArray(dto.templates)
      ? dto.templates
      : isRecord(dto) && Array.isArray(dto.data)
      ? dto.data
      : [];

  const out: UiTemplate[] = [];
  for (const it of raw) {
    if (!isRecord(it)) continue;
    const id = toStr(it.id);
    const name = toStr(it.name) ?? toStr(it.title) ?? toStr(it.label);
    if (!id || !name) continue;

    const description = toStr(it.description) ?? toStr(it.subtitle) ?? null;
    const category = toStr(it.category) ?? null;
    const updatedAt = toStr(it.updatedAt) ?? null;
    const createdAt = toStr(it.createdAt) ?? null;
    const source = toSource(it.source ?? it);

    let fieldsCount: number | null | undefined = undefined;
    const fc = it.fieldsCount ?? it.fieldCount ?? it.fields_count;
    if (typeof fc === "number" && Number.isFinite(fc)) fieldsCount = fc;
    if (fieldsCount === undefined && isRecord(it.config) && Array.isArray(it.config.fields)) fieldsCount = it.config.fields.length;

    out.push({ id, name, description, category, source, updatedAt, createdAt, fieldsCount });
  }
  return out;
}

function normalizeTemplateDetailPayload(dto: unknown): UiTemplate | null {
  const raw = isRecord(dto) && isRecord(dto.template) ? dto.template : dto;
  if (!isRecord(raw)) return null;

  const id = toStr(raw.id);
  const name = toStr(raw.name) ?? toStr(raw.title) ?? toStr(raw.label);
  if (!id || !name) return null;

  const description = toStr(raw.description) ?? toStr(raw.subtitle) ?? null;
  const category = toStr(raw.category) ?? null;
  const updatedAt = toStr(raw.updatedAt) ?? null;
  const createdAt = toStr(raw.createdAt) ?? null;
  const source = toSource(raw.source ?? raw);

  let fieldsCount: number | null | undefined = undefined;
  const fc = raw.fieldsCount ?? raw.fieldCount ?? raw.fields_count;
  if (typeof fc === "number" && Number.isFinite(fc)) fieldsCount = fc;
  if (fieldsCount === undefined && isRecord(raw.config) && Array.isArray(raw.config.fields)) fieldsCount = raw.config.fields.length;

  return { id, name, description, category, source, updatedAt, createdAt, fieldsCount };
}

function fmtDateCH(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("de-CH", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function sourceLabel(s: TemplateSource): string {
  return s === "SYSTEM" ? "System" : "Mandant";
}

function sortLabel(v: SortKey): string {
  switch (v) {
    case "updated_desc":
      return "Zuletzt geändert";
    case "updated_asc":
      return "Älteste Änderung";
    case "name_asc":
      return "Name A–Z";
    case "name_desc":
      return "Name Z–A";
    default:
      return "Zuletzt geändert";
  }
}

function applyClientSort(items: UiTemplate[], sort: SortKey): UiTemplate[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sort === "name_asc" || sort === "name_desc") {
      const an = a.name.toLowerCase();
      const bn = b.name.toLowerCase();
      if (an < bn) return sort === "name_asc" ? -1 : 1;
      if (an > bn) return sort === "name_asc" ? 1 : -1;
      return 0;
    }
    const ad = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bd = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return sort === "updated_desc" ? bd - ad : ad - bd;
  });
  return copy;
}

function applyClientFilter(items: UiTemplate[], q: string, category: string, source: "ALL" | TemplateSource): UiTemplate[] {
  const needle = q.trim().toLowerCase();
  return items.filter((t) => {
    if (source !== "ALL" && t.source !== source) return false;
    const cat = t.category ?? "Ohne Kategorie";
    if (category !== "ALL" && cat !== category) return false;
    if (!needle) return true;
    const hay = `${t.name} ${t.description ?? ""} ${t.category ?? ""}`.toLowerCase();
    return hay.includes(needle);
  });
}

async function fetchJson(url: string, init?: RequestInit): Promise<ApiResp> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const traceId = res.headers.get("x-trace-id") ?? "";
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // ignore
  }

  if (isRecord(json) && typeof json.ok === "boolean") {
    if (json.ok === true) {
      return { ok: true, data: json.data, traceId: (toStr(json.traceId) ?? traceId) || traceId || "—" };
    }
    const errObj = isRecord(json.error) ? json.error : { code: "UNKNOWN", message: "Unbekannter Fehler" };
    return {
      ok: false,
      error: {
        code: toStr(errObj.code) ?? "UNKNOWN",
        message: toStr(errObj.message) ?? "Unbekannter Fehler",
        details: errObj.details,
      },
      traceId: (toStr(json.traceId) ?? traceId) || traceId || "—",
    };
  }

  if (res.ok) return { ok: true, data: json, traceId: traceId || "—" };
  return { ok: false, error: { code: "HTTP_ERROR", message: "Konnte Daten nicht laden." }, traceId: traceId || "—" };
}

/* ----------------------------- Mini Modal (clean) ----------------------------- */

function ModalShell(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="text-base font-semibold text-slate-900">{props.title}</div>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
              onClick={props.onClose}
              aria-label="Schliessen"
            >
              ✕
            </button>
          </div>
          <div className="px-5 py-4">{props.children}</div>
        </div>
      </div>
    </div>
  );
}

function Pill(props: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{props.children}</span>;
}

function Button(props: {
  label: string;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const kind = props.kind ?? "primary";
  const base =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition ring-1 ring-inset disabled:cursor-not-allowed disabled:opacity-60";
  const cls =
    kind === "primary"
      ? `${base} bg-slate-900 text-white ring-slate-900 hover:bg-slate-800`
      : kind === "secondary"
      ? `${base} bg-white text-slate-900 ring-slate-300 hover:bg-slate-50`
      : `${base} bg-transparent text-slate-700 ring-transparent hover:bg-slate-100`;
  return (
    <button type={props.type ?? "button"} className={cls} onClick={props.onClick} disabled={props.disabled}>
      {props.label}
    </button>
  );
}

function InlineError(props: { title: string; message: string; traceId?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <div className="text-sm font-semibold text-rose-900">{props.title}</div>
      <div className="mt-1 text-sm text-rose-800">{props.message}</div>
      {props.traceId ? <div className="mt-2 text-xs text-rose-700">Trace: {props.traceId}</div> : null}
      {props.onRetry ? (
        <div className="mt-3">
          <Button label="Erneut versuchen" kind="secondary" onClick={props.onRetry} />
        </div>
      ) : null}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-4 w-56 animate-pulse rounded bg-slate-200" />
      <div className="ml-auto h-4 w-24 animate-pulse rounded bg-slate-200" />
    </div>
  );
}

/* --------------------------------- Screen --------------------------------- */

export function TemplatesScreenClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const intent = sp.get("intent") ?? "";
  const isCreateIntent = intent === "create";

  const [q, setQ] = useState("");
  const [source, setSource] = useState<"ALL" | TemplateSource>("ALL");
  const [category, setCategory] = useState<string>("ALL");
  const [sort, setSort] = useState<SortKey>("updated_desc");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<{ message: string; code?: string; traceId?: string } | null>(null);
  const [itemsRaw, setItemsRaw] = useState<UiTemplate[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<{ message: string; code?: string; traceId?: string } | null>(null);
  const [detail, setDetail] = useState<UiTemplate | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);

  // Init state from URL once (nice for sharing links)
  useEffect(() => {
    const iq = sp.get("q") ?? "";
    const isrc = sp.get("source") ?? "";
    const icat = sp.get("category") ?? "";
    const isort = sp.get("sort") ?? "";

    if (iq) setQ(iq);
    if (isTemplateSource(isrc)) setSource(isrc);
    if (icat) setCategory(icat);
    if (isSortKey(isort)) setSort(isort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional: only once on mount

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const it of itemsRaw) set.add(it.category ?? "Ohne Kategorie");
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b, "de-CH"))];
  }, [itemsRaw]);

  const filtered = useMemo(() => {
    const list = applyClientFilter(itemsRaw, q, category, source);
    return applyClientSort(list, sort);
  }, [itemsRaw, q, category, source, sort]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return filtered.find((x) => x.id === selectedId) ?? itemsRaw.find((x) => x.id === selectedId) ?? null;
  }, [selectedId, filtered, itemsRaw]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setErr(null);

    const usp = new URLSearchParams();
    if (q.trim()) usp.set("q", q.trim());
    if (source !== "ALL") usp.set("source", source);
    if (category !== "ALL") usp.set("category", category);
    usp.set("sort", sort);

    const url = `/api/admin/v1/templates?${usp.toString()}`;

    try {
      const r = await fetchJson(url, { method: "GET" });
      if (!r.ok) {
        setItemsRaw([]);
        setErr({ message: r.error.message || "Konnte Vorlagen nicht laden.", code: r.error.code, traceId: r.traceId });
        return;
      }

      const list = normalizeTemplateListPayload(r.data);
      setItemsRaw(list);

      // auto-select first if none
      if (list.length > 0) setSelectedId((prev) => prev ?? list[0].id);

      // keep category valid
      setCategory((prev) => {
        if (prev === "ALL") return prev;
        const exists = list.some((x) => (x.category ?? "Ohne Kategorie") === prev);
        return exists ? prev : "ALL";
      });
    } catch {
      setItemsRaw([]);
      setErr({ message: "Konnte Vorlagen nicht laden. Bitte erneut versuchen." });
    } finally {
      setLoading(false);
    }
  }, [q, source, category, sort]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailErr(null);
    setDetail(null);
    try {
      const r = await fetchJson(`/api/admin/v1/templates/${id}`, { method: "GET" });
      if (!r.ok) {
        setDetailErr({ message: r.error.message || "Konnte Vorlage nicht laden.", code: r.error.code, traceId: r.traceId });
        return;
      }
      setDetail(normalizeTemplateDetailPayload(r.data));
    } catch {
      setDetailErr({ message: "Konnte Vorlage nicht laden. Bitte erneut versuchen." });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openCreateFromSelected = useCallback(() => {
    if (!selected) return;
    setCreateErr(null);
    setCreateName(selected.name);
    setCreateOpen(true);
  }, [selected]);

  const doCreate = useCallback(async () => {
    if (!selected) return;
    const name = createName.trim();
    if (!name) {
      setCreateErr("Bitte gib einen Formularnamen ein.");
      return;
    }

    setCreateBusy(true);
    setCreateErr(null);

    try {
      const r = await fetchJson(`/api/admin/v1/templates/${selected.id}/create-form`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!r.ok) {
        setCreateErr(r.error.message || "Formular konnte nicht erstellt werden.");
        return;
      }

      const data = r.data;
      let formId: string | null = null;
      if (isRecord(data)) {
        formId = toStr(data.formId) ?? toStr(data.id) ?? (isRecord(data.form) ? toStr(data.form.id) : null);
      }
      if (!formId) {
        setCreateErr("Formular wurde erstellt, aber die ID fehlt in der Antwort (API-Contract).");
        return;
      }

      setCreateOpen(false);
      router.push(`/admin/forms/${formId}/builder`);
    } catch {
      setCreateErr("Formular konnte nicht erstellt werden. Bitte erneut versuchen.");
    } finally {
      setCreateBusy(false);
    }
  }, [selected, createName, router]);

  // initial load
  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  // debounce reload + keep URL in sync
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void loadTemplates();

      const usp = new URLSearchParams();
      if (isCreateIntent) usp.set("intent", "create");
      if (q.trim()) usp.set("q", q.trim());
      if (source !== "ALL") usp.set("source", source);
      if (category !== "ALL") usp.set("category", category);
      usp.set("sort", sort);

      router.replace(`/admin/templates?${usp.toString()}`);
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, source, category, sort, isCreateIntent, router, loadTemplates]);

  useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const leftCountLabel = filtered.length === 1 ? "1 Vorlage" : `${filtered.length} Vorlagen`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px]">
      {/* LEFT */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          {isCreateIntent ? (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Formular vorbereiten:</span> Wähle links eine Vorlage aus und klicke rechts auf{" "}
              <span className="font-medium">„Vorlage verwenden“</span>.
            </div>
          ) : null}

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-700">Suche</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Vorlagen suchen…"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400"
              />
            </div>

            <div className="min-w-[180px]">
              <label className="text-xs font-semibold text-slate-700">Kategorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value || "ALL")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                aria-label="Kategorie"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "ALL" ? "Alle" : c}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[160px]">
              <label className="text-xs font-semibold text-slate-700">Quelle</label>
              <select
                value={source}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "ALL") setSource("ALL");
                  else if (isTemplateSource(v)) setSource(v);
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                aria-label="Quelle"
              >
                <option value="ALL">Alle</option>
                <option value="TENANT">Mandant</option>
                <option value="SYSTEM">System</option>
              </select>
            </div>

            <div className="min-w-[190px]">
              <label className="text-xs font-semibold text-slate-700">Sortierung</label>
              <select
                value={sort}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isSortKey(v)) setSort(v);
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                aria-label="Sortierung"
              >
                <option value="updated_desc">{sortLabel("updated_desc")}</option>
                <option value="updated_asc">{sortLabel("updated_asc")}</option>
                <option value="name_asc">{sortLabel("name_asc")}</option>
                <option value="name_desc">{sortLabel("name_desc")}</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-slate-500">{loading ? "Lade…" : leftCountLabel}</div>
            <Button label="Aktualisieren" kind="secondary" onClick={() => void loadTemplates()} disabled={loading} />
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : err ? (
            <div className="p-4">
              <InlineError
                title="Konnte Vorlagen nicht laden"
                message={err.message}
                traceId={err.traceId}
                onRetry={() => void loadTemplates()}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <div className="text-sm font-semibold text-slate-900">Keine Vorlagen</div>
              <div className="mt-1 text-sm text-slate-600">
                Lege Vorlagen im Mandanten an (im Builder: „Als Vorlage speichern“) oder passe Filter an.
              </div>
              <div className="mt-4 flex gap-2">
                <Button label="Zu Formularen" kind="secondary" onClick={() => router.push("/admin/forms")} />
                <Button
                  label="Filter zurücksetzen"
                  kind="ghost"
                  onClick={() => {
                    setQ("");
                    setSource("ALL");
                    setCategory("ALL");
                    setSort("updated_desc");
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              {filtered.map((t) => {
                const active = t.id === selectedId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={["w-full text-left px-4 py-3 transition", active ? "bg-slate-50" : "bg-white hover:bg-slate-50"].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">{t.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <Pill>{t.category ?? "Ohne Kategorie"}</Pill>
                          <Pill>{sourceLabel(t.source)}</Pill>
                          {typeof t.fieldsCount === "number" ? <Pill>{t.fieldsCount} Felder</Pill> : null}
                        </div>
                        {t.description ? <div className="mt-1 line-clamp-2 text-sm text-slate-600">{t.description}</div> : null}
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-xs text-slate-500">Geändert</div>
                        <div className="text-xs font-medium text-slate-700">{fmtDateCH(t.updatedAt)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-900">Details</div>
          <div className="mt-1 text-xs text-slate-500">Wähle links eine Vorlage aus.</div>
        </div>

        <div className="p-4">
          {!selectedId ? (
            <div className="text-sm text-slate-600">Keine Vorlage ausgewählt.</div>
          ) : detailLoading ? (
            <div className="space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-56 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
            </div>
          ) : detailErr ? (
            <InlineError
              title="Konnte Vorlage nicht laden"
              message={detailErr.message}
              traceId={detailErr.traceId}
              onRetry={() => selectedId && void loadDetail(selectedId)}
            />
          ) : (
            <>
              <div className="text-base font-semibold text-slate-900">{detail?.name ?? selected?.name ?? "—"}</div>

              <div className="mt-2 flex flex-wrap gap-2">
                <Pill>{(detail?.category ?? selected?.category) ?? "Ohne Kategorie"}</Pill>
                <Pill>{sourceLabel(detail?.source ?? selected?.source ?? "TENANT")}</Pill>
                {typeof (detail?.fieldsCount ?? selected?.fieldsCount) === "number" ? (
                  <Pill>{detail?.fieldsCount ?? selected?.fieldsCount} Felder</Pill>
                ) : null}
              </div>

              {detail?.description ?? selected?.description ? (
                <div className="mt-3 text-sm text-slate-700">{detail?.description ?? selected?.description}</div>
              ) : (
                <div className="mt-3 text-sm text-slate-500">Keine Beschreibung.</div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div>
                  <div className="text-slate-500">Erstellt</div>
                  <div className="font-medium text-slate-800">{fmtDateCH(detail?.createdAt ?? selected?.createdAt ?? null)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Geändert</div>
                  <div className="font-medium text-slate-800">{fmtDateCH(detail?.updatedAt ?? selected?.updatedAt ?? null)}</div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <Button label="Vorlage verwenden" onClick={openCreateFromSelected} disabled={!selected} />
                <Button label="Neu laden" kind="secondary" onClick={() => selectedId && void loadDetail(selectedId)} disabled={!selectedId} />
              </div>

              {isCreateIntent ? (
                <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Tipp: Du kannst das Formular später jederzeit umbenennen und im Builder anpassen.
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Create modal */}
      <ModalShell open={createOpen} title="Formular aus Vorlage erstellen" onClose={() => (!createBusy ? setCreateOpen(false) : null)}>
        <div className="text-sm text-slate-600">Gib dem Formular einen Namen. Danach landest du direkt im Builder.</div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-700">Formularname</label>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="z.B. Messe Leads – Tag 1"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            disabled={createBusy}
          />
          {createErr ? <div className="mt-2 text-sm text-rose-700">{createErr}</div> : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button label="Abbrechen" kind="secondary" onClick={() => setCreateOpen(false)} disabled={createBusy} />
          <Button label={createBusy ? "Erstelle…" : "Erstellen"} onClick={() => void doCreate()} disabled={createBusy} />
        </div>
      </ModalShell>
    </div>
  );
}
