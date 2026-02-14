"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type TemplateSource = "SYSTEM" | "TENANT";
type SourceFilter = "ALL" | "SYSTEM" | "TENANT";
type SortKey = "updatedAt" | "name";
type SortDir = "asc" | "desc";

type TemplateItem = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  source: TemplateSource;
  fieldCount: number;
  updatedAt: string; // ISO
};

type ListResp = { items: TemplateItem[] };

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeJsonParse<T>(txt: string): T | null {
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function toIsoDateShort(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("de-CH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function normalizeLegacySort(rawSort: string | null): { sort: SortKey; dir: SortDir } {
  // legacy: updated_desc / updated_asc / name_desc / name_asc
  const s = (rawSort ?? "").trim();
  if (!s) return { sort: "updatedAt", dir: "desc" };

  const parts = s.split("_");
  if (parts.length === 2) {
    const [k, d] = parts;
    const dir: SortDir = d === "asc" ? "asc" : "desc";
    if (k === "name") return { sort: "name", dir };
    if (k === "updated" || k === "updatedAt") return { sort: "updatedAt", dir };
  }

  // new style
  if (s === "name") return { sort: "name", dir: "asc" };
  if (s === "updatedAt") return { sort: "updatedAt", dir: "desc" };

  return { sort: "updatedAt", dir: "desc" };
}

function pickSource(raw: string | null): SourceFilter {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "SYSTEM") return "SYSTEM";
  if (v === "TENANT") return "TENANT";
  return "ALL";
}

function pickSortKey(raw: string | null): SortKey {
  const v = (raw ?? "").trim();
  if (v === "name") return "name";
  return "updatedAt";
}

function pickDir(raw: string | null): SortDir {
  const v = (raw ?? "").trim();
  return v === "asc" ? "asc" : "desc";
}

function extractFormId(dto: unknown): string | null {
  if (!isRecord(dto)) return null;
  const direct = dto.formId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const id = dto.id;
  if (typeof id === "string" && id.trim()) return id.trim();

  const data = dto.data;
  if (isRecord(data)) {
    const fid = data.formId;
    if (typeof fid === "string" && fid.trim()) return fid.trim();
    const fid2 = data.id;
    if (typeof fid2 === "string" && fid2.trim()) return fid2.trim();
    const form = data.form;
    if (isRecord(form)) {
      const fid3 = form.id;
      if (typeof fid3 === "string" && fid3.trim()) return fid3.trim();
    }
  }
  return null;
}

function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-black/20" aria-label="Schliessen" onClick={props.onCancel} />
      <div className="absolute left-1/2 top-1/2 w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-6 py-4">
            <div className="text-sm font-semibold text-slate-900">{props.title}</div>
            {props.description ? <div className="mt-1 text-sm text-slate-600">{props.description}</div> : null}
          </div>
          <div className="flex items-center justify-end gap-2 px-6 py-4">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={props.onCancel}
              disabled={props.busy}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className={cx(
                "rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60",
                props.danger
                  ? "border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
                  : "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
              )}
              onClick={props.onConfirm}
              disabled={props.busy}
            >
              {props.confirmLabel ?? "Bestätigen"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesScreenClient() {
  const router = useRouter();
  const sp = useSearchParams();

  // --- URL state (robust defaults) ---
  const q = (sp.get("q") ?? "").trim();

  // category: allow "ALL" or empty
  const categoryRaw = (sp.get("category") ?? "").trim();
  const category = categoryRaw && categoryRaw !== "ALL" ? categoryRaw : "";

  // source: default ALL (important!)
  const source: SourceFilter = pickSource(sp.get("source"));

  // sort/dir: support legacy "sort=updated_desc"
  const legacy = normalizeLegacySort(sp.get("sort"));
  const sort: SortKey = sp.get("dir") ? pickSortKey(sp.get("sort")) : legacy.sort;
  const dir: SortDir = sp.get("dir") ? pickDir(sp.get("dir")) : legacy.dir;

  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<null | { kind: "error" | "success"; message: string }>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const deleteTarget = useMemo(() => items.find((x) => x.id === confirmDeleteId) ?? null, [items, confirmDeleteId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const c = (it.category ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());

      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }

      // normalize: always store modern sort/dir keys (avoid legacy)
      if (next.get("sort")?.includes("_")) {
        const n = normalizeLegacySort(next.get("sort"));
        next.set("sort", n.sort);
        next.set("dir", n.dir);
      } else {
        // if dir missing, inject default
        if (!next.get("sort")) next.set("sort", "updatedAt");
        if (!next.get("dir")) next.set("dir", "desc");
      }

      // IMPORTANT: default source ALL should be explicit to avoid weird UI defaults
      if (!next.get("source")) next.set("source", "ALL");

      const qs = next.toString();
      router.push(qs ? `/admin/templates?${qs}` : "/admin/templates");
    },
    [router, sp]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const qp = new URLSearchParams();
      if (q) qp.set("q", q);
      if (category) qp.set("category", category);
      if (source) qp.set("source", source);
      qp.set("sort", sort);
      qp.set("dir", dir);
      qp.set("take", "50");

      const res = await fetch(`/api/admin/v1/templates?${qp.toString()}`, { method: "GET", cache: "no-store" });
      const txt = await res.text();

      const json = safeJsonParse<ApiResp<ListResp>>(txt);

      if (!json || typeof json !== "object") {
        setError("Ungültige Serverantwort (non-JSON).");
        setLoading(false);
        return;
      }
      if (!json.ok) {
        setError(json.error?.message || "Konnte Vorlagen nicht laden.");
        setLoading(false);
        return;
      }

      setItems(Array.isArray(json.data.items) ? json.data.items : []);
      setLoading(false);
    } catch {
      setError("Konnte Vorlagen nicht laden.");
      setLoading(false);
    }
  }, [q, category, source, sort, dir]);

  useEffect(() => {
    // ensure URL has explicit modern defaults once
    if (!sp.get("source") || sp.get("sort")?.includes("_") || !sp.get("dir")) {
      setParam({
        source: sp.get("source") ? sp.get("source") : "ALL",
        sort: sp.get("sort"),
        dir: sp.get("dir"),
      });
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString()]);

  const onCreateFromTemplate = useCallback(
    async (templateId: string) => {
      setBusy(true);
      setToast(null);

      try {
        const res = await fetch(`/api/admin/v1/templates/${templateId}/create-form`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });

        const txt = await res.text();
        const json = safeJsonParse<ApiResp<unknown>>(txt);

        if (!json || typeof json !== "object") {
          setToast({ kind: "error", message: "Ungültige Serverantwort (non-JSON)." });
          setBusy(false);
          return;
        }
        if (!json.ok) {
          setToast({ kind: "error", message: json.error?.message || "Konnte Formular nicht erstellen." });
          setBusy(false);
          return;
        }

        const formId = extractFormId(json);
        if (!formId) {
          setToast({ kind: "error", message: "Serverantwort ohne formId." });
          setBusy(false);
          return;
        }

        setToast({ kind: "success", message: "Formular erstellt." });
        router.push(`/admin/forms/${formId}/builder`);
      } catch {
        setToast({ kind: "error", message: "Konnte Formular nicht erstellen." });
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  const onDeleteTemplate = useCallback(
    async (templateId: string) => {
      setBusy(true);
      setToast(null);

      try {
        // NOTE: Templates UI lists FormPreset rows; deletion is done via presets endpoint (tenant-scoped).
        const res = await fetch(`/api/admin/v1/presets/${templateId}`, { method: "DELETE" });
        const txt = await res.text();
        const json = safeJsonParse<ApiResp<{ deleted: boolean }>>(txt);

        if (!json || typeof json !== "object") {
          setToast({ kind: "error", message: "Ungültige Serverantwort (non-JSON)." });
          return;
        }
        if (!json.ok) {
          setToast({ kind: "error", message: json.error?.message || "Vorlage konnte nicht gelöscht werden." });
          return;
        }

        setToast({ kind: "success", message: "Vorlage gelöscht." });
        setConfirmDeleteId(null);
        await load();
      } catch {
        setToast({ kind: "error", message: "Vorlage konnte nicht gelöscht werden." });
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  return (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        title="Vorlage löschen?"
        description={
          deleteTarget
            ? `„${deleteTarget.name}“ wird gelöscht. Dieser Schritt kann nicht rückgängig gemacht werden.`
            : undefined
        }
        confirmLabel="Löschen"
        danger
        busy={busy}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          void onDeleteTemplate(deleteTarget.id);
        }}
      />

      {toast ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className={cx("text-sm font-semibold", toast.kind === "error" ? "text-rose-900" : "text-emerald-900")}>
            {toast.kind === "error" ? "Fehler" : "OK"}
          </div>
          <div className={cx("mt-1 text-sm", toast.kind === "error" ? "text-rose-800" : "text-emerald-800")}>
            {toast.message}
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white">
        {/* Toolbar */}
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="h-9 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 text-sm"
              placeholder="Suchen (Name)…"
              value={q}
              onChange={(e) => setParam({ q: e.target.value.trim() ? e.target.value : "" })}
            />

            <select
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={source}
              onChange={(e) => setParam({ source: e.target.value })}
              title="Quelle"
            >
              <option value="ALL">Alle</option>
              <option value="TENANT">Eigene</option>
              <option value="SYSTEM">System</option>
            </select>

            <select
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={category ? category : "ALL"}
              onChange={(e) => setParam({ category: e.target.value === "ALL" ? "" : e.target.value })}
              title="Kategorie"
            >
              <option value="ALL">Alle Kategorien</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={sort}
              onChange={(e) => setParam({ sort: e.target.value })}
              title="Sortierung"
            >
              <option value="updatedAt">Zuletzt geändert</option>
              <option value="name">Name</option>
            </select>

            <button
              type="button"
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setParam({ dir: dir === "asc" ? "desc" : "asc" })}
              title="Richtung"
            >
              {dir === "asc" ? "↑" : "↓"}
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={() => void load()}
                disabled={loading || busy}
              >
                Aktualisieren
              </button>
              <Link
                className="h-9 rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                href="/admin/forms"
              >
                Zu Formularen
              </Link>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-slate-200" />

        {/* Content */}
        {loading ? (
          <div className="p-6">
            <div className="h-5 w-52 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-10 w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-10 w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-10 w-full animate-pulse rounded bg-slate-100" />
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <div className="text-sm font-semibold text-rose-900">Konnte Vorlagen nicht laden</div>
              <div className="mt-1 text-sm text-rose-800">{error}</div>
              <div className="mt-3">
                <button
                  type="button"
                  className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                  onClick={() => void load()}
                  disabled={busy}
                >
                  Erneut versuchen
                </button>
              </div>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-sm font-semibold text-slate-900">Noch keine Vorlagen</div>
              <div className="mt-1 text-sm text-slate-600">
                Öffne ein Formular im Builder und nutze <span className="font-semibold">„Als Vorlage speichern“</span>.
              </div>
              <div className="mt-3">
                <Link
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  href="/admin/forms"
                >
                  Formulare öffnen
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <table className="w-full table-auto">
              <thead className="text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="py-2">Name</th>
                  <th className="py-2">Kategorie</th>
                  <th className="py-2">Quelle</th>
                  <th className="py-2">Felder</th>
                  <th className="py-2">Aktualisiert</th>
                  <th className="py-2 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-3">
                      <div className="text-sm font-semibold text-slate-900">{it.name}</div>
                      {it.description ? <div className="mt-0.5 text-xs text-slate-500">{it.description}</div> : null}
                    </td>
                    <td className="py-3 text-sm text-slate-700">{it.category ?? "—"}</td>
                    <td className="py-3 text-sm text-slate-700">{it.source === "SYSTEM" ? "System" : "Eigen"}</td>
                    <td className="py-3 text-sm text-slate-700">{String(it.fieldCount ?? 0)}</td>
                    <td className="py-3 text-sm text-slate-700">{toIsoDateShort(it.updatedAt)}</td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {it.source === "TENANT" ? (
                          <button
                            type="button"
                            className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            title="Vorlage löschen"
                            aria-label="Vorlage löschen"
                            disabled={busy}
                            onClick={() => setConfirmDeleteId(it.id)}
                          >
                            🗑
                          </button>
                        ) : null}

                        <button
                          type="button"
                          className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => void onCreateFromTemplate(it.id)}
                        >
                          Verwenden
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 text-xs text-slate-500">
              Hinweis: System-Vorlagen sind schreibgeschützt (kein Löschen möglich).
            </div>
          </div>
        )}
      </section>
    </>
  );
}
